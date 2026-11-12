/**
 * Solo en las páginas de tu EmpleaTech: avisa que la extensión está instalada y recibe la conexión de un clic desde
 * «Autollenado» (dirección y token), para que no tengas que copiar nada a las opciones.
 */
const VERSION = chrome.runtime.getManifest().version;
const APP = "empleatech-app";
const EXTENSION = "empleatech-extension";

// La página puede cargar antes o después que este script: se avisa al llegar y se contesta cuando la página pregunta.
// «guardaCv»: esta versión sabe guardar el CV en Descargas\CV<mes>-<día>\ (las anteriores no).
const avisar = () => window.postMessage({ fuente: EXTENSION, tipo: "lista", version: VERSION, guardaCv: true }, location.origin);
avisar();

window.addEventListener("message", (e: MessageEvent) => {
  // Solo la propia página (no iframes ni otras ventanas) puede hablar con la extensión.
  if (e.source !== window || e.origin !== location.origin) return;
  const d = e.data as { fuente?: unknown; tipo?: unknown; token?: unknown } | null;
  if (d?.fuente !== APP) return;
  if (d.tipo === "hola") return avisar();
  if (d.tipo === "guardar-cv") {
    // El CV a la medida en .docx: la extensión lo guarda en Descargas\CV<mes>-<día>\ (una página web no puede elegir carpeta).
    const { nombre, base64 } = e.data as { nombre?: unknown; base64?: unknown };
    chrome.runtime.sendMessage({ tipo: "guardar-cv", nombre, base64 }, (r: { ok: boolean; ruta?: string; borrados?: number; error?: string } | undefined) => {
      const error = chrome.runtime.lastError ? "La extensión se actualizó: recarga esta página." : r?.ok ? undefined : (r?.error ?? "La extensión no respondió.");
      window.postMessage({ fuente: EXTENSION, tipo: "cv-guardado", ok: !error, ruta: r?.ruta, borrados: r?.borrados ?? 0, error }, location.origin);
    });
    return;
  }
  if (d.tipo !== "conectar") return;
  const token = typeof d.token === "string" ? d.token : undefined;
  chrome.runtime.sendMessage({ tipo: "conectar", token }, (r: { ok: boolean; base?: string; error?: string } | undefined) => {
    const error = chrome.runtime.lastError ? "La extensión se actualizó: recarga esta página." : r?.ok ? undefined : (r?.error ?? "La extensión no respondió.");
    window.postMessage({ fuente: EXTENSION, tipo: "conectada", ok: !error, base: r?.base, error }, location.origin);
  });
});
