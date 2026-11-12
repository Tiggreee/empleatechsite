"use client";

/**
 * Guarda el CV a la medida en .docx. Con la extensión (1.0.3+) va a Descargas\CV<mes>-<día>\ y la extensión borra los
 * de antier para atrás; sin ella, es una descarga normal (Chrome no deja a una página elegir carpeta).
 */

const APP = "empleatech-app";
const EXTENSION = "empleatech-extension";
const ESPERA_MS = 15000;

export interface ResultadoGuardado {
  /** Ruta completa donde quedó, si la extensión la reporta. */
  ruta?: string;
  /** CVs viejos que la extensión borró. */
  borrados: number;
  /** true = la extensión lo puso en la carpeta del día; false = descarga normal en Descargas. */
  enCarpetaDelDia: boolean;
}

/** ¿La extensión instalada sabe guardar en la carpeta del día? Pregunta y espera su «lista» un momento. */
function extensionGuardaCv(espera = 800): Promise<boolean> {
  return new Promise((resolver) => {
    const fin = (si: boolean) => {
      window.clearTimeout(reloj);
      window.removeEventListener("message", escuchar);
      resolver(si);
    };
    function escuchar(e: MessageEvent<{ fuente?: string; tipo?: string; guardaCv?: boolean }>) {
      if (e.source !== window || e.origin !== window.location.origin || e.data?.fuente !== EXTENSION || e.data.tipo !== "lista") return;
      fin(e.data.guardaCv === true);
    }
    const reloj = window.setTimeout(() => fin(false), espera);
    window.addEventListener("message", escuchar);
    window.postMessage({ fuente: APP, tipo: "hola" }, window.location.origin);
  });
}

function aBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function descargaNormal(bytes: Uint8Array, nombre: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function guardarCvDocx(bytes: Uint8Array, nombre: string): Promise<ResultadoGuardado> {
  if (!(await extensionGuardaCv())) {
    descargaNormal(bytes, nombre);
    return { borrados: 0, enCarpetaDelDia: false };
  }
  return new Promise((resolver, rechazar) => {
    const reloj = window.setTimeout(() => {
      window.removeEventListener("message", escuchar);
      rechazar(new Error("La extensión no contestó. Recarga esta página e intenta de nuevo."));
    }, ESPERA_MS);
    function escuchar(e: MessageEvent<{ fuente?: string; tipo?: string; ok?: boolean; ruta?: string; borrados?: number; error?: string }>) {
      if (e.source !== window || e.origin !== window.location.origin || e.data?.fuente !== EXTENSION || e.data.tipo !== "cv-guardado") return;
      window.clearTimeout(reloj);
      window.removeEventListener("message", escuchar);
      if (e.data.ok) resolver({ ruta: e.data.ruta, borrados: e.data.borrados ?? 0, enCarpetaDelDia: true });
      else rechazar(new Error(e.data.error ?? "No se pudo guardar el CV."));
    }
    window.addEventListener("message", escuchar);
    window.postMessage({ fuente: APP, tipo: "guardar-cv", nombre, base64: aBase64(bytes) }, window.location.origin);
  });
}
