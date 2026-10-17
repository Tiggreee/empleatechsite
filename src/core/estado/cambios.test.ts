import { describe, expect, it } from "vitest";
import { agregarCv, eliminarCv, guardarRespuestas, PERFIL_VACIO } from "../perfil/perfil";
import { sanitizarRespuestas } from "../perfil/respuestas";
import { cambiarEstado, crear, eliminar } from "../seguimiento/seguimiento";
import { cambiosEntre, hayCambios, sanitizarCambios, type EstadoApp } from "./cambios";

const AHORA = new Date("2026-10-17T12:00:00Z");
const CV = "Desarrollador backend con Java, Spring Boot y Kafka. Diez años liderando equipos.";

const perfil = agregarCv(PERFIL_VACIO, { nombre: "Mi CV", texto: CV }, AHORA, "cv-1");
const conDos = crear(crear([], { empresa: "Acme", puesto: "Backend" }, AHORA, "p-1"), { empresa: "Globex", puesto: "Fullstack" }, AHORA, "p-2");
const base: EstadoApp = { perfil, postulaciones: conDos };

describe("solo viaja lo que cambió", () => {
  it("sin cambios no hay nada que escribir", () => {
    expect(hayCambios(cambiosEntre(base, base))).toBe(false);
  });

  it("una pestaña con datos viejos solo manda su propio cambio, sin tocar lo que registró la extensión", () => {
    // Esta pestaña cargó p-1 y p-2; mientras tanto la extensión guardó p-3 en el servidor. Aquí solo cambias p-2.
    const siguiente = { ...base, postulaciones: cambiarEstado(base.postulaciones, "p-2", "rechazada", AHORA) };
    const c = cambiosEntre(base, siguiente);
    expect(c.postulaciones?.guardar.map((p) => p.id)).toEqual(["p-2"]);
    expect(c.postulaciones?.borrar).toEqual([]);
    expect(c.cvs).toBeUndefined();
    expect(c.respuestas).toBeUndefined();
  });

  it("borrar solo quita lo que tú quitaste", () => {
    const c = cambiosEntre(base, { ...base, postulaciones: eliminar(base.postulaciones, "p-1") });
    expect(c.postulaciones).toEqual({ guardar: [], borrar: ["p-1"] });
  });

  it("CVs, CV activo y respuestas se detectan por separado", () => {
    const otro = agregarCv(perfil, { nombre: "CV inglés", texto: `${CV} Bilingual.` }, AHORA, "cv-2");
    expect(cambiosEntre(base, { ...base, perfil: otro }).cvs?.guardar.map((c) => c.id)).toEqual(["cv-2"]);
    expect(cambiosEntre({ ...base, perfil: otro }, { ...base, perfil: eliminarCv(otro, "cv-2") }).cvs?.borrar).toEqual(["cv-2"]);
    const r = cambiosEntre(base, { ...base, perfil: guardarRespuestas(perfil, sanitizarRespuestas({ aniosExperiencia: 14 })) });
    expect(r.respuestas?.aniosExperiencia).toBe(14);
    expect(r.cvs).toBeUndefined();
  });
});

describe("cambios que llegan del navegador", () => {
  it("se validan pieza por pieza y lo inválido se descarta", () => {
    const c = sanitizarCambios({
      activoId: "cv-1",
      postulaciones: { guardar: [conDos.find((p) => p.id === "p-1"), { id: "", empresa: "x" }, "basura"], borrar: ["p-9", 42, "x".repeat(81), "p-9"] },
      cvs: { guardar: [{ id: "cv-3", nombre: "corto", texto: "muy corto" }] },
      extra: "ignorado",
    });
    expect(c.activoId).toBe("cv-1");
    expect(c.postulaciones?.guardar.map((p) => p.id)).toEqual(["p-1"]);
    expect(c.postulaciones?.borrar).toEqual(["p-9"]);
    expect(c.cvs?.guardar).toEqual([]);
    expect(sanitizarCambios("nada")).toEqual({});
  });
});
