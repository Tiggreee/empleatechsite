/**
 * Regla de los CV descargados: cada día van a su carpeta «CV<mes>-<día>» dentro de Descargas (p. ej. CV11-11) y solo se
 * guardan los de hoy y los de ayer. La fecha es la local de la persona, no la UTC: a las 22:45 en México UTC ya es mañana.
 * Lo usa la extensión, que es la única que puede elegir subcarpeta y borrar lo que descargó.
 */

const dosDigitos = (n: number) => String(n).padStart(2, "0");

export function carpetaDelDia(fecha: Date): string {
  return `CV${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}`;
}

/** Carpetas que se conservan: la de hoy y la de ayer. */
export function carpetasVigentes(hoy: Date): Set<string> {
  const ayer = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1);
  return new Set([carpetaDelDia(hoy), carpetaDelDia(ayer)]);
}

const RE_EN_CARPETA_CV = /[\\/](CV\d{2}-\d{2})[\\/][^\\/]+$/;

/** ¿Este archivo (ruta completa) es un CV de una carpeta CV<mes>-<día> que ya no toca guardar? */
export function esCvViejo(ruta: string, hoy: Date): boolean {
  const m = RE_EN_CARPETA_CV.exec(ruta);
  return !!m && !carpetasVigentes(hoy).has(m[1]);
}

/** Nombre de archivo seguro que llega de la página: sin carpetas, sin signos raros y siempre .docx. */
export function nombreSeguroDocx(nombre: unknown): string {
  const base = (typeof nombre === "string" ? nombre : "")
    .split(/[\\/]/)
    .pop()!
    .replace(/\.docx$/i, "")
    .replace(/[^A-Za-z0-9 ._-]+/g, " ")
    .replace(/\.{2,}/g, ".")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[ .-]+|[ .-]+$/g, "")
    .slice(0, 90)
    .trim();
  return `${base || "CV"}.docx`;
}
