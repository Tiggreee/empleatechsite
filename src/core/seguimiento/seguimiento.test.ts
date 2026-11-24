import { describe, expect, it } from "vitest";
import {
  SELLO_ITEMS,
  cambiarEstado,
  crear,
  estadisticas,
  exportarCSV,
  exportarJSON,
  fusionar,
  importarJSON,
  marcarPostulada,
  programarSeguimiento,
  sanitizar,
  siguienteAccion,
  urlSegura,
  type Postulacion,
} from "./seguimiento";

const T0 = new Date("2026-09-01T10:00:00Z");
const dias = (n: number) => new Date(T0.getTime() + n * 86_400_000);
const base = (): Postulacion[] => crear([], { empresa: "Acme", puesto: "Dev", url: "https://acme.test/job", score: 72 }, T0, "a1");
const conSello = (l: Postulacion[]) => marcarPostulada(l, "a1", [...SELLO_ITEMS], T0);

describe("Sello Humano", () => {
  it("no permite postular sin confirmar los 4 puntos", () => {
    expect(() => marcarPostulada(base(), "a1", [SELLO_ITEMS[0]], T0)).toThrow(/Sello Humano/);
  });

  it("registra el sello y el historial al postular", () => {
    const [p] = conSello(base());
    expect(p.estado).toBe("postulada");
    expect(p.sello?.items).toHaveLength(SELLO_ITEMS.length);
    expect(p.historial.map((h) => h.estado)).toEqual(["guardada", "postulada"]);
  });

  it("no se puede saltar el sello con cambiarEstado", () => {
    expect(() => cambiarEstado(base(), "a1", "postulada", T0)).toThrow();
    expect(() => cambiarEstado(base(), "a1", "entrevista", T0)).toThrow(/Sello Humano/);
  });
});

describe("crear / validación", () => {
  it("exige empresa y puesto y recorta longitudes", () => {
    expect(() => crear([], { empresa: " ", puesto: "x" }, T0, "z")).toThrow();
    const [p] = crear([], { empresa: "E".repeat(500), puesto: "P" }, T0, "z");
    expect(p.empresa).toHaveLength(200);
  });

  it("descarta URLs no http(s) (javascript:, data:)", () => {
    expect(urlSegura("javascript:alert(1)")).toBeUndefined();
    expect(urlSegura("data:text/html,x")).toBeUndefined();
    expect(urlSegura("https://ok.test/x")).toBe("https://ok.test/x");
    expect(urlSegura("no es url")).toBeUndefined();
  });

  it("ignora scores fuera de rango", () => {
    const [p] = crear([], { empresa: "A", puesto: "B", score: 250 }, T0, "z");
    expect(p.score).toBeUndefined();
  });
});

describe("siguienteAccion", () => {
  it("guardada con afinidad baja advierte", () => {
    const [p] = crear([], { empresa: "A", puesto: "B", score: 20 }, T0, "z");
    expect(siguienteAccion(p, T0).tono).toBe("atencion");
  });

  it("postulada: espera, luego seguimiento a los 7 días, cierre a los 21", () => {
    const [p] = conSello(base());
    expect(siguienteAccion(p, dias(2))).toMatchObject({ tono: "ok", texto: expect.stringContaining("5 días") });
    expect(siguienteAccion(p, dias(7))).toMatchObject({ tono: "urgente" });
    expect(siguienteAccion(p, dias(21)).texto).toMatch(/ciérrala/);
  });

  it("un reloj atrasado no produce días negativos (7 días exactos tras postular)", () => {
    const [p] = conSello(base());
    expect(siguienteAccion(p, new Date(T0.getTime() - 60_000)).texto).toMatch(/en 7 días/);
  });

  it("seguimiento programado vencido es urgente; futuro es ok", () => {
    let l = conSello(base());
    l = programarSeguimiento(l, "a1", "2026-09-05T00:00:00Z", T0);
    expect(siguienteAccion(l[0], dias(3)).tono).toBe("ok");
    expect(siguienteAccion(l[0], dias(5))).toMatchObject({ tono: "urgente", texto: expect.stringContaining("vencido") });
  });

  it("fecha inválida de seguimiento lanza error", () => {
    expect(() => programarSeguimiento(base(), "a1", "mañana-ish", T0)).toThrow();
  });
});

describe("estadisticas", () => {
  it("calcula tasas, tiempo de respuesta y pendientes", () => {
    let l = crear([], { empresa: "A", puesto: "1", score: 80 }, T0, "a1");
    l = crear(l, { empresa: "B", puesto: "2", score: 60 }, T0, "b2");
    l = crear(l, { empresa: "C", puesto: "3" }, T0, "c3");
    l = marcarPostulada(l, "a1", [...SELLO_ITEMS], T0);
    l = marcarPostulada(l, "b2", [...SELLO_ITEMS], T0);
    l = cambiarEstado(l, "a1", "entrevista", dias(4));
    l = cambiarEstado(l, "a1", "oferta", dias(10));
    const e = estadisticas(l, dias(9));
    expect(e).toMatchObject({ total: 3, postuladas: 2, tasaEntrevista: 0.5, tasaOferta: 0.5, diasPromedioRespuesta: 4, pendientesSeguimiento: 1, scorePromedio: 70 });
  });

  it("el embudo sale del historial: una entrevista que luego se cerró sigue contando", () => {
    let l = crear([], { empresa: "A", puesto: "1" }, T0, "a1");
    l = crear(l, { empresa: "B", puesto: "2" }, T0, "b2");
    l = crear(l, { empresa: "C", puesto: "3" }, T0, "c3");
    l = crear(l, { empresa: "D", puesto: "4" }, T0, "d4");
    for (const id of ["a1", "b2", "c3"]) l = marcarPostulada(l, id, [...SELLO_ITEMS], T0);
    l = cambiarEstado(l, "a1", "entrevista", dias(6));
    l = cambiarEstado(l, "a1", "rechazada", dias(12));
    l = cambiarEstado(l, "b2", "rechazada", dias(2));
    const e = estadisticas(l, dias(13));
    expect(e).toMatchObject({ postuladas: 3, entrevistas: 1, ofertas: 0, enEspera: 1, cerradasSinEntrevista: 1 });
    expect(e.porEstado.rechazada).toBe(2);
  });

  it("un cierre no cuenta como respuesta: puede ser silencio", () => {
    let l = crear([], { empresa: "A", puesto: "1" }, T0, "a1");
    l = marcarPostulada(l, "a1", [...SELLO_ITEMS], T0);
    l = cambiarEstado(l, "a1", "rechazada", dias(21));
    expect(estadisticas(l, dias(22)).diasPromedioRespuesta).toBeNull();
  });

  it("lista vacía no divide entre cero", () => {
    expect(estadisticas([], T0)).toMatchObject({ total: 0, tasaEntrevista: null, diasPromedioRespuesta: null, scorePromedio: null });
  });
});

describe("import / export / sanitizar", () => {
  it("ida y vuelta conserva los datos", () => {
    const l = conSello(base());
    const { items, descartadas } = importarJSON(exportarJSON(l, T0));
    expect(descartadas).toBe(0);
    expect(items).toEqual(l);
  });

  it("descarta basura, duplicados y URLs peligrosas; no revienta", () => {
    const crudo = [
      { id: "x", empresa: "Ok", puesto: "P", url: "javascript:alert(1)", estado: "inventado" },
      { id: "x", empresa: "Dup", puesto: "P" },
      { id: "y" },
      null,
      42,
      { id: "z", empresa: "Z", puesto: "P", score: 999, creadaEn: "no-fecha" },
    ];
    const { items, descartadas } = sanitizar(crudo);
    expect(items.map((i) => i.id)).toEqual(["x", "z"]);
    expect(descartadas).toBe(4);
    expect(items[0].url).toBeUndefined();
    expect(items[0].estado).toBe("guardada");
    expect(items[1].score).toBeUndefined();
  });

  it("rechaza JSON inválido o sin lista", () => {
    expect(() => importarJSON("{no json")).toThrow(/JSON válido/);
    expect(() => importarJSON('{"a":1}')).toThrow(/lista/);
  });

  it("fusionar respeta la versión más reciente", () => {
    const viejo = base();
    const nuevo = cambiarEstado(conSello(viejo), "a1", "rechazada", dias(3));
    expect(fusionar(viejo, nuevo)[0].estado).toBe("rechazada");
    expect(fusionar(nuevo, viejo)[0].estado).toBe("rechazada");
  });

  it("CSV neutraliza inyección de fórmulas y escapa comillas", () => {
    const [p] = crear([], { empresa: '=HYPERLINK("http://x")', puesto: 'Dev "Sr"' }, T0, "q");
    const csv = exportarCSV([p]);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(csv).toContain('"Dev ""Sr"""');
  });
});
