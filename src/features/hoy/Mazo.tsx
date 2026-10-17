"use client";

import Link from "next/link";
import { useRef, useState, type PointerEvent } from "react";
import { ETIQUETA_RECOMENDACION } from "@/core/seguimiento/prioridad";
import type { VacantePuntuada } from "@/core/vacantes/busqueda";
import { MODALIDAD, TONO_RECOMENDACION, avisoExtension, hace, nombreFuente, salario } from "@/features/vacantes/cliente";
import { Bloques, Insignia, Puntaje, cx } from "@/ui/ui";

/** Distancia (px) a partir de la cual soltar la tarjeta cuenta como decisión. */
const UMBRAL = 110;

interface Props {
  items: VacantePuntuada[];
  ahora: Date | null;
  ocupado: string | null;
  onEnviada: (item: VacantePuntuada) => Promise<void> | void;
  onSaltar: (item: VacantePuntuada) => Promise<void> | void;
}

/**
 * Tus vacantes de hoy en el celular: una a la vez. Se desliza a la izquierda para saltarla y a la derecha cuando ya la
 * enviaste (pide confirmación, como el botón). Los tres botones hacen lo mismo para quien no quiera deslizar.
 */
export default function Mazo({ items, ahora, ocupado, onEnviada, onSaltar }: Props) {
  const [dx, setDx] = useState(0);
  const inicio = useRef<number | null>(null);
  const v = items[0];
  if (!v) return null;
  const cuando = ahora ? hace(v.vacante.publicadaEn, ahora.getTime()) : null;
  const sal = salario(v.vacante.salario);
  const proyecto = v.vacante.tipo === "proyecto";
  const r = v.resumen;

  const soltar = async (x: number) => {
    if (inicio.current === null) return;
    // La distancia sale del evento, no del último render: en un deslizamiento rápido el dedo se levanta antes de que
    // React pinte el último movimiento, y con `dx` la decisión se perdía.
    const d = x - inicio.current;
    inicio.current = null;
    setDx(0);
    if (d <= -UMBRAL) await onSaltar(v);
    else if (d >= UMBRAL) await onEnviada(v);
  };

  const eventos = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if ((e.target as HTMLElement).closest("a, button")) return;
      inicio.current = e.clientX;
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      if (inicio.current !== null) setDx(e.clientX - inicio.current);
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => void soltar(e.clientX),
    onPointerCancel: () => {
      inicio.current = null;
      setDx(0);
    },
  };

  const pista = dx <= -40 ? "Saltar" : dx >= 40 ? "Ya la envié" : null;

  return (
    <section aria-label="Vacantes de hoy, una a la vez" className="md:hidden">
      <div className="mb-3 flex items-center justify-between font-mono text-xs uppercase tracking-widest text-tenue">
        <span>Vacante 1 de {items.length}</span>
        {pista && <span className={cx("font-semibold", dx < 0 ? "text-tenue" : "text-cian")}>{pista}</span>}
      </div>

      <div className="relative">
        {items.slice(1, 3).map((_, i) => (
          <div
            key={i}
            aria-hidden="true"
            className="absolute inset-0 border-2 border-texto bg-papel"
            style={{ transform: `translate(${(i + 1) * 6}px, ${(i + 1) * 8}px)`, zIndex: -1 - i }}
          />
        ))}
        <ul className="relative">
          <li>
            <article
              aria-label={`${v.vacante.titulo} en ${v.vacante.empresa}`}
              className="touch-pan-y select-none border-2 border-texto bg-papel p-5"
              style={{ transform: dx ? `translateX(${dx}px) rotate(${dx / 24}deg)` : undefined, transition: dx ? "none" : "transform 0.2s" }}
              {...eventos}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="font-mono text-[11px] uppercase tracking-wider text-tenue">
                    {nombreFuente(v.vacante.fuente)}
                    {cuando ? ` / ${cuando}` : ""}
                  </p>
                  <h2 className="text-2xl font-black leading-tight tracking-tight">{v.vacante.titulo}</h2>
                  <p className="text-base">{v.vacante.empresa}</p>
                </div>
                <Puntaje valor={v.prioridad.valor} tamano={72} />
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5">
                <Insignia tono={TONO_RECOMENDACION[v.prioridad.recomendacion]}>{ETIQUETA_RECOMENDACION[v.prioridad.recomendacion]}</Insignia>
                {v.vacante.modalidad && <Insignia>{MODALIDAD[v.vacante.modalidad]}</Insignia>}
                {sal && <Insignia tono="ok">{sal}</Insignia>}
                {v.vacante.ats && <Insignia tono="cian">Formulario {v.vacante.ats}</Insignia>}
                {proyecto && <Insignia tono="cian">Proyecto freelance</Insignia>}
                <Insignia tono={avisoExtension(v.vacante).tono}>{avisoExtension(v.vacante).texto}</Insignia>
              </div>

              {r.total > 0 && (
                <div className="mt-4 border-t border-linea pt-4">
                  <Bloques cubiertas={r.cubiertas} total={r.total} />
                  <p className="mt-2 text-sm font-semibold">
                    Cubres {r.cubiertas} de {r.total} requisitos
                  </p>
                  {r.brechas.length > 0 && <p className="mt-1 text-sm text-tenue">Te falta: {r.brechas.slice(0, 3).join(", ")}</p>}
                </div>
              )}

              <a
                className="mt-4 inline-block text-sm font-semibold underline underline-offset-4"
                href={v.vacante.urlPostular ?? v.vacante.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {proyecto ? "Abrir proyecto ↗" : "Abrir formulario ↗"}
              </a>

              <div className="mt-5 grid grid-cols-3 gap-2">
                <button type="button" className="boton boton-sec !px-2" disabled={ocupado === v.vacante.id} onClick={() => void onSaltar(v)}>
                  Saltar
                </button>
                <Link className="boton !px-2" href={`/preparar?vacante=${encodeURIComponent(v.vacante.id)}`}>
                  {proyecto ? "Propuesta" : "CV y carta"}
                </Link>
                <button type="button" className="boton boton-sec !px-2" disabled={ocupado === v.vacante.id} onClick={() => void onEnviada(v)}>
                  Ya la envié
                </button>
              </div>
            </article>
          </li>
        </ul>
      </div>
      <p className="mt-4 text-center text-xs text-tenue">Desliza a la izquierda para saltar, a la derecha cuando ya la enviaste.</p>
    </section>
  );
}
