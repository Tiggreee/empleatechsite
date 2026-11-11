import { APP_SLUG } from "@/config/app";
import { analizar } from "../analisis/analizador";
import { resumir, sanitizarResumen, type ResumenAnalisis } from "../analisis/resumen";
import { detectarAlertas } from "../radar/radar";

export const ESTADOS = ["guardada", "postulada", "entrevista", "oferta", "rechazada"] as const;
export type EstadoPostulacion = (typeof ESTADOS)[number];

export const ETIQUETA_ESTADO: Record<EstadoPostulacion, string> = {
  guardada: "Guardada",
  postulada: "Postulada",
  entrevista: "Entrevista",
  oferta: "Oferta",
  rechazada: "Cerrada",
};

export const SELLO_ITEMS = [
  "Leí la oferta completa",
  "Adapté mi CV a esta vacante",
  "Verifiqué que la empresa y el puesto son reales",
  "Yo mismo(a) presiono «Enviar»",
] as const;

export const DIAS_SEGUIMIENTO = 7;
export const DIAS_CIERRE = 21;

export interface Sello {
  en: string;
  items: string[];
}

export const MAX_TEXTO_OFERTA = 12_000;

export interface OfertaGuardada {
  texto: string;
  cvId?: string;
  resumen: ResumenAnalisis;
}

export interface Postulacion {
  id: string;
  empresa: string;
  puesto: string;
  url?: string;
  score?: number;
  notas?: string;
  estado: EstadoPostulacion;
  creadaEn: string;
  actualizadaEn: string;
  postuladaEn?: string;
  seguimientoEn?: string;
  sello?: Sello;
  oferta?: OfertaGuardada;
  historial: { estado: EstadoPostulacion; en: string }[];
}

export type NuevaPostulacion = {
  empresa: string;
  puesto: string;
  url?: string;
  score?: number;
  notas?: string;
  oferta?: OfertaGuardada;
};

function recortarOferta(o: OfertaGuardada | undefined): OfertaGuardada | undefined {
  if (!o || !o.texto.trim()) return undefined;
  return { texto: o.texto.trim().slice(0, MAX_TEXTO_OFERTA), cvId: o.cvId?.slice(0, 80), resumen: o.resumen };
}

const MAX = { texto: 200, notas: 2000 };
const DIA = 86_400_000;

export function urlSegura(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function crear(lista: Postulacion[], datos: NuevaPostulacion, ahora: Date, id: string): Postulacion[] {
  const empresa = datos.empresa.trim().slice(0, MAX.texto);
  const puesto = datos.puesto.trim().slice(0, MAX.texto);
  if (!empresa || !puesto) throw new Error("Empresa y puesto son obligatorios.");
  const iso = ahora.toISOString();
  const oferta = recortarOferta(datos.oferta);
  const scoreDirecto = typeof datos.score === "number" && datos.score >= 0 && datos.score <= 100 ? Math.round(datos.score) : undefined;
  const score = oferta?.resumen.score ?? scoreDirecto;
  const nueva: Postulacion = {
    id,
    empresa,
    puesto,
    url: urlSegura(datos.url),
    score,
    notas: datos.notas?.trim().slice(0, MAX.notas) || undefined,
    estado: "guardada",
    creadaEn: iso,
    actualizadaEn: iso,
    oferta,
    historial: [{ estado: "guardada", en: iso }],
  };
  return [nueva, ...lista];
}

export function analizarOferta(cvTexto: string, ofertaTexto: string, cvId: string | undefined, ahora: Date): OfertaGuardada {
  const resumen = resumir(analizar(cvTexto, ofertaTexto, { ahora }), detectarAlertas(ofertaTexto, ahora), ahora);
  return { texto: ofertaTexto.trim().slice(0, MAX_TEXTO_OFERTA), cvId, resumen };
}

export function reanalizarTodas(lista: Postulacion[], cvTexto: string, cvId: string, ahora: Date): Postulacion[] {
  return lista.map((p) => {
    if (!p.oferta) return p;
    const oferta = analizarOferta(cvTexto, p.oferta.texto, cvId, ahora);
    return { ...p, oferta, score: oferta.resumen.score ?? p.score };
  });
}

export function adjuntarOferta(lista: Postulacion[], id: string, oferta: OfertaGuardada, ahora: Date): Postulacion[] {
  const o = recortarOferta(oferta);
  if (!o) throw new Error("La oferta está vacía.");
  return actualizar(lista, id, (p) => ({ ...p, oferta: o, score: o.resumen.score ?? p.score, actualizadaEn: ahora.toISOString() }));
}

function actualizar(lista: Postulacion[], id: string, fn: (p: Postulacion) => Postulacion): Postulacion[] {
  if (!lista.some((p) => p.id === id)) throw new Error("Postulación no encontrada.");
  return lista.map((p) => (p.id === id ? fn(p) : p));
}

export function marcarPostulada(lista: Postulacion[], id: string, confirmados: string[], ahora: Date): Postulacion[] {
  const faltan = SELLO_ITEMS.filter((i) => !confirmados.includes(i));
  if (faltan.length) throw new Error("Falta confirmar el Sello Humano completo.");
  const iso = ahora.toISOString();
  return actualizar(lista, id, (p) => {
    if (p.estado !== "guardada") throw new Error("Solo una postulación guardada puede marcarse como postulada.");
    return {
      ...p,
      estado: "postulada",
      postuladaEn: iso,
      actualizadaEn: iso,
      sello: { en: iso, items: [...SELLO_ITEMS] },
      historial: [...p.historial, { estado: "postulada", en: iso }],
    };
  });
}

export function cambiarEstado(lista: Postulacion[], id: string, estado: EstadoPostulacion, ahora: Date): Postulacion[] {
  if (estado === "postulada") throw new Error("Para postular usa el Sello Humano.");
  const iso = ahora.toISOString();
  return actualizar(lista, id, (p) => {
    if ((estado === "entrevista" || estado === "oferta") && !p.postuladaEn) {
      throw new Error("Primero marca la postulación como enviada (Sello Humano).");
    }
    if (p.estado === estado) return p;
    return { ...p, estado, actualizadaEn: iso, historial: [...p.historial, { estado, en: iso }] };
  });
}

export function programarSeguimiento(lista: Postulacion[], id: string, fecha: string | undefined, ahora: Date): Postulacion[] {
  let iso: string | undefined;
  if (fecha) {
    const d = new Date(fecha);
    if (Number.isNaN(d.getTime())) throw new Error("Fecha inválida.");
    iso = d.toISOString();
  }
  return actualizar(lista, id, (p) => ({ ...p, seguimientoEn: iso, actualizadaEn: ahora.toISOString() }));
}

export function editarNotas(lista: Postulacion[], id: string, notas: string, ahora: Date): Postulacion[] {
  return actualizar(lista, id, (p) => ({ ...p, notas: notas.trim().slice(0, MAX.notas) || undefined, actualizadaEn: ahora.toISOString() }));
}

export function eliminar(lista: Postulacion[], id: string): Postulacion[] {
  return lista.filter((p) => p.id !== id);
}

export type Tono = "ok" | "atencion" | "urgente";
export interface Accion {
  texto: string;
  tono: Tono;
}

function diasEntre(desde: string, hasta: Date): number {
  return Math.max(0, Math.floor((hasta.getTime() - new Date(desde).getTime()) / DIA));
}

export function siguienteAccion(p: Postulacion, ahora: Date): Accion {
  switch (p.estado) {
    case "guardada":
      if (p.score !== undefined && p.score < 40) {
        return { texto: "Afinidad baja: cierra brechas antes de postular o descártala.", tono: "atencion" };
      }
      return { texto: "Revisa la oferta y postula con el Sello Humano.", tono: "ok" };
    case "postulada": {
      const base = p.postuladaEn ?? p.actualizadaEn;
      const dias = diasEntre(base, ahora);
      if (p.seguimientoEn && new Date(p.seguimientoEn).getTime() <= ahora.getTime()) {
        return { texto: "Seguimiento vencido: escribe hoy.", tono: "urgente" };
      }
      if (dias >= DIAS_CIERRE) return { texto: `Sin respuesta en ${dias} días: ciérrala y sigue adelante.`, tono: "atencion" };
      if (dias >= DIAS_SEGUIMIENTO && !p.seguimientoEn) {
        return { texto: `Llevas ${dias} días sin respuesta: da seguimiento.`, tono: "urgente" };
      }
      const faltan = Math.max(0, DIAS_SEGUIMIENTO - dias);
      return { texto: p.seguimientoEn ? "Seguimiento programado." : `Espera; seguimiento en ${faltan} día${faltan === 1 ? "" : "s"}.`, tono: "ok" };
    }
    case "entrevista":
      return { texto: "Prepara la entrevista: repasa tus brechas y tus logros medibles.", tono: "atencion" };
    case "oferta":
      return { texto: "Compara, negocia y responde antes de tu fecha límite.", tono: "atencion" };
    case "rechazada":
      return { texto: "Anota qué aprendiste para la siguiente.", tono: "ok" };
  }
}

export interface Estadisticas {
  total: number;
  porEstado: Record<EstadoPostulacion, number>;
  postuladas: number;
  /** Enviadas que llegaron a entrevista alguna vez, aunque después se hayan cerrado (sale del historial, no del estado de hoy). */
  entrevistas: number;
  ofertas: number;
  /** Enviadas que siguen esperando respuesta. */
  enEspera: number;
  /** Enviadas cerradas sin llegar a entrevista: rechazo o silencio, la app no puede distinguirlos. */
  cerradasSinEntrevista: number;
  tasaEntrevista: number | null;
  tasaOferta: number | null;
  /** Días promedio de enviar a la primera entrevista u oferta. Un cierre no cuenta: puede ser silencio. */
  diasPromedioRespuesta: number | null;
  pendientesSeguimiento: number;
  scorePromedio: number | null;
}

export function estadisticas(lista: Postulacion[], ahora: Date): Estadisticas {
  const porEstado = Object.fromEntries(ESTADOS.map((e) => [e, 0])) as Record<EstadoPostulacion, number>;
  let postuladas = 0;
  let entrevistas = 0;
  let ofertas = 0;
  let enEspera = 0;
  let cerradasSinEntrevista = 0;
  const respuestas: number[] = [];
  let pendientes = 0;
  const scores: number[] = [];

  for (const p of lista) {
    porEstado[p.estado]++;
    if (p.score !== undefined) scores.push(p.score);
    if (!p.postuladaEn) continue;
    postuladas++;
    const alcanzo = (e: EstadoPostulacion) => p.historial.some((h) => h.estado === e);
    const tuvoEntrevista = alcanzo("entrevista") || alcanzo("oferta");
    if (tuvoEntrevista) entrevistas++;
    if (alcanzo("oferta")) ofertas++;
    if (p.estado === "postulada") enEspera++;
    if (p.estado === "rechazada" && !tuvoEntrevista) cerradasSinEntrevista++;
    const primera = p.historial.find((h) => h.estado === "entrevista" || h.estado === "oferta");
    if (primera) respuestas.push(Math.max(0, diasEntre(p.postuladaEn, new Date(primera.en))));
    if (p.estado === "postulada" && siguienteAccion(p, ahora).tono === "urgente") pendientes++;
  }

  const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const prom = media(respuestas);
  const sp = media(scores);
  return {
    total: lista.length,
    porEstado,
    postuladas,
    entrevistas,
    ofertas,
    enEspera,
    cerradasSinEntrevista,
    tasaEntrevista: postuladas ? entrevistas / postuladas : null,
    tasaOferta: postuladas ? ofertas / postuladas : null,
    diasPromedioRespuesta: prom === null ? null : Math.round(prom * 10) / 10,
    pendientesSeguimiento: pendientes,
    scorePromedio: sp === null ? null : Math.round(sp),
  };
}

function esFecha(x: unknown): x is string {
  return typeof x === "string" && !Number.isNaN(new Date(x).getTime());
}

function texto(x: unknown, max: number): string | undefined {
  return typeof x === "string" && x.trim() ? x.trim().slice(0, max) : undefined;
}

function sanitizarOferta(x: unknown): OfertaGuardada | undefined {
  if (typeof x !== "object" || x === null) return undefined;
  const o = x as Record<string, unknown>;
  const resumen = sanitizarResumen(o.resumen);
  if (!resumen || typeof o.texto !== "string" || !o.texto.trim()) return undefined;
  return { texto: o.texto.trim().slice(0, MAX_TEXTO_OFERTA), cvId: typeof o.cvId === "string" ? o.cvId.slice(0, 80) : undefined, resumen };
}

export function sanitizar(crudo: unknown): { items: Postulacion[]; descartadas: number } {
  const arr = Array.isArray(crudo) ? crudo : [];
  const items: Postulacion[] = [];
  let descartadas = 0;
  const vistos = new Set<string>();
  for (const it of arr) {
    if (typeof it !== "object" || it === null) {
      descartadas++;
      continue;
    }
    const o = it as Record<string, unknown>;
    const id = texto(o.id, 80);
    const empresa = texto(o.empresa, MAX.texto);
    const puesto = texto(o.puesto, MAX.texto);
    if (!id || !empresa || !puesto || vistos.has(id)) {
      descartadas++;
      continue;
    }
    vistos.add(id);
    const creadaEn = esFecha(o.creadaEn) ? new Date(o.creadaEn).toISOString() : new Date(0).toISOString();
    const estado = ESTADOS.includes(o.estado as EstadoPostulacion) ? (o.estado as EstadoPostulacion) : "guardada";
    const historialCrudo = Array.isArray(o.historial) ? o.historial : [];
    const historial = historialCrudo
      .filter((h): h is { estado: EstadoPostulacion; en: string } => typeof h === "object" && h !== null && ESTADOS.includes((h as { estado: never }).estado) && esFecha((h as { en: unknown }).en))
      .map((h) => ({ estado: h.estado, en: new Date(h.en).toISOString() }));
    if (historial.length === 0) historial.push({ estado, en: creadaEn });
    const selloCrudo = o.sello as { en?: unknown; items?: unknown } | undefined;
    const sello: Sello | undefined =
      selloCrudo && esFecha(selloCrudo.en) && Array.isArray(selloCrudo.items)
        ? { en: new Date(selloCrudo.en).toISOString(), items: selloCrudo.items.filter((i): i is string => typeof i === "string").slice(0, 10) }
        : undefined;
    items.push({
      id,
      empresa,
      puesto,
      url: typeof o.url === "string" ? urlSegura(o.url) : undefined,
      score: typeof o.score === "number" && o.score >= 0 && o.score <= 100 ? Math.round(o.score) : undefined,
      notas: texto(o.notas, MAX.notas),
      estado,
      creadaEn,
      actualizadaEn: esFecha(o.actualizadaEn) ? new Date(o.actualizadaEn).toISOString() : creadaEn,
      postuladaEn: esFecha(o.postuladaEn) ? new Date(o.postuladaEn).toISOString() : undefined,
      seguimientoEn: esFecha(o.seguimientoEn) ? new Date(o.seguimientoEn).toISOString() : undefined,
      sello,
      oferta: sanitizarOferta(o.oferta),
      historial,
    });
  }
  return { items, descartadas };
}

export function exportarJSON(lista: Postulacion[], ahora: Date): string {
  return JSON.stringify({ app: APP_SLUG, version: 1, exportadoEn: ahora.toISOString(), postulaciones: lista }, null, 2);
}

export function importarJSON(textoJson: string): { items: Postulacion[]; descartadas: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(textoJson);
  } catch {
    throw new Error("El archivo no es un JSON válido.");
  }
  const crudo = Array.isArray(parsed) ? parsed : (parsed as { postulaciones?: unknown } | null)?.postulaciones;
  if (!Array.isArray(crudo)) throw new Error("El archivo no contiene una lista de postulaciones.");
  return sanitizar(crudo);
}

export function fusionar(actual: Postulacion[], entrantes: Postulacion[]): Postulacion[] {
  const mapa = new Map(actual.map((p) => [p.id, p]));
  for (const n of entrantes) {
    const prev = mapa.get(n.id);
    if (!prev || new Date(n.actualizadaEn).getTime() > new Date(prev.actualizadaEn).getTime()) mapa.set(n.id, n);
  }
  return [...mapa.values()].sort((a, b) => new Date(b.creadaEn).getTime() - new Date(a.creadaEn).getTime());
}

function celdaCsv(valor: string | number | undefined): string {
  let v = valor === undefined ? "" : String(valor);
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return `"${v.replace(/"/g, '""')}"`;
}

export function exportarCSV(lista: Postulacion[]): string {
  const cab = ["empresa", "puesto", "estado", "afinidad", "url", "creada", "postulada", "seguimiento", "notas"];
  const filas = lista.map((p) =>
    [p.empresa, p.puesto, ETIQUETA_ESTADO[p.estado], p.score, p.url, p.creadaEn, p.postuladaEn, p.seguimientoEn, p.notas].map(celdaCsv).join(","),
  );
  return [cab.map(celdaCsv).join(","), ...filas].join("\r\n");
}

