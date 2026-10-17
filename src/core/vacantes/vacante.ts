import { decodificarEntidades, prep, sinEtiquetas } from "../analisis/texto";
import { paisesEnClave } from "./paises";

/** Plataformas de donde vienen las vacantes. Cada una tiene su adaptador en src/server/fuentes. */
export const FUENTES = [
  "getonboard",
  "remotive",
  "remoteok",
  "jobicy",
  "himalayas",
  "arbeitnow",
  "greenhouse",
  "lever",
  "ashby",
  "adzuna",
  "jooble",
  "usajobs",
  "freelancer",
  "braintrust",
] as const;
export type FuenteId = (typeof FUENTES)[number];

/** Sistemas de reclutamiento (ATS) que reconocemos por la URL para llenar su formulario más adelante. */
export type Ats = "greenhouse" | "lever" | "ashby" | "workday" | "smartrecruiters" | "icims" | "workable" | "bamboohr" | "recruitee" | "teamtailor";

export type Modalidad = "remoto" | "hibrido" | "presencial";

export interface SalarioVacante {
  min?: number;
  max?: number;
  moneda?: string;
  /** «proyecto»: presupuesto total de un proyecto freelance de precio fijo. */
  periodo?: "hora" | "mes" | "año" | "proyecto";
}

/** Una vacante ya normalizada, sin importar de qué plataforma venga. */
export interface Vacante {
  /** `${fuente}:${idExterno}`: estable entre búsquedas. */
  id: string;
  fuente: FuenteId;
  idExterno: string;
  titulo: string;
  empresa: string;
  ubicacion?: string;
  modalidad?: Modalidad;
  /** Países (ISO-2) donde se acepta a la persona, si la fuente lo dice. */
  paises: string[];
  /** Página pública de la vacante en la fuente: siempre se enlaza (lo piden sus términos de uso). */
  url: string;
  urlPostular?: string;
  ats?: Ats;
  /** Descripción en texto plano. */
  descripcion: string;
  publicadaEn?: string;
  salario?: SalarioVacante;
  etiquetas: string[];
  /** Proyecto freelance: se gana con una propuesta, no con una postulación. Sin este campo es un empleo. */
  tipo?: "proyecto";
  /** Propuestas que ya recibió el proyecto, si la plataforma lo publica: mide la competencia. */
  propuestas?: number;
}

// ---------------------------------------------------------------------------------------------------------------
// HTML → texto

/** Quita los bloques de código con su contenido, también hasta que no quede ninguno (ver sinEtiquetas). */
function sinBloquesDeCodigo(html: string): string {
  let antes: string;
  do {
    antes = html;
    html = html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, "");
  } while (html !== antes);
  return html;
}

/** Texto legible de la descripción HTML de una vacante: párrafos en líneas y listas como viñetas. */
export function htmlATexto(html: string): string {
  // Algunas fuentes (Greenhouse) mandan el HTML escapado: &lt;p&gt;…
  const crudo = !/<[a-z/!]/i.test(html) && /&lt;[a-z/]/i.test(html) ? decodificarEntidades(html) : html;
  const texto = sinEtiquetas(
    sinBloquesDeCodigo(crudo)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li[^>]*>/gi, "\n- ")
      // </li> no agrega salto: el siguiente <li> ya abre su propia línea.
      .replace(/<\/(p|div|ul|ol|h[1-6]|tr|section|article|blockquote)>/gi, "\n")
      .replace(/<(p|div|h[1-6]|tr|section|article|blockquote)(\s[^>]*)?>/gi, "\n"),
  );
  return decodificarEntidades(texto)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------------------------------------------------------------------------------------------------------------
// Salario, modalidad y ATS

const MONEDA_SIMBOLO: [RegExp, string][] = [
  [/€|\beur\b/i, "EUR"],
  [/£|\bgbp\b/i, "GBP"],
  [/\bmxn\b|\bmx\$/i, "MXN"],
  [/\bcop\b/i, "COP"],
  [/\bars\b/i, "ARS"],
  [/\bclp\b/i, "CLP"],
  [/\bbrl\b|r\$/i, "BRL"],
  [/\bcad\b/i, "CAD"],
  [/\$|\busd\b/i, "USD"],
];

/** «$90k - $105k», «€110K – €185K», «$90 - $150 /hour» → rango numérico con moneda y periodo. */
export function salarioDeTexto(texto: string | undefined | null): SalarioVacante | undefined {
  if (!texto) return undefined;
  const t = texto.replace(/,(?=\d{3}\b)/g, "");
  const numeros = [...t.matchAll(/(\d+(?:\.\d+)?)\s*([kK])?/g)]
    .map((m) => Number(m[1]) * (m[2] ? 1000 : 1))
    .filter((n) => n > 0);
  if (!numeros.length) return undefined;
  const moneda = MONEDA_SIMBOLO.find(([re]) => re.test(t))?.[1];
  const periodo = /hour|hora|\/h\b|hr\b/i.test(t) ? "hora" : /month|mes|mensual|\/mo\b/i.test(t) ? "mes" : /year|año|anual|annual|\/yr\b|k\b/i.test(t) ? "año" : undefined;
  const [a, b] = numeros;
  return limpiarSalario({ min: a, max: b ?? a, moneda, periodo });
}

export function limpiarSalario(s: SalarioVacante | undefined): SalarioVacante | undefined {
  if (!s) return undefined;
  const ok = (n: number | undefined) => (typeof n === "number" && Number.isFinite(n) && n > 0 && n < 1e8 ? Math.round(n) : undefined);
  let min = ok(s.min);
  let max = ok(s.max);
  if (min && max && min > max) [min, max] = [max, min];
  if (!min && !max) return undefined;
  return Object.fromEntries(Object.entries({ min, max, moneda: s.moneda?.toUpperCase(), periodo: s.periodo }).filter(([, v]) => v !== undefined)) as SalarioVacante;
}

export function modalidadDeTexto(texto: string | undefined | null): Modalidad | undefined {
  if (!texto) return undefined;
  const f = prep(texto).folded;
  if (/\b(hibrid[oa]|hybrid)\b/.test(f)) return "hibrido";
  if (/\b(remot[oa]|remote|anywhere|work from home|teletrabajo|home office)\b/.test(f)) return "remoto";
  if (/\b(presencial|on-?site|in-?office|in office|in-?person|in person)\b/.test(f)) return "presencial";
  return undefined;
}

/**
 * Lo que se deduce aunque la plataforma no lo diga (o lo diga mal): si el título dice «In-person» o «Remote», manda
 * sobre el dato de la plataforma; y «US-REMOTE; CA-TOR» en la ubicación dice en qué países hay que vivir. Se aplica al
 * crear la vacante y al volver a puntuar las que ya estaban guardadas.
 */
export function completarVacante(v: Vacante): Vacante {
  const modalidad = modalidadDeTexto(v.titulo) ?? v.modalidad;
  const paises = v.paises.length ? v.paises : paisesEnClave(v.ubicacion);
  return modalidad === v.modalidad && paises.length === v.paises.length ? v : { ...v, modalidad, paises };
}

const ATS_POR_DOMINIO: [RegExp, Ats][] = [
  [/(^|\.)greenhouse\.io$/, "greenhouse"],
  [/(^|\.)lever\.co$/, "lever"],
  [/(^|\.)ashbyhq\.com$/, "ashby"],
  [/(^|\.)myworkdayjobs\.com$|(^|\.)myworkdaysite\.com$/, "workday"],
  [/(^|\.)smartrecruiters\.com$/, "smartrecruiters"],
  [/(^|\.)icims\.com$/, "icims"],
  [/(^|\.)workable\.com$/, "workable"],
  [/(^|\.)bamboohr\.com$/, "bamboohr"],
  [/(^|\.)recruitee\.com$/, "recruitee"],
  [/(^|\.)teamtailor\.com$/, "teamtailor"],
];

export function atsDeUrl(url: string | undefined): Ats | undefined {
  if (!url) return undefined;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return ATS_POR_DOMINIO.find(([re]) => re.test(host))?.[1];
  } catch {
    return undefined;
  }
}

export function urlHttp(url: unknown): string | undefined {
  if (typeof url !== "string" || !url.trim()) return undefined;
  try {
    const u = new URL(url.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function fechaIso(x: unknown): string | undefined {
  if (x === null || x === undefined || x === "") return undefined;
  // Epoch en segundos (RemoteOK, Arbeitnow, Get on Board, Himalayas) o milisegundos (Lever).
  const d = typeof x === "number" ? new Date(x < 1e12 ? x * 1000 : x) : new Date(String(x));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

// ---------------------------------------------------------------------------------------------------------------
// Duplicados

const RUIDO_EMPRESA = /\b(inc|llc|ltd|corp|corporation|s\.?a\.?(?: de c\.?v\.?)?|sas|gmbh|s\.?l\.?|co)\b\.?/g;

/** La misma vacante publicada en varias plataformas comparte empresa y título. */
export function claveDuplicado(v: Pick<Vacante, "empresa" | "titulo">): string {
  const norm = (s: string) => prep(s).folded.replace(RUIDO_EMPRESA, " ").replace(/[^a-z0-9]+/g, " ").trim();
  return `${norm(v.empresa)}|${norm(v.titulo)}`;
}

const MAX = { titulo: 200, empresa: 200, ubicacion: 200, descripcion: 20_000, etiquetas: 30 };

/** Construye una Vacante válida o undefined si faltan datos esenciales. Los adaptadores pasan todo por aquí. */
export function crearVacante(fuente: FuenteId, datos: Omit<Vacante, "id" | "fuente" | "ats" | "paises" | "etiquetas"> & { paises?: string[]; etiquetas?: string[]; ats?: Ats }): Vacante | undefined {
  const idExterno = String(datos.idExterno ?? "").trim().slice(0, 200);
  const titulo = datos.titulo?.trim().slice(0, MAX.titulo);
  const empresa = datos.empresa?.trim().slice(0, MAX.empresa);
  const url = urlHttp(datos.url);
  if (!idExterno || !titulo || !empresa || !url) return undefined;
  const urlPostular = urlHttp(datos.urlPostular);
  const vacante: Vacante = {
    id: `${fuente}:${idExterno}`,
    fuente,
    idExterno,
    titulo,
    empresa,
    ubicacion: datos.ubicacion?.trim().slice(0, MAX.ubicacion) || undefined,
    modalidad: datos.modalidad,
    paises: [...new Set((datos.paises ?? []).filter((p) => /^[A-Z]{2}$/.test(p)))],
    url,
    urlPostular,
    ats: datos.ats ?? atsDeUrl(urlPostular) ?? atsDeUrl(url),
    descripcion: (datos.descripcion ?? "").slice(0, MAX.descripcion),
    publicadaEn: datos.publicadaEn,
    salario: limpiarSalario(datos.salario),
    etiquetas: [...new Set((datos.etiquetas ?? []).map((e) => e.trim()).filter(Boolean))].slice(0, MAX.etiquetas),
    tipo: datos.tipo === "proyecto" ? "proyecto" : undefined,
    propuestas: typeof datos.propuestas === "number" && Number.isInteger(datos.propuestas) && datos.propuestas >= 0 ? datos.propuestas : undefined,
  };
  return completarVacante(Object.fromEntries(Object.entries(vacante).filter(([, v]) => v !== undefined)) as unknown as Vacante);
}
