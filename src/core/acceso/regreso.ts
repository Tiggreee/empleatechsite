/**
 * A dónde volver después de entrar: solo a una ruta de esta misma app. Revisar el texto no basta (`/\sitio.com` y
 * `/<tab>/sitio.com` pasan por «empieza con / y no con //», y el navegador los abre como otro sitio), así que se lee con
 * el mismo parser que usa el navegador y se compara el origen.
 */
export function rutaDeRegreso(volver: string | null | undefined, origen: string, porDefecto = "/hoy"): string {
  if (!volver?.startsWith("/")) return porDefecto;
  try {
    const u = new URL(volver, origen);
    if (u.origin !== new URL(origen).origin || u.pathname.startsWith("/entrar")) return porDefecto;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return porDefecto;
  }
}
