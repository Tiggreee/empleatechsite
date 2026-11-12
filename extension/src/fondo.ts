/**
 * Service worker de la extensión: el único que habla con tu instalación de EmpleaTech. Las páginas de los ATS nunca
 * ven tu perfil completo; solo reciben lo que la extensión escribe en sus campos.
 */
import { carpetaDelDia, esCvViejo, nombreSeguroDocx } from "@/core/documentos/carpetaCv";
import { baseDeLaApp, tokenDeLaApp } from "./config";

async function pedir(ruta: string, init?: RequestInit): Promise<unknown> {
  const token = await tokenDeLaApp();
  const res = await fetch(`${await baseDeLaApp()}${ruta}`, {
    ...init,
    headers: { "Content-Type": "application/json", "x-empleatech": "extension", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers },
  });
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  if (res.status === 401) throw new Error("Falta conectar la extensión: en tu EmpleaTech abre Mi CV → Autollenado y pulsa «Conectar la extensión».");
  if (!res.ok) throw new Error(body?.error ?? `EmpleaTech respondió ${res.status}`);
  return body;
}

type Mensaje =
  | { tipo: "datos"; url: string }
  | { tipo: "evento"; cuerpo: Record<string, unknown> }
  | { tipo: "conectar"; token?: string }
  | { tipo: "guardar-cv"; nombre?: unknown; base64?: unknown };

/** Páginas desde las que se acepta la conexión de un clic: tu EmpleaTech en internet o en tu computadora. */
const APPS = /^(https:\/\/empleatech\.site|http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?)$/;

const TIPO_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
/** ~5 MB de archivo: un CV nunca pesa eso; más es un error o un abuso. */
const MAX_BASE64 = 7_000_000;

/** Espera a que Chrome termine de escribir la descarga y devuelve su ruta completa. */
async function rutaFinal(id: number): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const [d] = await chrome.downloads.search({ id });
    if (d?.state === "complete") return d.filename;
    if (!d || d.state === "interrupted") throw new Error(`Chrome no pudo guardar el CV${d?.error ? ` (${d.error})` : ""}.`);
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Chrome tardó demasiado en guardar el CV.");
}

/**
 * Regla de los CV: hoy van a Descargas\CV<mes>-<día>\ y solo se guardan los de hoy y ayer. Se borran únicamente
 * archivos que descargó esta extensión dentro de una carpeta CV<mes>-<día> vieja; nada más de tus Descargas.
 * (Chrome puede borrar archivos, no carpetas: la carpeta vieja queda vacía.)
 */
async function guardarCv(nombre: unknown, base64: unknown): Promise<{ ruta: string; borrados: number }> {
  if (typeof base64 !== "string" || !base64 || base64.length > MAX_BASE64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error("El CV llegó vacío o dañado.");
  const hoy = new Date();
  const id = await chrome.downloads.download({
    url: `data:${TIPO_DOCX};base64,${base64}`,
    filename: `${carpetaDelDia(hoy)}/${nombreSeguroDocx(nombre)}`,
    conflictAction: "overwrite",
    saveAs: false,
  });
  const ruta = await rutaFinal(id);
  let borrados = 0;
  const viejos = await chrome.downloads.search({ filenameRegex: "[\\\\/]CV\\d{2}-\\d{2}[\\\\/][^\\\\/]+$", exists: true });
  for (const d of viejos) {
    if (d.byExtensionId !== chrome.runtime.id || !esCvViejo(d.filename, hoy)) continue;
    try {
      await chrome.downloads.removeFile(d.id);
      await chrome.downloads.erase({ id: d.id });
      borrados++;
    } catch {
      // Si ya no existe o está abierto en Word, se intenta la próxima vez.
    }
  }
  return { ruta, borrados };
}

chrome.runtime.onMessage.addListener((msg: Mensaje, remitente, responder) => {
  // Solo nuestros propios scripts de contenido; nunca otra extensión.
  if (remitente.id !== chrome.runtime.id) return false;
  if (msg.tipo === "conectar") {
    // La dirección sale de la página que pidió conectar (lo dice Chrome, no la página): nadie puede apuntarla a otro lado.
    const base = remitente.origin ?? (remitente.url ? new URL(remitente.url).origin : "");
    if (!APPS.test(base)) {
      responder({ ok: false, error: "Esa página no es tu EmpleaTech." });
      return false;
    }
    void chrome.storage.local.set({ base, token: msg.token?.trim() ?? "" }).then(() => responder({ ok: true, base }));
    return true;
  }
  if (msg.tipo === "guardar-cv") {
    // Igual que «conectar»: solo tu EmpleaTech puede pedir que se guarde un archivo en tus Descargas.
    const origen = remitente.origin ?? (remitente.url ? new URL(remitente.url).origin : "");
    if (!APPS.test(origen)) {
      responder({ ok: false, error: "Esa página no es tu EmpleaTech." });
      return false;
    }
    guardarCv(msg.nombre, msg.base64)
      .then((r) => responder({ ok: true, ...r }))
      .catch((e: unknown) => responder({ ok: false, error: e instanceof Error ? e.message : "No se pudo guardar el CV." }));
    return true;
  }
  const tarea = msg.tipo === "datos" ? pedir(`/api/autollenado?url=${encodeURIComponent(msg.url)}`) : pedir("/api/autollenado", { method: "POST", body: JSON.stringify(msg.cuerpo) });
  tarea
    .then((datos) => responder({ ok: true, datos }))
    .catch((e: unknown) => {
      const mensaje = e instanceof Error ? e.message : "Error desconocido";
      responder({ ok: false, error: /Failed to fetch|NetworkError/i.test(mensaje) ? "No pudimos hablar con tu EmpleaTech. Revisa tu conexión a internet (o, si la usas en tu computadora, que esté abierta)." : mensaje });
    });
  return true; // respuesta asíncrona
});
