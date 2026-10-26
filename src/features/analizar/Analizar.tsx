"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState, type ChangeEvent } from "react";
import { analizar } from "@/core/analisis/analizador";
import { CV_EJEMPLO, OFERTA_EJEMPLO } from "@/core/analisis/ejemplo";
import { resumir } from "@/core/analisis/resumen";
import { agregarCv, cvActivo } from "@/core/perfil/perfil";
import { detectarAlertas } from "@/core/radar/radar";
import { prioridadDeResumen } from "@/core/seguimiento/prioridad";
import { analizarOferta, crear } from "@/core/seguimiento/seguimiento";
import CamposOferta from "@/components/CamposOferta";
import SubirCv from "@/features/cv/SubirCv";
import { useDatosApp } from "@/storage/hooks";
import { Aviso, Boton, Encabezado, Tarjeta } from "@/ui/ui";
import ResultadoAnalisis from "./ResultadoAnalisis";

const MAX_ARCHIVO = 300_000;

export default function Analizar() {
  const { perfil, postulaciones, guardarEstado } = useDatosApp();
  const activo = cvActivo(perfil);
  const [cvElegido, setCvElegido] = useState<string | null>(null);
  const [cvManual, setCvManual] = useState("");
  const [usarOtro, setUsarOtro] = useState(false);
  const [oferta, setOferta] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [puesto, setPuesto] = useState("");
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState<{ tono: "ok" | "riesgo"; texto: string } | null>(null);

  const cvGuardado = perfil.cvs.find((c) => c.id === (cvElegido ?? activo?.id)) ?? activo;
  const modoGuardado = Boolean(cvGuardado) && !usarOtro;
  const cvTexto = modoGuardado ? (cvGuardado?.texto ?? "") : cvManual;

  const cvD = useDeferredValue(cvTexto);
  const ofertaD = useDeferredValue(oferta);
  const listo = cvD.trim() !== "" && ofertaD.trim() !== "";
  const analisis = useMemo(() => {
    if (!listo) return null;
    const ahora = new Date();
    const resultado = analizar(cvD, ofertaD, { ahora });
    const diagnostico = detectarAlertas(ofertaD, ahora);
    return { resultado, diagnostico, prioridad: prioridadDeResumen(resumir(resultado, diagnostico, ahora)) };
  }, [listo, cvD, ofertaD]);

  async function cargarOferta(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > MAX_ARCHIVO) return setMsg({ tono: "riesgo", texto: "Archivo demasiado grande (máx. 300 KB de texto)." });
    setOferta(await f.text());
    setMsg(null);
  }

  async function guardarCvManual() {
    try {
      const nuevo = agregarCv(perfil, { nombre: "Mi CV", texto: cvManual }, new Date(), crypto.randomUUID());
      await guardarEstado({ perfil: nuevo });
      setUsarOtro(false);
      setCvManual("");
      setMsg({ tono: "ok", texto: "CV guardado." });
    } catch (e) {
      setMsg({ tono: "riesgo", texto: e instanceof Error ? e.message : "No se pudo guardar el CV." });
    }
  }

  async function guardarOferta() {
    try {
      const ahora = new Date();
      let perfilActual = perfil;
      let cvId = modoGuardado ? cvGuardado?.id : undefined;

      if (!modoGuardado) {
        perfilActual = agregarCv(perfilActual, { nombre: `CV ${perfil.cvs.length + 1}`, texto: cvManual }, ahora, crypto.randomUUID());
        cvId = perfilActual.cvs.at(-1)?.id;
      }

      const snapshot = analizarOferta(cvTexto, oferta, cvId, ahora);
      const lista = crear(postulaciones, { empresa, puesto, url, oferta: snapshot }, ahora, crypto.randomUUID());
      await guardarEstado({ perfil: perfilActual, postulaciones: lista });
      setMsg({ tono: "ok", texto: modoGuardado ? "Guardada en tu tracker, con su análisis." : "Guardada en tu tracker y también conservamos el CV usado para poder reanalizarla." });
      setEmpresa("");
      setPuesto("");
      setUrl("");
      if (!modoGuardado) {
        setUsarOtro(false);
        setCvManual("");
      }
    } catch (e) {
      setMsg({ tono: "riesgo", texto: e instanceof Error ? e.message : "No se pudo guardar." });
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <Encabezado
        titulo="Analizar una oferta"
        descripcion="Pega la oferta y compárala con tu CV: afinidad explicada, brechas y señales de riesgo. Al guardarla, el resultado pasa a tus postulaciones."
        acciones={
          <>
            <Boton variante="secundario" onClick={() => { setCvManual(CV_EJEMPLO); setUsarOtro(true); setOferta(OFERTA_EJEMPLO); }}>Cargar ejemplo</Boton>
            <Boton variante="secundario" onClick={() => { setOferta(""); setCvManual(""); setMsg(null); }}>Limpiar</Boton>
          </>
        }
      />


      <div className="grid gap-5 md:grid-cols-2">
        <section aria-labelledby="cv-titulo">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 id="cv-titulo" className="text-sm font-medium">Tu CV</h2>
            {cvGuardado && (
              <button className="text-xs text-cian underline underline-offset-4" onClick={() => setUsarOtro(!usarOtro)}>
                {usarOtro ? "Usar mi CV guardado" : "Usar otro texto"}
              </button>
            )}
          </div>

          {modoGuardado && cvGuardado ? (
            <div className="vidrio p-4 text-sm">
              {perfil.cvs.length > 1 ? (
                <label className="block">
                  <span className="mb-1 block text-xs text-tenue">Versión a usar</span>
                  <select className="campo" value={cvGuardado.id} onChange={(e) => setCvElegido(e.target.value)}>
                    {perfil.cvs.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.id === activo?.id ? " (activo)" : ""}</option>)}
                  </select>
                </label>
              ) : (
                <p className="font-medium">{cvGuardado.nombre}</p>
              )}
              <p className="mt-2 text-xs text-tenue">{cvGuardado.texto.length.toLocaleString("es-MX")} caracteres guardados. <Link href="/cv" className="text-cian underline underline-offset-4">Editar</Link></p>
            </div>
          ) : (
            <div className="space-y-3">
              <SubirCv compacto onTexto={(t) => setCvManual(t)} />
              <textarea aria-label="Texto de tu CV" className="campo h-56 resize-y font-mono text-[13px] leading-relaxed" value={cvManual} onChange={(e) => setCvManual(e.target.value)} placeholder="…o pega aquí el texto de tu CV." />
              {cvManual.trim().length >= 30 && (
                <Boton variante="secundario" pequeno onClick={guardarCvManual}>Guardar este CV</Boton>
              )}
            </div>
          )}
        </section>

        <section aria-labelledby="oferta-titulo">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 id="oferta-titulo" className="text-sm font-medium">Oferta de empleo</h2>
            <label className="cursor-pointer text-xs text-cian underline underline-offset-4">
              Cargar .txt / .md
              <input type="file" accept=".txt,.md,text/plain,text/markdown" className="sr-only" onChange={cargarOferta} />
            </label>
          </div>
          <textarea aria-label="Texto de la oferta" className="campo h-72 resize-y font-mono text-[13px] leading-relaxed" value={oferta} onChange={(e) => setOferta(e.target.value)} placeholder="Pega aquí el texto completo de la oferta…" />
        </section>
      </div>

      {msg && !analisis && <Aviso tono={msg.tono} className="mt-5">{msg.texto}</Aviso>}

      {analisis && (
        <div className="mt-10 space-y-8">
          <ResultadoAnalisis {...analisis} />

          <Tarjeta titulo="Guardar en mis postulaciones">
            <div className="grid gap-3 sm:grid-cols-3">
              <CamposOferta empresa={empresa} puesto={puesto} url={url} onEmpresa={setEmpresa} onPuesto={setPuesto} onUrl={setUrl} />
            </div>
            <p className="mt-2 text-xs text-tenue">Queda en tus postulaciones con este análisis, lista para darle seguimiento.</p>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <Boton onClick={guardarOferta} disabled={!empresa.trim() || !puesto.trim()}>Guardar con su análisis</Boton>
              {msg && <p role="status" className={`text-sm ${msg.tono === "ok" ? "text-ok" : "text-riesgo"}`}>{msg.texto}</p>}
              {msg?.tono === "ok" && <Link href="/postulaciones" className="text-sm text-cian underline underline-offset-4">Ir a postulaciones</Link>}
            </div>
          </Tarjeta>
        </div>
      )}
    </main>
  );
}

