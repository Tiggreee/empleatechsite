"use client";

import { useEffect, useMemo, useState } from "react";
import { MAX_PROPUESTA, prepararDocumentos, type DocumentosAMedida, type IdiomaDoc, type OfertaParaDocs } from "@/core/documentos/aMedida";
import { cvADocx, nombreCvDocx } from "@/core/documentos/docx";
import { TITULOS, cvATexto, rangoFechas } from "@/core/documentos/formato";
import type { PerfilJson } from "@/core/perfil/estructurado";
import { cvActivo, estructuradoDe } from "@/core/perfil/perfil";
import { useDatosApp } from "@/storage/hooks";
import { Aviso, Boton, Encabezado, EnlaceBoton, Insignia, Tarjeta, Vacio, cx } from "@/ui/ui";
import { guardarCvDocx, type ResultadoGuardado } from "./guardarDocx";

interface Props {
  vacanteId?: string;
  postulacionId?: string;
}

type Vista = "cv" | "carta" | "propuesta";
const NOMBRE_VISTA: Record<Vista, string> = { cv: "CV", carta: "Carta de presentación", propuesta: "Propuesta" };

function HojaCv({ cv, idioma }: { cv: PerfilJson; idioma: IdiomaDoc }) {
  const t = TITULOS[idioma];
  const b = cv.basics;
  const ubicacion = [b.location?.city, b.location?.region, b.location?.countryCode].filter(Boolean).join(", ");
  const contacto = [b.email, b.phone, ubicacion, b.url, ...b.profiles.map((p) => p.url)].filter(Boolean);
  return (
    <article className="hoja" aria-label="CV a la medida">
      <h1>{b.name || "Tu nombre"}</h1>
      {b.label && <p className="font-medium">{b.label}</p>}
      {contacto.length > 0 && <p className="mt-1 text-[0.95em] text-[#444]">{contacto.join(" · ")}</p>}

      {b.summary && (
        <section>
          <h2>{t.resumen}</h2>
          <p>{b.summary}</p>
        </section>
      )}
      {cv.work.length > 0 && (
        <section>
          <h2>{t.experiencia}</h2>
          {cv.work.map((w, i) => (
            <div key={i} className="mb-3 break-inside-avoid">
              <div className="flex flex-wrap justify-between gap-x-4">
                <p className="font-semibold">{[w.position, w.name].filter(Boolean).join(" — ")}</p>
                <p className="text-[#444]">{[rangoFechas(w.startDate, w.endDate, idioma), w.location].filter(Boolean).join(" · ")}</p>
              </div>
              {w.summary && <p>{w.summary}</p>}
              {w.highlights.length > 0 && (
                <ul className="mt-1 list-disc pl-5">
                  {w.highlights.map((h) => <li key={h}>{h}</li>)}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}
      {cv.education.length > 0 && (
        <section>
          <h2>{t.educacion}</h2>
          {cv.education.map((e, i) => (
            <p key={i}>
              <span className="font-semibold">{[e.studyType, e.area].filter(Boolean).join(" ")}</span>
              {e.institution && ` — ${e.institution}`}
              {(e.startDate || e.endDate) && <span className="text-[#444]"> · {rangoFechas(e.startDate, e.endDate, idioma)}</span>}
            </p>
          ))}
        </section>
      )}
      {cv.skills.length > 0 && (
        <section>
          <h2>{t.habilidades}</h2>
          {cv.skills.map((s) => (
            <p key={s.name}>
              <span className="font-semibold">{s.name}:</span> {s.keywords.join(", ")}
            </p>
          ))}
        </section>
      )}
      {cv.languages.length > 0 && (
        <section>
          <h2>{t.idiomas}</h2>
          <p>{cv.languages.map((l) => [l.language, l.fluency].filter(Boolean).join(" — ")).join(" · ")}</p>
        </section>
      )}
      {cv.certificates.length > 0 && (
        <section>
          <h2>{t.certificaciones}</h2>
          {cv.certificates.map((c) => <p key={c.name}>{[c.name, c.issuer, c.date].filter(Boolean).join(" — ")}</p>)}
        </section>
      )}
      {cv.projects.length > 0 && (
        <section>
          <h2>{t.proyectos}</h2>
          {cv.projects.map((p) => <p key={p.name}>{[p.name, p.description, p.url].filter(Boolean).join(" — ")}</p>)}
        </section>
      )}
    </article>
  );
}

export default function Preparar({ vacanteId, postulacionId }: Props) {
  const { perfil, postulaciones, cargando } = useDatosApp();
  const [oferta, setOferta] = useState<OfertaParaDocs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>("cv");
  const [carta, setCarta] = useState<string | null>(null);
  const [propuesta, setPropuesta] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [docx, setDocx] = useState<{ estado: "guardando" } | { estado: "listo"; r: ResultadoGuardado } | { estado: "error"; error: string } | null>(null);
  const cv = cvActivo(perfil);

  // Oferta desde una vacante encontrada (servidor) o desde una postulación del tracker.
  const deTracker = useMemo((): OfertaParaDocs | undefined => {
    const p = postulacionId ? postulaciones.find((x) => x.id === postulacionId) : undefined;
    return p?.oferta ? { titulo: p.puesto, empresa: p.empresa, texto: p.oferta.texto } : undefined;
  }, [postulacionId, postulaciones]);

  useEffect(() => {
    if (!vacanteId) return;
    let activo = true;
    void (async () => {
      try {
        const res = await fetch(`/api/vacantes?id=${encodeURIComponent(vacanteId)}`, { cache: "no-store" });
        const body = (await res.json().catch(() => null)) as { vacante?: { vacante: { titulo: string; empresa: string; descripcion: string; tipo?: "proyecto" } }; error?: string } | null;
        if (!activo) return;
        if (!res.ok || !body?.vacante) throw new Error(body?.error ?? "No encontramos esa vacante.");
        const v = body.vacante.vacante;
        setOferta({ titulo: v.titulo, empresa: v.empresa, texto: v.descripcion, tipo: v.tipo });
        if (v.tipo === "proyecto") setVista("propuesta");
      } catch (e) {
        if (activo) setError(e instanceof Error ? e.message : "No encontramos esa vacante.");
      }
    })();
    return () => {
      activo = false;
    };
  }, [vacanteId]);

  const fuente = vacanteId ? oferta : deTracker;
  const docs: DocumentosAMedida | null = useMemo(
    () => (cv && fuente ? prepararDocumentos(estructuradoDe(cv), fuente, perfil.respuestas, new Date()) : null),
    [cv, fuente, perfil.respuestas],
  );
  const textoCarta = carta ?? docs?.carta ?? "";
  const textoPropuesta = propuesta ?? docs?.propuesta ?? "";
  const esProyecto = fuente?.tipo === "proyecto";
  const vistas: Vista[] = esProyecto ? ["propuesta", "cv"] : ["cv", "carta"];

  async function copiar(texto: string, que: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(que);
    } catch {
      setCopiado(null);
    }
  }

  async function guardarWord() {
    if (!docs) return;
    setDocx({ estado: "guardando" });
    try {
      const bytes = await cvADocx(docs.cv, docs.idioma);
      setDocx({ estado: "listo", r: await guardarCvDocx(bytes, nombreCvDocx(docs.cv.basics.name, fuente?.titulo, fuente?.empresa)) });
    } catch (e) {
      setDocx({ estado: "error", error: e instanceof Error ? e.message : "No se pudo guardar el CV." });
    }
  }

  if (!cargando && !cv) {
    return (
      <main className="mx-auto max-w-4xl px-5 py-10">
        <Vacio titulo="Primero sube tu CV" accion={<EnlaceBoton href="/cv">Subir mi CV</EnlaceBoton>} />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <div className="no-imprimir">
        <Encabezado
          titulo={esProyecto ? "Propuesta a la medida" : "CV y carta a la medida"}
          descripcion={fuente ? `Para ${fuente.titulo} en ${fuente.empresa}. Usamos solo lo que está en tu perfil: reordenamos y destacamos, nunca inventamos.` : "Preparando…"}
          acciones={<EnlaceBoton variante="secundario" href={postulacionId ? "/postulaciones" : "/vacantes"}>Volver</EnlaceBoton>}
        />
        {error && <Aviso tono="riesgo" className="mb-6">{error}</Aviso>}
        {!vacanteId && postulacionId && !cargando && !deTracker && <Aviso tono="aviso" className="mb-6">Esa postulación no tiene una oferta guardada para comparar.</Aviso>}
      </div>

      {docs && (
        <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
          <div>
            <div role="tablist" aria-label="Documento" className="no-imprimir mb-4 flex gap-1">
              {vistas.map((v) => (
                <button
                  key={v}
                  role="tab"
                  type="button"
                  aria-selected={vista === v}
                  onClick={() => setVista(v)}
                  className={cx("rounded-lg px-3 py-1.5 text-sm", vista === v ? "bg-texto text-fondo" : "text-tenue hover:text-texto")}
                >
                  {NOMBRE_VISTA[v]}
                </button>
              ))}
            </div>

            {vista === "cv" ? (
              <HojaCv cv={docs.cv} idioma={docs.idioma} />
            ) : vista === "propuesta" ? (
              <label className="block text-sm">
                <span className="mb-1 flex justify-between text-xs text-tenue">
                  <span>Edítala si quieres y pégala en la plataforma.</span>
                  <span className={cx(textoPropuesta.length > MAX_PROPUESTA && "text-aviso")}>
                    {textoPropuesta.length} / {MAX_PROPUESTA}
                  </span>
                </span>
                <textarea aria-label="Propuesta" className="campo h-80 resize-y leading-relaxed" value={textoPropuesta} onChange={(e) => setPropuesta(e.target.value)} />
              </label>
            ) : (
              <>
                <label className="no-imprimir mb-3 block text-sm">
                  <span className="mb-1 block text-xs text-tenue">Puedes editarla antes de copiarla o descargarla.</span>
                  <textarea aria-label="Carta de presentación" className="campo h-72 resize-y leading-relaxed" value={textoCarta} onChange={(e) => setCarta(e.target.value)} />
                </label>
                <article className="hoja hidden whitespace-pre-wrap print:block" aria-hidden="true">{textoCarta}</article>
              </>
            )}
          </div>

          <aside className="no-imprimir space-y-4">
            <Tarjeta titulo="Listo para enviar">
              {vista === "propuesta" ? (
                <div className="flex flex-col gap-2">
                  <Boton onClick={() => void copiar(textoPropuesta, "propuesta")}>Copiar propuesta</Boton>
                  {copiado === "propuesta" && <p className="text-xs text-ok" role="status">Propuesta copiada.</p>}
                  <p className="text-xs text-tenue">
                    En {docs.idioma === "es" ? "español" : "inglés"}, como el proyecto. Sin tu correo ni teléfono: las plataformas prohíben compartirlos antes del contrato y pueden
                    suspender tu cuenta.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {vista === "cv" && (
                    <>
                      <Boton onClick={() => void guardarWord()} disabled={docx?.estado === "guardando"}>
                        {docx?.estado === "guardando" ? "Guardando…" : "Guardar CV en Word (.docx)"}
                      </Boton>
                      {docx?.estado === "listo" && (
                        <p className="text-xs text-ok" role="status">
                          {docx.r.enCarpetaDelDia ? (
                            <>
                              Sube este: <span className="break-all font-medium">{docx.r.ruta ?? "Descargas, carpeta del día"}</span>
                              {docx.r.borrados > 0 && ` · Borré ${docx.r.borrados} CV de días anteriores.`}
                            </>
                          ) : (
                            "Quedó en tu carpeta Descargas. Con la extensión 1.0.3 se guarda en su carpeta del día (CV<mes>-<día>) y se limpian los viejos."
                          )}
                        </p>
                      )}
                      {docx?.estado === "error" && <p className="text-xs text-riesgo" role="alert">{docx.error}</p>}
                    </>
                  )}
                  <Boton variante={vista === "cv" ? "secundario" : undefined} onClick={() => window.print()}>Descargar {vista === "cv" ? "CV" : "carta"} en PDF</Boton>
                  <Boton variante="secundario" onClick={() => void copiar(vista === "cv" ? cvATexto(docs.cv, docs.idioma) : textoCarta, vista)}>
                    Copiar {vista === "cv" ? "CV" : "carta"} como texto
                  </Boton>
                  {copiado && copiado !== "propuesta" && <p className="text-xs text-ok" role="status">{copiado === "cv" ? "CV copiado." : "Carta copiada."}</p>}
                  <p className="text-xs text-tenue">En la ventana de impresión elige «Guardar como PDF». Documento en {docs.idioma === "es" ? "español" : "inglés"}, como la vacante.</p>
                </div>
              )}
            </Tarjeta>
            <Tarjeta titulo="Para esta vacante">
              {docs.enfasis.length > 0 && (
                <>
                  <p className="mb-1 text-xs text-tenue">Pusimos al frente</p>
                  <div className="mb-3 flex flex-wrap gap-1">{docs.enfasis.slice(0, 10).map((e) => <Insignia key={e} tono="ok">{e}</Insignia>)}</div>
                </>
              )}
              {docs.brechas.length > 0 && (
                <>
                  <p className="mb-1 text-xs text-tenue">Lo piden y no está en tu CV</p>
                  <div className="mb-2 flex flex-wrap gap-1">{docs.brechas.map((e) => <Insignia key={e} tono="aviso">{e}</Insignia>)}</div>
                  <p className="text-xs text-tenue">No lo agregamos por ti. Si de verdad lo tienes, súmalo en tu perfil con un logro concreto.</p>
                </>
              )}
              {docs.transferibles.length > 0 && (
                <p className="mt-3 text-xs text-tenue">
                  Transferible: {docs.transferibles.map((t) => `${t.tienes} → ${t.pide}`).join(", ")}
                </p>
              )}
            </Tarjeta>
          </aside>
        </div>
      )}
    </main>
  );
}
