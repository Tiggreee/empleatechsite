"use client";

import { useEffect, useState, type FormEvent } from "react";
import { evaluarContrasena } from "@/core/acceso/fuerza";
import { rutaDeRegreso } from "@/core/acceso/regreso";
import { pedir } from "@/features/vacantes/cliente";
import { Aviso, Boton, Tarjeta } from "@/ui/ui";
import Medidor from "./Medidor";

interface EstadoAcceso {
  requerido: boolean;
  configurado: boolean;
  sesion: boolean;
  /** Ya escribiste bien tu contraseña; falta el código de tu app (dura 5 minutos). */
  segundoPaso: boolean;
}

/** Solo rutas internas: un enlace «/entrar?volver=…» no te saca de EmpleaTech (ver core/acceso/regreso). */
function destino(): string {
  return rutaDeRegreso(new URLSearchParams(window.location.search).get("volver"), window.location.origin);
}

export default function Entrar() {
  const [estado, setEstado] = useState<EstadoAcceso | null>(null);
  const [codigo, setCodigo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [codigoApp, setCodigoApp] = useState("");
  const [conRespaldo, setConRespaldo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    pedir<EstadoAcceso>("/api/acceso")
      .then((e) => {
        if (!e.requerido || e.sesion) window.location.replace(destino());
        else setEstado(e);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "No pudimos revisar tu acceso."));
  }, []);

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    if (!estado) return;
    setError(null);
    let datos: Record<string, string>;
    if (estado.segundoPaso) datos = { accion: "segundo-paso", codigo: codigoApp };
    else if (estado.configurado) datos = { accion: "entrar", contrasena };
    else {
      const fuerza = evaluarContrasena(contrasena, window.location.hostname.split(/[.-]/));
      if (!fuerza.valida) return setError(fuerza.problemas[0]);
      if (contrasena !== confirmacion) return setError("Las contraseñas no coinciden.");
      datos = { accion: "crear", codigo, contrasena };
    }
    setEnviando(true);
    try {
      const r = await pedir<{ segundoPaso?: boolean }>("/api/acceso", { method: "POST", body: JSON.stringify(datos) });
      if (r.segundoPaso) {
        setEstado({ ...estado, segundoPaso: true });
        setContrasena("");
        setEnviando(false);
        return;
      }
      // Recarga completa: así la app vuelve a leer tus datos ya con sesión.
      window.location.assign(destino());
    } catch (e) {
      const texto = e instanceof Error ? e.message : "No se pudo entrar.";
      // El segundo paso dura 5 minutos: si venció, de vuelta a la contraseña.
      if (estado.segundoPaso && /venció/.test(texto)) setEstado({ ...estado, segundoPaso: false });
      setError(texto);
      setEnviando(false);
    }
  }

  const crear = estado && !estado.configurado;
  const paso2 = estado?.segundoPaso;
  return (
    <main className="mx-auto flex max-w-md flex-col px-5 py-16">
      <Tarjeta titulo={paso2 ? "Verificación en dos pasos" : crear ? "Crea tu contraseña" : "Entrar a EmpleaTech"}>
        {!estado && !error && <p className="text-sm text-tenue">Revisando tu acceso…</p>}
        {estado && paso2 && (
          <form className="space-y-4" onSubmit={(e) => void enviar(e)}>
            <p className="text-sm text-tenue">
              {conRespaldo ? "Escribe uno de tus códigos de respaldo. Cada uno sirve una sola vez." : "Abre tu app de autenticación y escribe el código de 6 dígitos de EmpleaTech."}
            </p>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{conRespaldo ? "Código de respaldo" : "Código de verificación"}</span>
              <input
                className="campo font-mono"
                value={codigoApp}
                onChange={(e) => setCodigoApp(e.target.value)}
                inputMode={conRespaldo ? "text" : "numeric"}
                autoComplete="one-time-code"
                placeholder={conRespaldo ? "abcde-fghij" : "123456"}
                spellCheck={false}
                autoFocus
                required
              />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <Boton type="submit" disabled={enviando}>
                {enviando ? "Verificando…" : "Verificar"}
              </Boton>
              <button
                type="button"
                className="text-sm text-tenue underline underline-offset-4 hover:text-texto"
                onClick={() => {
                  setConRespaldo(!conRespaldo);
                  setCodigoApp("");
                  setError(null);
                }}
              >
                {conRespaldo ? "Usar mi app de autenticación" : "Perdí mi teléfono: usar un código de respaldo"}
              </button>
            </div>
          </form>
        )}
        {estado && !paso2 && (
          <form className="space-y-4" onSubmit={(e) => void enviar(e)}>
            {crear && (
              <>
                <p className="text-sm text-tenue">Es la primera vez: usa el código de acceso que te di al publicar la app y elige tu contraseña. Solo tú podrás entrar.</p>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Código de acceso</span>
                  <input className="campo" value={codigo} onChange={(e) => setCodigo(e.target.value)} autoComplete="one-time-code" required />
                </label>
              </>
            )}
            <div>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Contraseña</span>
                <input
                  className="campo"
                  type="password"
                  value={contrasena}
                  onChange={(e) => setContrasena(e.target.value)}
                  autoComplete={crear ? "new-password" : "current-password"}
                  minLength={crear ? 12 : undefined}
                  aria-describedby={crear ? "ayuda-contrasena" : undefined}
                  required
                />
              </label>
              {crear && <Medidor contrasena={contrasena} id="ayuda-contrasena" />}
            </div>
            {crear && (
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Repite la contraseña</span>
                <input className="campo" type="password" value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} autoComplete="new-password" required />
              </label>
            )}
            <Boton type="submit" disabled={enviando}>
              {enviando ? "Entrando…" : crear ? "Crear y entrar" : "Entrar"}
            </Boton>
          </form>
        )}
        {error && (
          <Aviso tono="riesgo" className="mt-4">
            {error}
          </Aviso>
        )}
      </Tarjeta>
    </main>
  );
}
