"use client";

import { useState } from "react";
import { useDatosApp } from "@/storage/hooks";

export default function BorrarDatos() {
  const { perfil, postulaciones, borrarDatos } = useDatosApp();
  const [msg, setMsg] = useState<string | null>(null);
  const [borrando, setBorrando] = useState(false);
  const cantidad = postulaciones.length;
  const cvs = perfil.cvs.length;

  return (
    <div className="vidrio p-5">
      <p className="text-sm">
        Ahora mismo guardas <strong>{cantidad}</strong> postulación{cantidad === 1 ? "" : "es"} y <strong>{cvs}</strong> CV{cvs === 1 ? "" : "s"} guardados.
      </p>
      <button
        className="boton boton-sec mt-3"
        disabled={borrando || (cantidad === 0 && cvs === 0)}
        onClick={async () => {
          if (!window.confirm("Se borrarán tus CVs, ofertas guardadas y postulaciones. ¿Continuar?")) return;
          setBorrando(true);
          try {
            await borrarDatos();
            setMsg("Datos borrados.");
          } catch (error) {
            setMsg(error instanceof Error ? error.message : "No se pudieron borrar los datos.");
          } finally {
            setBorrando(false);
          }
        }}
      >
        Borrar mis datos guardados
      </button>
      {msg && <p role="status" className="mt-2 text-sm text-tenue">{msg}</p>}
    </div>
  );
}

