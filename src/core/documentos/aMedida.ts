import { analizar } from "../analisis/analizador";
import { SKILLS, findMentions } from "../analisis/habilidades";
import { detectarIdioma, enOtroIdioma, prep } from "../analisis/texto";
import type { PerfilJson, Trabajo } from "../perfil/estructurado";
import { fechaDeInicio, type Respuestas } from "../perfil/respuestas";

export type IdiomaDoc = "es" | "en";

export interface OfertaParaDocs {
  titulo: string;
  empresa: string;
  texto: string;
  /** Proyecto freelance: lo que importa es la propuesta, no la carta. */
  tipo?: "proyecto";
}

export interface DocumentosAMedida {
  idioma: IdiomaDoc;
  /** El mismo perfil, reordenado para esta vacante. Nunca agrega nada que no esté en el perfil. */
  cv: PerfilJson;
  /** Habilidades que pide la vacante y sí tienes, de la más a la menos importante. */
  enfasis: string[];
  /** Lo que pide y no aparece en tu CV: no se agrega solo, se muestra para que decidas. */
  brechas: string[];
  transferibles: { pide: string; tienes: string }[];
  carta: string;
  /** Para proyectos freelance: corta, centrada en el cliente y sin datos de contacto (las plataformas lo prohíben). */
  propuesta: string;
}

/** Puerto para quien redacte los documentos: hoy la versión local; mañana, una con IA que cumpla el mismo contrato. */
export interface Redactor {
  preparar(perfil: PerfilJson, oferta: OfertaParaDocs, respuestas: Respuestas, ahora: Date): Promise<DocumentosAMedida>;
}

// ---------------------------------------------------------------------------------------------------------------
// Utilidades

/** Texto plano del perfil, para analizarlo como si fuera el CV. */
export function perfilATexto(p: PerfilJson): string {
  const b = p.basics;
  return [
    b.name,
    b.label,
    b.summary,
    ...p.work.flatMap((w) => [[w.position, w.name].filter(Boolean).join(" — "), w.summary ?? "", ...w.highlights.map((h) => `- ${h}`)]),
    ...p.education.map((e) => [e.studyType, e.area, e.institution].filter(Boolean).join(" ")),
    ...p.skills.map((s) => `${s.name}: ${s.keywords.join(", ")}`),
    ...p.languages.map((l) => `${l.language}${l.fluency ? ` ${l.fluency}` : ""}`),
    ...p.certificates.map((c) => c.name),
    ...p.projects.map((pr) => `${pr.name} ${pr.description ?? ""}`),
  ]
    .filter(Boolean)
    .join("\n");
}

const PALABRA = /[\p{L}\p{N}][\p{L}\p{N}+#.-]{4,}/gu;

/** Qué tan relacionado está un logro con la vacante: habilidades que menciona (con su peso) y palabras en común. */
function relevancia(texto: string, pesos: Map<string, number>, palabrasOferta: Set<string>): number {
  const { orig, folded } = prep(texto);
  let r = 0;
  for (const skill of SKILLS) {
    const peso = pesos.get(skill.id);
    if (peso && findMentions(folded, orig, skill).length) r += peso;
  }
  for (const w of folded.match(PALABRA) ?? []) if (palabrasOferta.has(w)) r += 0.15;
  // Los logros con números («reduje 40%», «2M de usuarios») pesan un poco más: demuestran impacto.
  if (/\d/.test(texto)) r += 0.3;
  return r;
}

function lista(items: string[], idioma: IdiomaDoc): string {
  if (items.length <= 1) return items.join("");
  const y = idioma === "es" ? " y " : " and ";
  return `${items.slice(0, -1).join(", ")}${y}${items[items.length - 1]}`;
}

function frase(s: string): string {
  const t = s.trim().replace(/[.;:]+$/, "");
  return t ? `${t.charAt(0).toLowerCase()}${t.slice(1)}` : t;
}

// ---------------------------------------------------------------------------------------------------------------
// CV a la medida

const MAX_LOGROS_RECIENTES = 6;
const MAX_LOGROS_ANTERIORES = 4;

function reordenarTrabajo(w: Trabajo, i: number, pesos: Map<string, number>, palabras: Set<string>): Trabajo {
  const ordenados = w.highlights
    .map((h, k) => ({ h, k, r: relevancia(h, pesos, palabras) }))
    .sort((a, b) => b.r - a.r || a.k - b.k)
    .map((x) => x.h);
  return { ...w, highlights: ordenados.slice(0, i < 2 ? MAX_LOGROS_RECIENTES : MAX_LOGROS_ANTERIORES) };
}

function resumenAMedida(p: PerfilJson, enfasis: string[], anios: number | undefined, idioma: IdiomaDoc): string | undefined {
  const quien = p.basics.label ?? (idioma === "es" ? "Profesional" : "Professional");
  const top = enfasis.slice(0, 4);
  const exp =
    anios && anios > 0
      ? idioma === "es"
        ? ` con ${anios} año${anios === 1 ? "" : "s"} de experiencia`
        : ` with ${anios} year${anios === 1 ? "" : "s"} of experience`
      : "";
  const en = top.length ? (idioma === "es" ? ` en ${lista(top, idioma)}` : ` in ${lista(top, idioma)}`) : "";
  const primera = `${quien}${exp}${en}.`;
  const propio = p.basics.summary?.trim();
  // El resumen propio se conserva completo; la primera línea solo pone al frente lo que busca esta vacante.
  if (propio) return `${primera} ${propio}`;
  return top.length || exp ? primera : undefined;
}

// ---------------------------------------------------------------------------------------------------------------
// Carta

const DISPONIBILIDAD: Record<IdiomaDoc, Record<string, string>> = {
  es: { inmediata: "de inmediato", "2-semanas": "en dos semanas", "1-mes": "en un mes" },
  en: { inmediata: "immediately", "2-semanas": "in two weeks", "1-mes": "in a month" },
};

interface ContextoCarta {
  idioma: IdiomaDoc;
  enfasis: string[];
  transferibles: DocumentosAMedida["transferibles"];
  anios: number | undefined;
  respuestas: Respuestas;
  ahora: Date;
  cvMismoIdioma: boolean;
  pesos: Map<string, number>;
  palabras: Set<string>;
}

/** Los dos logros del CV más relevantes para la oferta; ninguno si el CV está en otro idioma que el documento. */
function logrosRelevantes(p: PerfilJson, c: ContextoCarta): { h: string; donde?: string }[] {
  if (!c.cvMismoIdioma) return [];
  return p.work
    .flatMap((w) => w.highlights.map((h) => ({ h, donde: w.name, r: relevancia(h, c.pesos, c.palabras) })))
    .filter((x) => x.r > 0.3 && !enOtroIdioma(x.h, c.idioma))
    .sort((a, b) => b.r - a.r)
    .slice(0, 2);
}

function carta(p: PerfilJson, o: OfertaParaDocs, c: ContextoCarta): string {
  const b = p.basics;
  const es = c.idioma === "es";
  const partes: string[] = [es ? `Hola, equipo de ${o.empresa}:` : `Hi ${o.empresa} team,`];

  const top = c.enfasis.slice(0, 3);
  const exp = c.anios && c.anios > 0 ? (es ? `${c.anios} año${c.anios === 1 ? "" : "s"} de experiencia` : `${c.anios} year${c.anios === 1 ? "" : "s"} of experience`) : "";
  let intro = es ? `Me interesa mucho la vacante de ${o.titulo}.` : `I'm excited to apply for the ${o.titulo} role.`;
  if (exp && top.length) intro += es ? ` Tengo ${exp} trabajando con ${lista(top, c.idioma)}.` : ` I bring ${exp} working with ${lista(top, c.idioma)}.`;
  else if (top.length) intro += es ? ` Tengo experiencia directa con ${lista(top, c.idioma)}.` : ` I have hands-on experience with ${lista(top, c.idioma)}.`;
  partes.push(intro);

  const logros = logrosRelevantes(p, c);
  if (logros.length) {
    partes.push(logros.map((l) => (l.donde ? (es ? `En ${l.donde}, ${frase(l.h)}.` : `At ${l.donde}: ${frase(l.h)}.`) : `${l.h.replace(/[.;]+$/, "")}.`)).join(" "));
  }

  if (c.transferibles.length) {
    const t = c.transferibles[0];
    partes.push(es ? `Aunque no he usado ${t.pide} directamente, mi experiencia con ${t.tienes} se transfiere bien.` : `While I haven't used ${t.pide} directly, my experience with ${t.tienes} transfers well.`);
  }

  const r = c.respuestas;
  const cuando = r.disponibilidad === "fecha" ? fechaDeInicio(r, c.ahora) : r.disponibilidad ? DISPONIBILIDAD[c.idioma][r.disponibilidad] : undefined;
  if (cuando) partes.push(es ? `Puedo empezar ${r.disponibilidad === "fecha" ? `a partir del ${cuando}` : cuando}.` : `I can start ${r.disponibilidad === "fecha" ? `on ${cuando}` : cuando}.`);

  partes.push(es ? "Me encantaría conversar sobre cómo puedo aportar al equipo. Gracias por su tiempo." : "I'd love to talk about how I can contribute to the team. Thank you for your time.");
  const contacto = [b.email, b.phone, b.profiles.find((x) => x.network === "LinkedIn")?.url].filter(Boolean).join(" · ");
  partes.push([es ? "Saludos," : "Best regards,", b.name, contacto].filter(Boolean).join("\n"));
  return partes.join("\n\n");
}

// ---------------------------------------------------------------------------------------------------------------
// Propuesta para proyectos freelance

/** Límite de Freelancer.com; Upwork y Workana aceptan más, pero una propuesta corta se lee completa. */
export const MAX_PROPUESTA = 1500;

/** Partes de la propuesta: las opcionales se quitan, de la menos a la más importante, si no cabe. */
interface Parte {
  texto: string;
  /** 0 = siempre va; mayor = se quita antes. */
  prescindible: number;
}

function proyectoRelevante(p: PerfilJson, pesos: Map<string, number>, palabras: Set<string>) {
  return p.projects
    .map((pr) => ({ pr, r: relevancia(`${pr.name} ${pr.description ?? ""}`, pesos, palabras) }))
    .filter((x) => x.r > 0.3)
    .sort((a, b) => b.r - a.r)[0]?.pr;
}

function propuesta(p: PerfilJson, o: OfertaParaDocs, c: ContextoCarta): string {
  const b = p.basics;
  const es = c.idioma === "es";
  const top = c.enfasis.slice(0, 3);
  const partes: Parte[] = [];

  // Lo primero que ve el cliente en la vista previa: que leíste su proyecto y que es lo tuyo.
  const encaje = top.length ? (es ? ` Trabajo con ${lista(top, c.idioma)}` : ` I work with ${lista(top, c.idioma)}`) : "";
  const anios = c.anios && c.anios > 0 ? (es ? ` y llevo ${c.anios} año${c.anios === 1 ? "" : "s"} en el área` : ` and have ${c.anios} year${c.anios === 1 ? "" : "s"} of experience`) : "";
  partes.push({
    texto: es
      ? `Hola, leí tu proyecto «${o.titulo}» y es el tipo de trabajo que hago.${encaje}${encaje ? `${anios}.` : ""}`
      : `Hi, I read your project "${o.titulo}" and it's exactly the kind of work I do.${encaje}${encaje ? `${anios}.` : ""}`,
    prescindible: 0,
  });

  // Evidencia real: logros del CV y un proyecto propio con enlace.
  logrosRelevantes(p, c).forEach((l, i) =>
    partes.push({
      texto: l.donde ? (es ? `${i ? "También" : "Por ejemplo"}, en ${l.donde} ${frase(l.h)}.` : `${i ? "Also" : "For example"}, at ${l.donde} I ${frase(l.h).replace(/^i /, "")}.`) : `${l.h.replace(/[.;]+$/, "")}.`,
      prescindible: i ? 4 : 1,
    }),
  );
  const pr = proyectoRelevante(p, c.pesos, c.palabras);
  if (pr) {
    const detalle = c.cvMismoIdioma && pr.description && !enOtroIdioma(pr.description, c.idioma) ? `: ${frase(pr.description)}` : "";
    partes.push({ texto: `${es ? "Un proyecto mío parecido" : "A similar project of mine"} — ${pr.name}${detalle}${pr.url ? ` (${pr.url})` : ""}.`, prescindible: 2 });
  }

  if (c.transferibles.length) {
    const t = c.transferibles[0];
    partes.push({ texto: es ? `No he usado ${t.pide} directamente, pero mi experiencia con ${t.tienes} se transfiere bien.` : `I haven't used ${t.pide} directly, but my experience with ${t.tienes} transfers well.`, prescindible: 3 });
  }

  partes.push({
    texto: es
      ? "Cómo lo abordaría: primero confirmo contigo el alcance y los entregables, y después te muestro avances en entregas cortas para que valides sobre la marcha."
      : "How I'd approach it: first confirm the scope and deliverables with you, then share progress in short iterations so you can review as we go.",
    prescindible: 5,
  });

  const r = c.respuestas;
  const cuando = r.disponibilidad === "fecha" ? fechaDeInicio(r, c.ahora) : r.disponibilidad ? DISPONIBILIDAD[c.idioma][r.disponibilidad] : undefined;
  if (cuando) partes.push({ texto: es ? `Puedo empezar ${r.disponibilidad === "fecha" ? `a partir del ${cuando}` : cuando}.` : `I can start ${r.disponibilidad === "fecha" ? `on ${cuando}` : cuando}.`, prescindible: 0 });

  // Una pregunta invita a responder: los clientes contestan más a quien abre conversación.
  partes.push({ texto: es ? "¿Tienes una fecha de entrega en mente y hay algo ya construido que deba revisar?" : "Do you have a deadline in mind, and is there anything already built I should review?", prescindible: 0 });

  // Sin correo ni teléfono: compartir contacto antes del contrato va contra las reglas de estas plataformas.
  const enlaces = [b.profiles.find((x) => x.network === "GitHub")?.url, b.url].filter(Boolean).join(" · ");
  partes.push({ texto: [es ? "Saludos," : "Best,", b.name, enlaces].filter(Boolean).join("\n"), prescindible: 0 });

  let incluidas = partes;
  const unir = (xs: Parte[]) => xs.map((x) => x.texto).join("\n\n");
  while (unir(incluidas).length > MAX_PROPUESTA) {
    const peor = Math.max(...incluidas.map((x) => x.prescindible));
    if (peor === 0) break;
    const i = incluidas.findLastIndex((x) => x.prescindible === peor);
    incluidas = incluidas.filter((_, k) => k !== i);
  }
  const texto = unir(incluidas);
  return texto.length > MAX_PROPUESTA ? `${texto.slice(0, MAX_PROPUESTA - 1).trimEnd()}…` : texto;
}

// ---------------------------------------------------------------------------------------------------------------

/** Versión local y determinista: reordena y destaca lo que ya está en el perfil. No inventa experiencia. */
export function prepararDocumentos(p: PerfilJson, o: OfertaParaDocs, respuestas: Respuestas, ahora: Date): DocumentosAMedida {
  const textoOferta = `${o.titulo}\n${o.texto}`;
  const idioma: IdiomaDoc = detectarIdioma(prep(textoOferta).folded) === "en" ? "en" : "es";
  const cvTexto = perfilATexto(p);
  const idiomaCv = detectarIdioma(prep(cvTexto).folded);

  const r = analizar(cvTexto, textoOferta, { ahora });
  const pesos = new Map(r.hallazgos.map((h) => [h.id, h.peso]));
  const palabras = new Set(prep(textoOferta).folded.match(PALABRA) ?? []);
  const enfasis = r.hallazgos.filter((h) => h.estado === "cubierta").map((h) => h.label);
  const brechas = r.hallazgos.filter((h) => h.estado === "faltante" && h.nivel !== "deseable").map((h) => h.label);
  const transferibles = r.hallazgos.filter((h) => h.estado === "transferible" && h.via).map((h) => ({ pide: h.label, tienes: h.via as string }));
  // En los documentos, solo los años que tú declaraste: sumar todos tus puestos mezclaría experiencia de otras áreas
  // (por ejemplo, antes de un cambio de carrera) con la que pide esta vacante, y eso sería afirmar algo falso.
  const anios = respuestas.aniosExperiencia;

  const clave = new Set(enfasis.map((e) => prep(e).folded));
  const tiene = (k: string) => Number(clave.has(prep(k).folded));
  const skills = p.skills
    .map((s) => ({ s: { ...s, keywords: [...s.keywords].sort((a, b) => tiene(b) - tiene(a)) }, afinidad: s.keywords.reduce((n, k) => n + tiene(k), 0) }))
    .sort((a, b) => b.afinidad - a.afinidad)
    .map((x) => x.s);

  const cv: PerfilJson = {
    ...p,
    basics: { ...p.basics, summary: resumenAMedida(p, enfasis, anios, idioma) },
    work: p.work.map((w, i) => reordenarTrabajo(w, i, pesos, palabras)),
    skills,
  };

  const contexto: ContextoCarta = { idioma, enfasis, transferibles, anios, respuestas, ahora, cvMismoIdioma: idiomaCv === "mixto" || idiomaCv === idioma, pesos, palabras };
  return { idioma, cv, enfasis, brechas, transferibles, carta: carta(p, o, contexto), propuesta: propuesta(p, o, contexto) };
}

/** @public La versión local del puerto `Redactor`: la de IA, cuando llegue, se conecta en su lugar. */
export const redactorLocal: Redactor = {
  preparar: async (p, o, r, ahora) => prepararDocumentos(p, o, r, ahora),
};
