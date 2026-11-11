"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import BorrarDatos from "@/components/BorrarDatos";
import { cvActivo } from "@/core/perfil/perfil";
import { ETIQUETA_RECOMENDACION, ordenarPorPrioridad } from "@/core/seguimiento/prioridad";
import { accionesDeHoy, brechasFrecuentes, generarInsights } from "@/core/seguimiento/panel";
import { estadisticas } from "@/core/seguimiento/seguimiento";
import { TONO_RECOMENDACION } from "@/features/analizar/ResultadoAnalisis";
import { useDatosApp } from "@/storage/hooks";
import { Aviso, Encabezado, EnlaceBoton, Estadistica, Insignia, Tarjeta } from "@/ui/ui";
import QueMejorar from "./QueMejorar";

const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);

function Paso({ hecho, n, titulo, detalle, href, accion }: { hecho: boolean; n: number; titulo: string; detalle: string; href: string; accion: string }) {
  return (
    <li className="vidrio flex items-start gap-4 p-4">
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold ${hecho ? "bg-ok/20 text-ok" : "bg-superficie"}`} aria-hidden="true">{hecho ? "?" : n}</span>
      <div className="flex-1">
        <p className="font-medium">{titulo}{hecho && <span className="sr-only"> (hecho)</span>}</p>
        <p className="text-sm text-tenue">{detalle}</p>
      </div>
      {!hecho && <EnlaceBoton href={href} pequeno>{accion}</EnlaceBoton>}
    </li>
  );
}

export default function Panel() {
  const { postulaciones: lista, perfil } = useDatosApp();
  const [ahora] = useState(() => new Date());
  const cv = cvActivo(perfil);

  const datos = useMemo(() => {
    const stats = estadisticas(lista, ahora);
    return {
      stats,
      hoy: accionesDeHoy(lista, ahora),
      insights: generarInsights(lista, ahora, Boolean(cv)),
      top: ordenarPorPrioridad(lista.filter((p) => p.estado === "guardada" && p.oferta), ahora).slice(0, 5),
      brechas: brechasFrecuentes(lista, 5),
    };
  }, [lista, ahora, cv]);

  const { stats, hoy, insights, top, brechas } = datos;
  const analizadas = lista.filter((p) => p.oferta).length;
  const empezando = !cv || lista.length === 0;
  const etapas: { etiqueta: string; n: number; tasa?: number | null }[] = [
    { etiqueta: "Enviadas", n: stats.postuladas },
    { etiqueta: "Entrevista", n: stats.entrevistas, tasa: stats.tasaEntrevista },
    { etiqueta: "Oferta", n: stats.ofertas, tasa: stats.tasaOferta },
  ];

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <Encabezado titulo="Tu panel" descripcion={ahora.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })} acciones={<EnlaceBoton href="/analizar">Analizar una oferta</EnlaceBoton>} />


      {empezando && (
        <section aria-labelledby="empezar" className="mb-10">
          <h2 id="empezar" className="mb-3 font-semibold">Empieza en tres pasos</h2>
          <ol className="space-y-3">
            <Paso n={1} hecho={Boolean(cv)} titulo="Guarda tu CV" detalle="En PDF, DOCX, ODT o texto. Leemos tu perfil automáticamente." href="/cv" accion="Subir CV" />
            <Paso n={2} hecho={analizadas > 0} titulo="Analiza una oferta" detalle="Verás tu afinidad, tus brechas y si la oferta tiene señales de riesgo." href="/analizar" accion="Analizar" />
            <Paso n={3} hecho={stats.postuladas > 0} titulo="Guarda el avance en tu tracker" detalle="Marca lo que sí enviaste tú y revisa seguimientos desde el panel." href="/postulaciones" accion="Ir a postulaciones" />
          </ol>
        </section>
      )}

      <section aria-label="Resumen" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Estadistica etiqueta="Guardadas" valor={stats.porEstado.guardada} />
        <Estadistica etiqueta="Postuladas" valor={stats.postuladas} />
        <Estadistica etiqueta="Tasa de entrevista" valor={pct(stats.tasaEntrevista)} pista={stats.postuladas === 0 ? "Aún sin postulaciones" : `${stats.postuladas} postulaciones`} />
        <Estadistica etiqueta="Afinidad promedio" valor={stats.scorePromedio === null ? "—" : `${stats.scorePromedio}%`} />
      </section>

      {cv && <QueMejorar />}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Tarjeta titulo="Para hoy">
          {hoy.length === 0 ? (
            <p className="text-sm text-tenue">Nada urgente. Cuando una postulación necesite seguimiento, aparecerá aquí.</p>
          ) : (
            <ul className="space-y-2">
              {hoy.map((a) => (
                <li key={a.id}>
                  <Link href={`/postulaciones#p-${a.id}`} className="block rounded-lg px-2 py-2 hover:bg-superficie">
                    <p className="text-sm font-medium">{a.puesto} <span className="font-normal text-tenue">· {a.empresa}</span></p>
                    <p className={`text-xs ${a.tono === "urgente" ? "text-riesgo" : "text-aviso"}`}>{a.texto}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>

        <Tarjeta titulo="Recomendaciones">
          {insights.length === 0 ? (
            <p className="text-sm text-tenue">Sin recomendaciones por ahora. Analiza más ofertas para obtener sugerencias basadas en tus datos.</p>
          ) : (
            <ul className="space-y-2">
              {insights.map((i) => (
                <li key={i.id}>
                  <Aviso tono={i.tono === "urgente" ? "riesgo" : i.tono === "atencion" ? "aviso" : "ok"} titulo={i.titulo}>{i.detalle}</Aviso>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>

        <Tarjeta titulo="Ofertas guardadas por prioridad" acciones={<Link href="/postulaciones" className="text-xs text-cian underline underline-offset-4">Ver todas</Link>}>
          {top.length === 0 ? (
            <p className="text-sm text-tenue">Guarda ofertas desde «Analizar» y aquí verás cuáles conviene priorizar.</p>
          ) : (
            <ol className="space-y-2">
              {top.map(({ postulacion: p, prioridad: pr }) => (
                <li key={p.id} className="flex items-center justify-between gap-3">
                  <Link href={`/postulaciones#p-${p.id}`} className="min-w-0 text-sm hover:underline">
                    <span className="font-medium">{p.puesto}</span> <span className="text-tenue">· {p.empresa}</span>
                  </Link>
                  <span className="flex shrink-0 items-center gap-2">
                    <Insignia tono={TONO_RECOMENDACION[pr.recomendacion]}>{ETIQUETA_RECOMENDACION[pr.recomendacion]}</Insignia>
                    <span className="w-9 text-right text-sm font-semibold">{pr.valor ?? "—"}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Tarjeta>

        <Tarjeta titulo="Lo que más falta en tus postulaciones">
          {brechas.length === 0 ? (
            <p className="text-sm text-tenue">Cuando guardes varias ofertas, aquí verás qué habilidades se repiten y aún no aparecen en tu CV.</p>
          ) : (
            <ul className="space-y-2">
              {brechas.map((b) => (
                <li key={b.label} className="flex items-center justify-between text-sm">
                  <span>{b.label}</span>
                  <Insignia tono="aviso">{b.veces} oferta{b.veces === 1 ? "" : "s"}</Insignia>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </div>

      <Tarjeta titulo="Embudo" className="mt-6" acciones={<Link href="/resultados" className="text-xs text-cian underline underline-offset-4">Qué te funciona</Link>}>
        {stats.postuladas === 0 ? (
          <p className="text-sm text-tenue">Cuando envíes tu primera postulación, aquí verás cuántas llegan a entrevista y a oferta.</p>
        ) : (
          <>
            <ul className="space-y-2" aria-label="Postulaciones enviadas por etapa alcanzada">
              {etapas.map((e) => (
                <li key={e.etiqueta} className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0 text-tenue">{e.etiqueta}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-superficie">
                    <span className="block h-full rounded-full bg-gradient-to-r from-cian to-violeta" style={{ width: `${(e.n / stats.postuladas) * 100}%`, minWidth: e.n ? 4 : 0 }} />
                  </span>
                  <span className="w-24 whitespace-nowrap text-right tabular-nums">
                    <span className="font-medium">{e.n}</span>
                    {e.tasa !== undefined && <span className="text-tenue"> · {pct(e.tasa)}</span>}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-tenue">
              {stats.enEspera} esperando respuesta · {stats.cerradasSinEntrevista} cerrada{stats.cerradasSinEntrevista === 1 ? "" : "s"} sin entrevista
              {stats.diasPromedioRespuesta !== null && ` · ${stats.diasPromedioRespuesta} días en promedio a la entrevista`}. Cuenta lo que alcanzó cada postulación, aunque hoy esté cerrada.
            </p>
          </>
        )}
      </Tarjeta>

      <div className="mt-6">
        <BorrarDatos />
      </div>
    </main>
  );
}

