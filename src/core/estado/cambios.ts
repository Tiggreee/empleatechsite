import { MAX_CVS, sanitizarPerfil, type EstadoPerfil, type PerfilCv } from "../perfil/perfil";
import { sanitizarRespuestas, type Respuestas } from "../perfil/respuestas";
import { sanitizar, type Postulacion } from "../seguimiento/seguimiento";

/** Tus datos tal como la app los guarda: perfil (CVs y respuestas) y postulaciones. */
export interface EstadoApp {
  perfil: EstadoPerfil;
  postulaciones: Postulacion[];
}

/** Lo que cambió en una lista con id: lo que se agrega o modifica, y los ids que quitaste. */
export interface CambiosLista<T> {
  guardar: T[];
  borrar: string[];
}

/**
 * Solo lo que cambió desde lo último que leíste del servidor. Si la extensión registró una postulación mientras esta
 * pestaña tenía datos viejos, guardar aquí no la borra: cada escritura toca únicamente sus propios renglones.
 */
export interface CambiosEstado {
  activoId?: string | null;
  respuestas?: Respuestas;
  cvs?: CambiosLista<PerfilCv>;
  postulaciones?: CambiosLista<Postulacion>;
}

const MAX_IDS = 1000;

function cambiosLista<T extends { id: string }>(antes: T[], despues: T[]): CambiosLista<T> | undefined {
  const previos = new Map(antes.map((x) => [x.id, JSON.stringify(x)]));
  const guardar = despues.filter((x) => previos.get(x.id) !== JSON.stringify(x));
  const quedan = new Set(despues.map((x) => x.id));
  const borrar = antes.filter((x) => !quedan.has(x.id)).map((x) => x.id);
  return guardar.length || borrar.length ? { guardar, borrar } : undefined;
}

/** Qué hay que escribir para pasar de `base` (lo último del servidor) a `siguiente` (lo que quieres guardar). */
export function cambiosEntre(base: EstadoApp, siguiente: EstadoApp): CambiosEstado {
  const c: CambiosEstado = {};
  const cvs = cambiosLista(base.perfil.cvs, siguiente.perfil.cvs);
  if (cvs) c.cvs = cvs;
  const postulaciones = cambiosLista(base.postulaciones, siguiente.postulaciones);
  if (postulaciones) c.postulaciones = postulaciones;
  if (siguiente.perfil.activoId !== base.perfil.activoId) c.activoId = siguiente.perfil.activoId;
  if (JSON.stringify(siguiente.perfil.respuestas) !== JSON.stringify(base.perfil.respuestas)) c.respuestas = siguiente.perfil.respuestas;
  return c;
}

export const hayCambios = (c: CambiosEstado): boolean => Object.keys(c).length > 0;

function ids(crudo: unknown): string[] {
  if (!Array.isArray(crudo)) return [];
  return [...new Set(crudo.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 80))].slice(0, MAX_IDS);
}

function lista(crudo: unknown): { guardar: unknown[]; borrar: string[] } | undefined {
  if (typeof crudo !== "object" || crudo === null) return undefined;
  const o = crudo as { guardar?: unknown; borrar?: unknown };
  return { guardar: Array.isArray(o.guardar) ? o.guardar.slice(0, MAX_IDS) : [], borrar: ids(o.borrar) };
}

/** Los cambios que llegan del navegador, con cada pieza validada igual que al leer tus datos. */
export function sanitizarCambios(crudo: unknown): CambiosEstado {
  if (typeof crudo !== "object" || crudo === null) return {};
  const o = crudo as Record<string, unknown>;
  const c: CambiosEstado = {};
  if (o.activoId === null || (typeof o.activoId === "string" && o.activoId.length <= 80)) c.activoId = o.activoId;
  if (typeof o.respuestas === "object" && o.respuestas !== null) c.respuestas = sanitizarRespuestas(o.respuestas);
  const cvs = lista(o.cvs);
  if (cvs) c.cvs = { guardar: sanitizarPerfil({ cvs: cvs.guardar.slice(0, MAX_CVS) }).cvs, borrar: cvs.borrar };
  const postulaciones = lista(o.postulaciones);
  if (postulaciones) c.postulaciones = { guardar: sanitizar(postulaciones.guardar).items, borrar: postulaciones.borrar };
  return c;
}
