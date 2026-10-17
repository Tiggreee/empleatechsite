"use client";

import { useState } from "react";

export interface AvisoGuardado {
  tono: "ok" | "riesgo";
  texto: string;
}

/** Guarda y deja un aviso: el texto de éxito si salió bien, el error tal cual si no. */
export function useGuardarConAviso() {
  const [msg, setMsg] = useState<AvisoGuardado | null>(null);
  async function guardar(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      setMsg({ tono: "ok", texto: ok });
    } catch (e) {
      setMsg({ tono: "riesgo", texto: e instanceof Error ? e.message : "No se pudo guardar." });
    }
  }
  return { msg, guardar };
}
