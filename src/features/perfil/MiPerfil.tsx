"use client";

import { useState, type ReactNode } from "react";
import { respuestasConElCv } from "@/core/perfil/delCv";
import type { PerfilJson } from "@/core/perfil/estructurado";
import { cvActivo, editarEstructurado, estructuradoDe, guardarRespuestas, releerEstructurado } from "@/core/perfil/perfil";
import {
  DISPONIBILIDADES,
  ETIQUETAS,
  MODALIDADES,
  MONEDAS,
  NIVELES_INGLES,
  PERIODOS,
  TEXTO_PREGUNTA,
  pendientes,
  type Disponibilidad,
  type Moneda,
  type NivelIngles,
  type Periodo,
  type Respuestas,
} from "@/core/perfil/respuestas";
import { useDatosApp } from "@/storage/hooks";
import { useGuardarConAviso } from "@/ui/guardar";
import { Aviso, Boton, Encabezado, EnlaceBoton, Insignia, Tarjeta, Vacio } from "@/ui/ui";
import EditorPerfil from "./EditorPerfil";

const PAISES: [string, string][] = [
  ["MX", "México"], ["US", "Estados Unidos"], ["CA", "Canadá"], ["CO", "Colombia"], ["AR", "Argentina"], ["CL", "Chile"],
  ["PE", "Perú"], ["EC", "Ecuador"], ["UY", "Uruguay"], ["CR", "Costa Rica"], ["GT", "Guatemala"], ["PA", "Panamá"],
  ["DO", "Rep. Dominicana"], ["BR", "Brasil"], ["ES", "España"],
];

function Faltantes({ perfil }: { perfil: PerfilJson }) {
  const faltan = [
    !perfil.basics.name && "nombre",
    !perfil.basics.email && "correo",
    !perfil.basics.phone && "teléfono",
    !perfil.work.length && "experiencia",
    !perfil.education.length && "educación",
  ].filter(Boolean) as string[];
  if (!faltan.length) return <Aviso tono="ok" className="mb-5">Leímos tus datos principales. Revisa que todo esté bien.</Aviso>;
  return (
    <Aviso tono="aviso" className="mb-5" titulo="No encontramos todo en tu CV">
      Completa aquí: {faltan.join(", ")}. Lo usaremos para llenar formularios por ti.
    </Aviso>
  );
}

function SiNo({ nombre, valor, onCambio }: { nombre: string; valor: boolean | undefined; onCambio: (v: boolean) => void }) {
  return (
    <div className="flex gap-4 text-sm" role="radiogroup" aria-label={nombre}>
      {[true, false].map((op) => (
        <label key={String(op)} className="flex items-center gap-1.5">
          <input type="radio" name={nombre} checked={valor === op} onChange={() => onCambio(op)} />
          {op ? "Sí" : "No"}
        </label>
      ))}
    </div>
  );
}

function Pregunta({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="border-t border-linea pt-4">
      <p className="mb-2 text-sm font-medium">{titulo}</p>
      {children}
    </div>
  );
}

function FormRespuestas({ inicial, cv, onGuardar }: { inicial: Respuestas; cv: PerfilJson | undefined; onGuardar: (r: Respuestas) => Promise<void> }) {
  const [r, setR] = useState<Respuestas>(inicial);
  const [guardando, setGuardando] = useState(false);
  // Lo que tu CV ya contesta (años, inglés) cuenta como listo; si lo escribes aquí, manda lo tuyo.
  const conCv = respuestasConElCv(r, cv, new Date());
  const faltan = pendientes(conCv);
  const total = Object.keys(TEXTO_PREGUNTA).length;
  const cambiar = (c: Partial<Respuestas>) => setR({ ...r, ...c });
  const salario = r.salario ?? { monto: 0, moneda: "MXN" as Moneda, periodo: "mes" as Periodo };

  return (
    <div className="space-y-4">
      <p className="text-sm text-tenue">
        {faltan.length ? `${total - faltan.length} de ${total} listas. ` : "Todo listo. "}
        Se contestan una vez y las usamos en cada formulario; puedes cambiarlas cuando quieras.
      </p>

      <Pregunta titulo={TEXTO_PREGUNTA.salario}>
        <div className="grid gap-2 sm:grid-cols-[1fr_7rem_8rem]">
          <input
            className="campo"
            type="number"
            min={0}
            inputMode="numeric"
            aria-label="Monto de la pretensión salarial"
            value={r.salario?.monto ?? ""}
            onChange={(e) => {
              const monto = Number(e.target.value);
              cambiar({ salario: monto > 0 ? { ...salario, monto } : undefined });
            }}
          />
          <select className="campo" aria-label="Moneda" value={salario.moneda} onChange={(e) => cambiar({ salario: { ...salario, moneda: e.target.value as Moneda } })}>
            {MONEDAS.map((m) => <option key={m}>{m}</option>)}
          </select>
          <select className="campo" aria-label="Periodo" value={salario.periodo} onChange={(e) => cambiar({ salario: { ...salario, periodo: e.target.value as Periodo } })}>
            {PERIODOS.map((p) => <option key={p} value={p}>{ETIQUETAS.periodo[p]}</option>)}
          </select>
        </div>
      </Pregunta>

      <Pregunta titulo={TEXTO_PREGUNTA.disponibilidad}>
        <div className="grid gap-2 sm:grid-cols-2">
          <select className="campo" aria-label="Disponibilidad" value={r.disponibilidad ?? ""} onChange={(e) => cambiar({ disponibilidad: (e.target.value || undefined) as Disponibilidad | undefined })}>
            <option value="">Elige…</option>
            {DISPONIBILIDADES.map((d) => <option key={d} value={d}>{ETIQUETAS.disponibilidad[d]}</option>)}
          </select>
          {r.disponibilidad === "fecha" && <input className="campo" type="date" aria-label="Fecha de inicio" value={r.fechaInicio ?? ""} onChange={(e) => cambiar({ fechaInicio: e.target.value || undefined })} />}
        </div>
      </Pregunta>

      <Pregunta titulo={TEXTO_PREGUNTA.modalidades}>
        <div className="flex flex-wrap gap-4 text-sm">
          {MODALIDADES.map((m) => (
            <label key={m} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={r.modalidades.includes(m)}
                onChange={(e) => cambiar({ modalidades: e.target.checked ? [...r.modalidades, m] : r.modalidades.filter((x) => x !== m) })}
              />
              {ETIQUETAS.modalidad[m]}
            </label>
          ))}
        </div>
        <div className="mt-3">
          <p className="mb-1 text-xs text-tenue">¿Te mudarías por un empleo?</p>
          <SiNo nombre="Reubicación" valor={r.reubicacion} onCambio={(reubicacion) => cambiar({ reubicacion })} />
        </div>
      </Pregunta>

      <Pregunta titulo={TEXTO_PREGUNTA.paisesAutorizado}>
        <p className="mb-2 text-xs text-tenue">Donde puedes trabajar legalmente hoy, sin que te patrocinen una visa.</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
          {PAISES.map(([codigo, nombre]) => (
            <label key={codigo} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={r.paisesAutorizado.includes(codigo)}
                onChange={(e) => cambiar({ paisesAutorizado: e.target.checked ? [...r.paisesAutorizado, codigo] : r.paisesAutorizado.filter((x) => x !== codigo) })}
              />
              {nombre}
            </label>
          ))}
        </div>
      </Pregunta>

      <Pregunta titulo="¿Necesitarías patrocinio de visa para trabajar en otro país?">
        <SiNo nombre="Patrocinio de visa" valor={r.requierePatrocinio} onCambio={(requierePatrocinio) => cambiar({ requierePatrocinio })} />
      </Pregunta>

      <Pregunta titulo={TEXTO_PREGUNTA.aniosExperiencia}>
        <input
          className="campo max-w-40"
          type="number"
          min={0}
          max={60}
          step={0.5}
          aria-label="Años de experiencia"
          value={r.aniosExperiencia ?? ""}
          placeholder={conCv.aniosExperiencia !== undefined ? String(conCv.aniosExperiencia) : undefined}
          onChange={(e) => cambiar({ aniosExperiencia: e.target.value === "" ? undefined : Number(e.target.value) })}
        />
        {r.aniosExperiencia === undefined && conCv.aniosExperiencia !== undefined && (
          <p className="mt-1 text-xs text-tenue">Según tu CV: {conCv.aniosExperiencia}. Si no lo cambias, usamos ese.</p>
        )}
      </Pregunta>

      <Pregunta titulo={TEXTO_PREGUNTA.nivelIngles}>
        <select className="campo max-w-60" aria-label="Nivel de inglés" value={r.nivelIngles ?? ""} onChange={(e) => cambiar({ nivelIngles: (e.target.value || undefined) as NivelIngles | undefined })}>
          <option value="">{!r.nivelIngles && conCv.nivelIngles ? `Según tu CV: ${ETIQUETAS.ingles[conCv.nivelIngles]}` : "Elige…"}</option>
          {NIVELES_INGLES.map((n) => <option key={n} value={n}>{ETIQUETAS.ingles[n]}</option>)}
        </select>
      </Pregunta>

      <details className="border-t border-linea pt-4">
        <summary className="cursor-pointer text-sm text-cian">Encuesta voluntaria de diversidad (formularios de EE. UU.)</summary>
        <p className="mt-2 text-xs text-tenue">Es opcional y no afecta tu postulación. Por defecto respondemos «Prefiero no decir».</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {(
            [
              ["genero", "Género"],
              ["etnia", "Origen étnico"],
              ["discapacidad", "Discapacidad"],
              ["veterano", "Veterano de EE. UU."],
            ] as const
          ).map(([k, etiqueta]) => (
            <label key={k} className="block text-sm">
              <span className="mb-1 block text-xs text-tenue">{etiqueta}</span>
              <input className="campo" value={r.diversidad[k]} onChange={(e) => cambiar({ diversidad: { ...r.diversidad, [k]: e.target.value } })} />
            </label>
          ))}
        </div>
      </details>

      <div className="border-t border-linea pt-4">
        <Boton
          disabled={guardando}
          onClick={() => {
            setGuardando(true);
            void onGuardar(r).finally(() => setGuardando(false));
          }}
        >
          {guardando ? "Guardando…" : "Guardar respuestas"}
        </Boton>
      </div>
    </div>
  );
}

export default function MiPerfil() {
  const { perfil, guardarEstado, cargando } = useDatosApp();
  const { msg, guardar } = useGuardarConAviso();
  const activo = cvActivo(perfil);
  const cv = activo ? estructuradoDe(activo) : undefined;
  const faltanRespuestas = pendientes(respuestasConElCv(perfil.respuestas, cv, new Date())).length;

  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <Encabezado
        titulo="Mi perfil"
        descripcion="Lo que entendimos de tu CV y las respuestas que casi todos los formularios piden. Con esto llenamos las postulaciones por ti; tú solo revisas y envías."
        acciones={faltanRespuestas ? <Insignia tono="aviso">{`${faltanRespuestas} respuestas pendientes`}</Insignia> : <Insignia tono="ok">Respuestas listas</Insignia>}
      />

      {msg && <Aviso tono={msg.tono} className="mb-6">{msg.texto}</Aviso>}

      <div className="space-y-6">
        {activo ? (
          <Tarjeta titulo={`Tu perfil (de «${activo.nombre}»)`}>
            <Faltantes perfil={estructuradoDe(activo)} />
            <EditorPerfil
              key={`${activo.id}-${activo.actualizadoEn}`}
              perfil={estructuradoDe(activo)}
              editado={activo.estructuradoEditado === true}
              onGuardar={(p) => guardar(() => guardarEstado({ perfil: editarEstructurado(perfil, activo.id, p, new Date()) }), "Perfil guardado.")}
              onReleer={() => guardar(() => guardarEstado({ perfil: releerEstructurado(perfil, activo.id, new Date()) }), "Volvimos a leer tu perfil desde el CV.")}
            />
          </Tarjeta>
        ) : (
          !cargando && (
            <Vacio titulo="Primero sube tu CV" accion={<EnlaceBoton href="/cv">Subir mi CV</EnlaceBoton>}>
              Lo leemos y armamos tu perfil automáticamente; aquí solo lo revisas.
            </Vacio>
          )
        )}

        <Tarjeta titulo="Respuestas para formularios">
          <FormRespuestas
            key={cargando ? "cargando" : "listo"}
            inicial={perfil.respuestas}
            cv={cv}
            onGuardar={(r) => guardar(() => guardarEstado({ perfil: guardarRespuestas(perfil, r) }), "Respuestas guardadas.")}
          />
        </Tarjeta>
      </div>
    </main>
  );
}
