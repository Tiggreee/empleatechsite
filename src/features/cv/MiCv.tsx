"use client";

import { useMemo, useState } from "react";
import { detectarHabilidades } from "@/core/analisis/analizador";
import {
  MAX_CARACTERES_CV,
  MAX_CVS,
  activarCv,
  actualizarCv,
  agregarCv,
  cvActivo,
  eliminarCv,
  type PerfilCv,
} from "@/core/perfil/perfil";
import { reanalizarTodas } from "@/core/seguimiento/seguimiento";
import { useDatosApp } from "@/storage/hooks";
import { useGuardarConAviso } from "@/ui/guardar";
import { Aviso, Boton, Encabezado, Insignia, Tarjeta, Vacio } from "@/ui/ui";
import SubirCv from "./SubirCv";

interface Borrador {
  id?: string;
  nombre: string;
  texto: string;
}

const CAT: Record<string, string> = {
  lenguaje: "Lenguajes",
  frontend: "Frontend",
  backend: "Backend",
  datos: "Datos",
  cloud: "Cloud",
  devops: "DevOps",
  ia: "IA",
  practica: "Prácticas",
  negocio: "Negocio",
  blanda: "Habilidades blandas",
  idioma: "Idiomas",
};

function Entendido({ texto }: { texto: string }) {
  const grupos = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const h of detectarHabilidades(texto)) m.set(h.cat, [...(m.get(h.cat) ?? []), h.label]);
    return [...m.entries()];
  }, [texto]);
  const total = grupos.reduce((a, [, l]) => a + l.length, 0);
  return (
    <div>
      <p className="mb-2 text-sm font-medium">Lo que entiende este CV ({total} habilidades)</p>
      {total < 3 && <Aviso tono="aviso" className="mb-3">Detectamos muy pocas habilidades. Si tu CV las menciona, revisa que el texto se extrajo bien.</Aviso>}
      <dl className="space-y-1.5 text-sm">
        {grupos.map(([cat, labels]) => (
          <div key={cat} className="flex flex-wrap gap-x-2 gap-y-1">
            <dt className="w-32 shrink-0 text-xs text-tenue">{CAT[cat] ?? cat}</dt>
            <dd className="flex flex-1 flex-wrap gap-1.5">{labels.map((l) => <Insignia key={l} tono="cian">{l}</Insignia>)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function MiCv() {
  const { perfil, postulaciones, guardarEstado } = useDatosApp();
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const { msg, guardar: guardarCambios } = useGuardarConAviso();
  const activo = cvActivo(perfil);
  const conOferta = postulaciones.filter((p) => p.oferta).length;

  async function guardarBorrador() {
    if (!borrador) return;
    await guardarCambios(async () => {
      const ahora = new Date();
      const nuevo = borrador.id
        ? actualizarCv(perfil, borrador.id, { nombre: borrador.nombre, texto: borrador.texto }, ahora)
        : agregarCv(perfil, { nombre: borrador.nombre, texto: borrador.texto }, ahora, crypto.randomUUID());
      await guardarEstado({ perfil: nuevo });
      setBorrador(null);
    }, "CV guardado.");
  }

  async function activar(cv: PerfilCv) {
    await guardarCambios(async () => {
      await guardarEstado({ perfil: activarCv(perfil, cv.id) });
    }, `«${cv.nombre}» es ahora tu CV activo.`);
  }

  async function reanalizar(cv: PerfilCv) {
    await guardarCambios(async () => {
      await guardarEstado({ postulaciones: reanalizarTodas(postulaciones, cv.texto, cv.id, new Date()) });
    }, `Reanalizadas ${conOferta} ofertas con «${cv.nombre}».`);
  }

  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <Encabezado
        titulo="Mi CV"
        descripcion={`Guarda hasta ${MAX_CVS} versiones de tu CV. Con un CV activo, analizar una oferta toma un paso.`}
        acciones={!borrador && perfil.cvs.length < MAX_CVS ? <Boton onClick={() => setBorrador({ nombre: "", texto: "" })}>Agregar CV</Boton> : undefined}
      />

      {msg && <Aviso tono={msg.tono} className="mb-6">{msg.texto}</Aviso>}

      {borrador && (
        <Tarjeta titulo={borrador.id ? "Editar CV" : "Nuevo CV"} className="mb-6">
          <div className="space-y-4">
            <SubirCv compacto onTexto={(texto, meta) => setBorrador((b) => (b ? { ...b, texto, nombre: b.nombre || meta.nombreArchivo.replace(/\.[^.]+$/, "") } : b))} />
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Nombre de esta versión</span>
              <input className="campo" value={borrador.nombre} maxLength={80} placeholder="Ej.: CV en español, CV backend…" onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Texto del CV <span className="font-normal text-tenue">({borrador.texto.length.toLocaleString("es-MX")} / {MAX_CARACTERES_CV.toLocaleString("es-MX")})</span></span>
              <textarea className="campo h-64 resize-y font-mono text-[13px] leading-relaxed" value={borrador.texto} onChange={(e) => setBorrador({ ...borrador, texto: e.target.value })} placeholder="El texto aparecerá aquí al subir un archivo; también puedes pegarlo o corregirlo." />
            </label>
            {borrador.texto.trim().length >= 30 && <Entendido texto={borrador.texto} />}
            <div className="flex gap-2">
              <Boton onClick={guardarBorrador} disabled={borrador.texto.trim().length < 30}>Guardar CV</Boton>
              <Boton variante="secundario" onClick={() => setBorrador(null)}>Cancelar</Boton>
            </div>
          </div>
        </Tarjeta>
      )}

      {perfil.cvs.length === 0 && !borrador && (
        <Vacio titulo="Aún no guardas ningún CV" accion={<Boton onClick={() => setBorrador({ nombre: "", texto: "" })}>Subir mi CV</Boton>}>
          Súbelo en PDF, DOCX, ODT o texto. Leemos tu perfil automáticamente y queda listo para analizar ofertas y llenar formularios.
        </Vacio>
      )}

      <ul className="space-y-4">
        {perfil.cvs.map((cv) => {
          const esActivo = cv.id === activo?.id;
          return (
            <li key={cv.id}>
              <Tarjeta titulo={cv.nombre} acciones={esActivo ? <Insignia tono="ok">Activo</Insignia> : undefined}>
                <p className="mb-4 text-xs text-tenue">
                  {cv.texto.length.toLocaleString("es-MX")} caracteres · actualizado {new Date(cv.actualizadoEn).toLocaleDateString("es-MX", { dateStyle: "medium" })}
                </p>
                <details className="mb-4">
                  <summary className="cursor-pointer text-sm text-cian">Ver lo que entiende</summary>
                  <div className="mt-3"><Entendido texto={cv.texto} /></div>
                </details>
                <div className="flex flex-wrap gap-2">
                  {!esActivo && <Boton pequeno onClick={() => void activar(cv)}>Usar como activo</Boton>}
                  <Boton pequeno variante="secundario" onClick={() => setBorrador({ id: cv.id, nombre: cv.nombre, texto: cv.texto })}>Editar</Boton>
                  {esActivo && conOferta > 0 && <Boton pequeno variante="secundario" onClick={() => void reanalizar(cv)}>Reanalizar mis {conOferta} ofertas</Boton>}
                  <Boton
                    pequeno
                    variante="peligro"
                    onClick={() => {
                      if (window.confirm(`¿Eliminar «${cv.nombre}»? Esta acción no se puede deshacer.`)) {
                        void guardarCambios(async () => {
                          await guardarEstado({ perfil: eliminarCv(perfil, cv.id) });
                        }, "CV eliminado.");
                      }
                    }}
                  >
                    Eliminar
                  </Boton>
                </div>
              </Tarjeta>
            </li>
          );
        })}
      </ul>
    </main>
  );
}

