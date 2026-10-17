"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cambiosEntre, hayCambios, type CambiosEstado, type EstadoApp } from "@/core/estado/cambios";
import { PERFIL_VACIO, sanitizarPerfil } from "@/core/perfil/perfil";
import { sanitizar, type Postulacion } from "@/core/seguimiento/seguimiento";
import { borrarEstadoLocal, guardarEstadoLocal, leerEstadoLocal } from "./almacenes";

interface ContextoDatos extends EstadoApp {
  cargando: boolean;
  error: string | null;
  /** Lo que ves es la copia guardada en este navegador: el servidor todavía no responde (o no respondió). */
  copiaLocal: boolean;
  /** El servidor dijo 401: la sesión terminó y hay que volver a entrar. */
  sesionVencida: boolean;
  guardarEstado: (siguiente: Partial<EstadoApp>) => Promise<EstadoApp>;
  recargar: () => Promise<EstadoApp>;
  borrarDatos: () => Promise<void>;
}

const DatosContexto = createContext<ContextoDatos | null>(null);

function normalizar(payload: Partial<EstadoApp> | null | undefined): EstadoApp {
  return {
    perfil: sanitizarPerfil(payload?.perfil ?? PERFIL_VACIO),
    postulaciones: sanitizar(payload?.postulaciones ?? []).items,
  };
}

/** Error al leer tus datos, con el código HTTP para distinguir «sin sesión» de «el servidor falló». */
class ErrorDatos extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

async function leerServidor(): Promise<EstadoApp> {
  const res = await fetch("/api/state", { cache: "no-store" });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ErrorDatos(body?.error ?? "No se pudo leer el estado del servidor.", res.status);
  }
  return normalizar((await res.json()) as EstadoApp);
}

/** Manda solo lo que cambió; el servidor responde con tus datos completos (incluido lo que otra pestaña o la extensión
 *  guardaron mientras tanto). */
async function escribirServidor(cambios: CambiosEstado): Promise<EstadoApp> {
  const res = await fetch("/api/state", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cambios),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "No se pudo guardar el estado en el servidor.");
  }
  return normalizar((await res.json()) as EstadoApp);
}

function estaVacio(estado: EstadoApp): boolean {
  return estado.perfil.cvs.length === 0 && estado.postulaciones.length === 0;
}

export function DatosProvider({ children }: { children: ReactNode }) {
  // El primer render debe coincidir con el HTML del servidor (que no ve el navegador): arranca vacío y la copia local
  // se aplica justo después de montar.
  const [perfil, setPerfil] = useState(PERFIL_VACIO);
  const [postulaciones, setPostulaciones] = useState<Postulacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiaLocal, setCopiaLocal] = useState(false);
  const [sesionVencida, setSesionVencida] = useState(false);
  // Lo último que dijo el servidor: guardar compara contra esto y manda solo la diferencia.
  const base = useRef<EstadoApp>(normalizar(null));

  const aplicarEstado = useCallback((estado: EstadoApp) => {
    base.current = estado;
    setPerfil(estado.perfil);
    setPostulaciones(estado.postulaciones);
    setCopiaLocal(false);
    guardarEstadoLocal(estado);
    return estado;
  }, []);

  const fallo = useCallback((err: unknown) => {
    setError(err instanceof Error ? err.message : "No pudimos cargar tus datos.");
    setSesionVencida(err instanceof ErrorDatos && err.status === 401);
  }, []);

  const recargar = useCallback(async () => {
    try {
      const remoto = await leerServidor();
      setError(null);
      setSesionVencida(false);
      return aplicarEstado(remoto);
    } catch (err) {
      fallo(err);
      throw err;
    }
  }, [aplicarEstado, fallo]);

  const guardarEstado = useCallback(async (siguiente: Partial<EstadoApp>) => {
    const payload = normalizar({
      perfil: siguiente.perfil ?? perfil,
      postulaciones: siguiente.postulaciones ?? postulaciones,
    });
    const cambios = cambiosEntre(base.current, payload);
    if (!hayCambios(cambios)) return payload;
    const guardado = await escribirServidor(cambios);
    setError(null);
    return aplicarEstado(guardado);
  }, [aplicarEstado, perfil, postulaciones]);

  const borrarDatos = useCallback(async () => {
    const res = await fetch("/api/state", { method: "DELETE" });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? "No se pudieron borrar los datos guardados.");
    }
    borrarEstadoLocal();
    base.current = normalizar(null);
    setPerfil(PERFIL_VACIO);
    setPostulaciones([]);
    setError(null);
  }, []);

  useEffect(() => {
    let activo = true;

    void (async () => {
      const semillaLocal = normalizar(leerEstadoLocal());
      if (!estaVacio(semillaLocal)) {
        setPerfil(semillaLocal.perfil);
        setPostulaciones(semillaLocal.postulaciones);
        setCopiaLocal(true);
      }
      try {
        const remoto = await leerServidor();
        if (!activo) return;
        if (estaVacio(remoto) && !estaVacio(semillaLocal)) {
          const migrado = await escribirServidor(cambiosEntre(remoto, semillaLocal));
          if (!activo) return;
          aplicarEstado(migrado);
        } else {
          aplicarEstado(remoto);
        }
        setError(null);
      } catch (err) {
        if (!activo) return;
        fallo(err);
      } finally {
        if (activo) setCargando(false);
      }
    })();

    return () => {
      activo = false;
    };
  }, [aplicarEstado, fallo]);

  // Al volver a esta pestaña (por ejemplo, después de postular con la extensión) se ve lo último del servidor.
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === "visible" && !cargando) void recargar().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [cargando, recargar]);

  const valor = useMemo<ContextoDatos>(() => ({
    perfil,
    postulaciones,
    cargando,
    error,
    copiaLocal,
    sesionVencida,
    guardarEstado,
    recargar,
    borrarDatos,
  }), [perfil, postulaciones, cargando, error, copiaLocal, sesionVencida, guardarEstado, recargar, borrarDatos]);

  return <DatosContexto.Provider value={valor}>{children}</DatosContexto.Provider>;
}

export function useDatosApp(): ContextoDatos {
  const valor = useContext(DatosContexto);
  if (!valor) throw new Error("useDatosApp debe usarse dentro de DatosProvider.");
  return valor;
}
