"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import CamposOferta from "@/components/CamposOferta";
import { ordenarPorPrioridad, prioridad } from "@/core/seguimiento/prioridad";
import { ESTADOS, ETIQUETA_ESTADO, crear, estadisticas, exportarCSV, exportarJSON, fusionar, importarJSON, type Postulacion } from "@/core/seguimiento/seguimiento";
import { useDatosApp } from "@/storage/hooks";
import { Aviso, Boton, Encabezado, EnlaceBoton, Estadistica, Vacio } from "@/ui/ui";
import TarjetaPostulacion from "./TarjetaPostulacion";

function descargar(nombre: string, contenido: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);

export default function Postulaciones() {
  const { postulaciones: lista, guardarEstado } = useDatosApp();
  const [ahora, setAhora] = useState(() => new Date());
  const [empresa, setEmpresa] = useState("");
  const [puesto, setPuesto] = useState("");
  const [url, setUrl] = useState("");
  const [buscar, setBuscar] = useState("");
  const [ocultarCerradas, setOcultarCerradas] = useState(false);
  const [msg, setMsg] = useState<{ tono: "ok" | "riesgo"; texto: string } | null>(null);

  const stats = useMemo(() => estadisticas(lista, ahora), [lista, ahora]);
  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return lista.filter((p) => (!q || `${p.empresa} ${p.puesto}`.toLowerCase().includes(q)) && !(ocultarCerradas && p.estado === "rechazada"));
  }, [lista, buscar, ocultarCerradas]);

  async function aplicar(fn: (l: Postulacion[]) => Postulacion[], okTexto?: string) {
    setAhora(new Date());
    try {
      await guardarEstado({ postulaciones: fn(lista) });
      setMsg(okTexto ? { tono: "ok", texto: okTexto } : null);
    } catch (e) {
      setMsg({ tono: "riesgo", texto: e instanceof Error ? e.message : "No se pudo completar la acción." });
    }
  }

  async function agregar() {
    await aplicar((l) => crear(l, { empresa, puesto, url }, new Date(), crypto.randomUUID()));
    setEmpresa("");
    setPuesto("");
    setUrl("");
  }

  async function importar(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      if (f.size > 5_000_000) throw new Error("El archivo es demasiado grande.");
      const { items, descartadas } = importarJSON(await f.text());
      await aplicar((l) => fusionar(l, items), `Importadas ${items.length} postulaciones${descartadas ? ` (${descartadas} descartadas por inválidas)` : ""}.`);
    } catch (err) {
      setMsg({ tono: "riesgo", texto: err instanceof Error ? err.message : "No se pudo importar." });
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <Encabezado
        titulo="Mis postulaciones"
        descripcion="Tu tracker: prioridad, estado, notas, seguimiento y exportación."
        acciones={<EnlaceBoton href="/analizar">Analizar una oferta</EnlaceBoton>}
      />


      <section aria-label="Resumen" className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Estadistica etiqueta="Total" valor={stats.total} />
        <Estadistica etiqueta="Postuladas" valor={stats.postuladas} />
        <Estadistica etiqueta="Tasa de entrevista" valor={pct(stats.tasaEntrevista)} />
        <Estadistica etiqueta="Días a primera respuesta" valor={stats.diasPromedioRespuesta === null ? "—" : stats.diasPromedioRespuesta} />
        <Estadistica etiqueta="Seguimientos pendientes" valor={stats.pendientesSeguimiento} tono={stats.pendientesSeguimiento > 0 ? "riesgo" : undefined} />
      </section>

      <section className="vidrio mt-6 p-4" aria-label="Agregar y herramientas">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1.5fr_auto]">
          <CamposOferta empresa={empresa} puesto={puesto} url={url} onEmpresa={setEmpresa} onPuesto={setPuesto} onUrl={setUrl} />
          <Boton onClick={() => void agregar()} disabled={!empresa.trim() || !puesto.trim()}>Agregar</Boton>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <input type="search" className="campo !w-auto min-w-48 !py-1.5 !text-xs" placeholder="Buscar empresa o puesto" aria-label="Buscar" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
          <label className="flex items-center gap-1.5 text-tenue"><input type="checkbox" checked={ocultarCerradas} onChange={(e) => setOcultarCerradas(e.target.checked)} /> Ocultar cerradas</label>
          <span className="mx-1 hidden h-4 w-px bg-superficie sm:block" />
          <Boton pequeno variante="secundario" disabled={!lista.length} onClick={() => descargar("empleatech-postulaciones.json", exportarJSON(lista, new Date()), "application/json")}>Exportar JSON</Boton>
          <Boton pequeno variante="secundario" disabled={!lista.length} onClick={() => descargar("empleatech-postulaciones.csv", exportarCSV(lista), "text/csv")}>Exportar CSV</Boton>
          <label className="boton boton-sec cursor-pointer !px-2.5 !py-1.5 !text-xs">
            Importar JSON
            <input type="file" accept="application/json,.json" className="sr-only" onChange={importar} />
          </label>
        </div>
        {msg && <Aviso tono={msg.tono} className="mt-3">{msg.texto}</Aviso>}
      </section>

      {lista.length === 0 ? (
        <div className="mt-8">
          <Vacio titulo="Todavía no tienes postulaciones" accion={<EnlaceBoton href="/analizar">Analizar mi primera oferta</EnlaceBoton>}>
            Analiza una oferta contra tu CV y guárdala: aquí la verás ordenada por prioridad y con recordatorios de seguimiento.
          </Vacio>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 md:grid-cols-3 xl:grid-cols-5">
          {ESTADOS.map((estado) => {
            const items = filtradas.filter((p) => p.estado === estado);
            const ordenadas =
              estado === "guardada"
                ? ordenarPorPrioridad(items, ahora)
                : [...items].sort((a, b) => new Date(b.actualizadaEn).getTime() - new Date(a.actualizadaEn).getTime()).map((p) => ({ postulacion: p, prioridad: prioridad(p, ahora) }));
            return (
              <section key={estado} aria-label={ETIQUETA_ESTADO[estado]}>
                <h2 className="mb-3 text-sm font-medium text-tenue">{ETIQUETA_ESTADO[estado]} ({items.length})</h2>
                <div className="space-y-3">
                  {ordenadas.map(({ postulacion, prioridad: pr }) => (
                    <TarjetaPostulacion key={postulacion.id} p={postulacion} prioridad={pr} ahora={ahora} aplicar={aplicar} />
                  ))}
                  {items.length === 0 && <p className="rounded-xl border border-dashed border-linea p-4 text-center text-xs text-tenue">Vacío</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}

