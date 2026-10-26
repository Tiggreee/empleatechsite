import { describe, expect, it } from "vitest";
import { RESPUESTAS_VACIAS, sanitizarRespuestas } from "../perfil/respuestas";
import { buscarVacantes, coincidePalabras, deduplicar, huellaPuntaje, ordenar, palabrasDeLaBusqueda, pasaFiltros, puntuar, terminosDelCv } from "./busqueda";
import { INFO_FUENTES, type Consulta, type ContextoFuente, type FuenteVacantes } from "./fuentes";
import { paisesDeTexto } from "./paises";
import { atsDeUrl, claveDuplicado, completarVacante, crearVacante, htmlATexto, modalidadDeTexto, salarioDeTexto, type Vacante } from "./vacante";

const AHORA = new Date("2026-09-28T12:00:00Z");

function v(parcial: Partial<Vacante> & { idExterno?: string } = {}): Vacante {
  const r = crearVacante(parcial.fuente ?? "remotive", {
    idExterno: parcial.idExterno ?? "1",
    titulo: parcial.titulo ?? "Backend Developer",
    empresa: parcial.empresa ?? "Acme",
    url: parcial.url ?? "https://ejemplo.com/vacante/1",
    urlPostular: parcial.urlPostular,
    modalidad: parcial.modalidad,
    paises: parcial.paises,
    descripcion: parcial.descripcion ?? "Buscamos backend con Node.js, PostgreSQL y Docker.",
    publicadaEn: parcial.publicadaEn,
    salario: parcial.salario,
    etiquetas: parcial.etiquetas,
    ats: parcial.ats,
  });
  if (!r) throw new Error("vacante inválida en la prueba");
  return r;
}

describe("normalización de vacantes", () => {
  it("HTML → texto con viñetas, entidades y HTML escapado", () => {
    expect(htmlATexto("<p>Hola&nbsp;<b>mundo</b></p><ul><li>Node.js</li><li>SQL &amp; Docker</li></ul>")).toBe("Hola mundo\n\n- Node.js\n- SQL & Docker");
    expect(htmlATexto("&lt;p&gt;Escapado &amp;amp; bien&lt;/p&gt;")).toBe("Escapado & bien");
    expect(htmlATexto("<script>alert(1)</script><p>ok</p>")).toBe("ok");
    // Quitar «<b>» de una sola pasada armaría un «<script>» nuevo; se quitan etiquetas hasta que no quede ninguna.
    expect(htmlATexto("<<b>script>hola<</b>/script>")).toBe("hola");
    expect(htmlATexto("<scr<script>x</script>ipt>alert(1)</script><p>ok</p>")).toBe("ok");
  });

  it("salarios en texto libre", () => {
    expect(salarioDeTexto("$90k - $105k")).toEqual({ min: 90000, max: 105000, moneda: "USD", periodo: "año" });
    expect(salarioDeTexto("€110K – €185K")).toEqual({ min: 110000, max: 185000, moneda: "EUR", periodo: "año" });
    expect(salarioDeTexto("$90 - $150 /hour")).toEqual({ min: 90, max: 150, moneda: "USD", periodo: "hora" });
    expect(salarioDeTexto("MXN 45,000 mensuales")).toEqual({ min: 45000, max: 45000, moneda: "MXN", periodo: "mes" });
    expect(salarioDeTexto("competitivo")).toBeUndefined();
  });

  it("modalidad y ATS", () => {
    expect(modalidadDeTexto("Remote, Bangalore")).toBe("remoto");
    expect(modalidadDeTexto("Híbrido CDMX")).toBe("hibrido");
    expect(modalidadDeTexto("On-site in Berlin")).toBe("presencial");
    expect(atsDeUrl("https://job-boards.greenhouse.io/gitlab/jobs/1")).toBe("greenhouse");
    expect(atsDeUrl("https://acme.wd5.myworkdayjobs.com/x")).toBe("workday");
    expect(atsDeUrl("https://remotive.com/x")).toBeUndefined();
  });

  it("crearVacante rechaza datos incompletos o URLs peligrosas", () => {
    expect(crearVacante("remotive", { idExterno: "1", titulo: "", empresa: "A", url: "https://a.com", descripcion: "" })).toBeUndefined();
    expect(crearVacante("remotive", { idExterno: "1", titulo: "T", empresa: "A", url: "javascript:alert(1)", descripcion: "" })).toBeUndefined();
    const ok = v({ urlPostular: "https://jobs.lever.co/acme/1/apply" });
    expect(ok.id).toBe("remotive:1");
    expect(ok.ats).toBe("lever");
  });

  it("la misma vacante en dos plataformas tiene la misma clave", () => {
    expect(claveDuplicado({ empresa: "Acme, Inc.", titulo: "Backend Developer" })).toBe(claveDuplicado({ empresa: "ACME", titulo: "Backend  developer" }));
  });
});

describe("países", () => {
  it("regiones, nombres en español/inglés y mundial", () => {
    expect(paisesDeTexto("LATAM").paises).toContain("MX");
    expect(paisesDeTexto("Mexico, Colombia").paises).toEqual(["CO", "MX"]);
    expect(paisesDeTexto("Estados Unidos").paises).toEqual(["US"]);
    expect(paisesDeTexto("USA only").paises).toEqual(["US"]);
    expect(paisesDeTexto("Worldwide")).toEqual({ paises: [], mundial: true });
    expect(paisesDeTexto("Remote - European Union").paises).toContain("ES");
  });

  it("ciudades sin país cuentan solo si el lugar no es remoto", () => {
    expect(paisesDeTexto("Seattle, San Francisco, New York").paises).toEqual(["US"]);
    expect(paisesDeTexto("NYC-Privy").paises).toEqual(["US"]);
    expect(paisesDeTexto("Dublin").paises).toEqual(["IE"]);
    expect(paisesDeTexto("Berlin").paises).toEqual(["DE"]);
    expect(paisesDeTexto("Guadalajara o Monterrey").paises).toEqual(["MX"]);
    expect(paisesDeTexto("Remote (Berlin HQ)").paises).toEqual([]);
    expect(paisesDeTexto("Remote, United States").paises).toEqual(["US"]);
  });
});

describe("filtros y duplicados", () => {
  it("palabras completas en título o etiquetas", () => {
    const x = v({ titulo: "Senior Node.js Engineer", etiquetas: ["backend"] });
    expect(coincidePalabras(x, ["node.js"])).toBe(true);
    expect(coincidePalabras(x, ["backend"])).toBe(true);
    expect(coincidePalabras(x, ["java"])).toBe(false);
    expect(coincidePalabras(v({ titulo: "JavaScript Developer" }), ["java"])).toBe(false);
  });

  it("solo remoto y países permitidos", () => {
    expect(pasaFiltros(v({ modalidad: "presencial" }), { soloRemoto: true, paises: [] }).ok).toBe(false);
    expect(pasaFiltros(v({ modalidad: "remoto", paises: ["US"] }), { soloRemoto: true, paises: ["MX"] })).toEqual({ ok: false, motivo: "solo para US" });
    expect(pasaFiltros(v({ modalidad: "remoto", paises: ["US", "MX"] }), { soloRemoto: true, paises: ["MX"] }).ok).toBe(true);
    expect(pasaFiltros(v({ modalidad: "remoto" }), { soloRemoto: true, paises: ["MX"] }).ok).toBe(true);
  });

  it("de duplicados se queda con la que lleva directo al formulario de la empresa", () => {
    const agregador = v({ fuente: "remoteok", idExterno: "9", empresa: "Acme" });
    const directa = v({ fuente: "greenhouse", idExterno: "acme/9", empresa: "Acme Inc", url: "https://job-boards.greenhouse.io/acme/jobs/9" });
    expect(deduplicar([agregador, directa])).toEqual([directa]);
  });
});

describe("puntaje", () => {
  const CV = "Desarrolladora backend con 6 años de experiencia en Node.js, PostgreSQL y Docker.";

  it("afinidad con el CV y factores explicados por preferencias", () => {
    const r = sanitizarRespuestas({ modalidades: ["remoto"], paisesAutorizado: ["MX"], salario: { monto: 5000, moneda: "USD", periodo: "mes" } });
    const buena = puntuar(v({ modalidad: "remoto", publicadaEn: "2026-09-27T00:00:00Z" }), CV, r, AHORA);
    const mala = puntuar(v({ modalidad: "presencial", paises: ["US"], salario: { max: 2000, moneda: "USD", periodo: "mes" }, publicadaEn: "2026-07-01T00:00:00Z" }), CV, r, AHORA);
    expect(buena.prioridad.valor).toBeGreaterThan(mala.prioridad.valor ?? 100);
    expect(buena.prioridad.factores.join(" ")).toMatch(/menos de 4 días/);
    const f = mala.prioridad.factores.join(" ");
    expect(f).toMatch(/presencial/);
    expect(f).toMatch(/residir en US/);
    expect(f).toMatch(/por debajo de tu pretensión/);
    expect(f).toMatch(/hace \d+ días/);
    expect(ordenar([mala, buena])[0]).toBe(buena);
  });

  it("sin habilidades reconocibles no inventa un número", () => {
    const x = puntuar(v({ titulo: "Puesto", descripcion: "Texto sin requisitos." }), CV, RESPUESTAS_VACIAS, AHORA);
    expect(x.prioridad.valor).toBeNull();
  });
});

describe("buscarVacantes", () => {
  const consulta: Consulta = { palabras: ["Backend"], soloRemoto: false, paises: [], empresas: {}, maxPorFuente: 50 };
  const ctx: ContextoFuente = { http: { json: async () => ({}) }, claves: {}, ahora: AHORA };
  const fuente = (id: "remotive" | "remoteok", impl: () => Promise<Vacante[]>): FuenteVacantes => ({ info: INFO_FUENTES[id], buscar: impl });

  it("una fuente que falla no tumba a las demás y se reporta", async () => {
    const r = await buscarVacantes(
      [fuente("remotive", async () => [v(), v({ idExterno: "2", titulo: "Chef" })]), fuente("remoteok", async () => Promise.reject(new Error("respondió 500")))],
      consulta,
      ctx,
    );
    expect(r.vacantes.map((x) => x.titulo)).toEqual(["Backend Developer"]);
    expect(r.reporte).toEqual([
      { fuente: "remotive", estado: "ok", encontradas: 2, aceptadas: 1 },
      { fuente: "remoteok", estado: "error", encontradas: 0, aceptadas: 0, detalle: "respondió 500" },
    ]);
  });

  it("respeta el intervalo mínimo de cada fuente y las claves faltantes", async () => {
    let llamadas = 0;
    const r = await buscarVacantes(
      [fuente("remotive", async () => (llamadas++, [v()])), { info: INFO_FUENTES.adzuna, buscar: async () => [v()] }],
      consulta,
      ctx,
      { ultimaConsulta: { remotive: new Date(AHORA.getTime() - 60 * 60_000) } },
    );
    expect(llamadas).toBe(0);
    expect(r.reporte[0]).toMatchObject({ estado: "omitida", detalle: "consultada hace poco; disponible en 300 min" });
    expect(r.reporte[1]).toMatchObject({ estado: "omitida", detalle: "requiere clave (ADZUNA_APP_ID, ADZUNA_APP_KEY)" });
  });

  it("corta las fuentes que no responden a tiempo", async () => {
    const r = await buscarVacantes([fuente("remotive", () => new Promise(() => {}))], consulta, ctx, { timeoutMs: 20 });
    expect(r.reporte[0]).toMatchObject({ estado: "error", detalle: "sin respuesta en 0 s" });
  });
});

describe("búsqueda en español e inglés", () => {
  it("encuentra el puesto aunque esté en otro idioma o en otro orden", () => {
    expect(coincidePalabras(v({ titulo: "Senior Backend Developer" }), ["Desarrolladora Backend"])).toBe(true);
    expect(coincidePalabras(v({ titulo: "Data Analyst (Remote)" }), ["Analista de Datos"])).toBe(true);
    expect(coincidePalabras(v({ titulo: "Data Engineer" }), ["Analista de Datos"])).toBe(false);
    expect(coincidePalabras(v({ titulo: "Software Engineer" }), ["Ingeniero"])).toBe(true);
  });
});

describe("casos encontrados con datos reales", () => {
  it("reconoce cualquier país (no solo los de LatAm) y los estados de EE. UU.", () => {
    expect(paisesDeTexto("Thailand").paises).toEqual(["TH"]);
    expect(paisesDeTexto("Belgrade, Serbia").paises).toEqual(["RS"]);
    expect(paisesDeTexto("New York, NY (HQ)").paises).toEqual(["US"]);
    expect(paisesDeTexto("Papua New Guinea").paises).toEqual(["PG"]);
    expect(paisesDeTexto("Latin America").paises).not.toContain("US");
    expect(paisesDeTexto("Remote").paises).toEqual([]);
  });

  it("«Back-end», «Full-Stack» y «DevOps» se escriben de muchas formas", () => {
    expect(coincidePalabras(v({ titulo: "AI Back-end Engineer" }), ["Backend Developer"])).toBe(true);
    expect(coincidePalabras(v({ titulo: "Senior Full Stack Engineer" }), ["Full-Stack"])).toBe(true);
  });

  it("busca desde tus herramientas y su enfoque, nunca con las que no tienes", () => {
    const cv = "Desarrollador Java\nAPIs REST con Java y Spring Boot. Java 17, Spring Boot, Kotlin y PostgreSQL.";
    const t = terminosDelCv(cv);
    expect(t[0]).toBe("java");
    expect(t).toEqual(expect.arrayContaining(["spring boot", "kotlin", "backend"]));
    expect(t).not.toContain("python");
    expect(t).not.toContain("data");
  });

  it("cada vuelta consulta primero otra tanda, sin perder ninguna palabra", () => {
    const herramientas = ["Java", "Spring Boot", "Kotlin", "backend"];
    const una = palabrasDeLaBusqueda(["Java Software Engineer"], herramientas, 0);
    const otra = palabrasDeLaBusqueda(["Java Software Engineer"], herramientas, 1);
    expect(otra.slice(0, 3)).not.toEqual(una.slice(0, 3));
    expect([...otra].sort()).toEqual([...una].sort());
  });

  it("con el toggle, deja fuera becas, prácticas y puestos junior; sin él, los muestra", () => {
    const c = { soloRemoto: false, paises: [] };
    for (const titulo of ["Becario Java", "Java Trainee", "Junior Backend Developer", "Practicante de desarrollo", "Pasante TI"]) {
      expect(pasaFiltros(v({ titulo }), { ...c, ocultarEntrada: true }).ok).toBe(false);
      expect(pasaFiltros(v({ titulo }), c).ok).toBe(true);
    }
    expect(pasaFiltros(v({ titulo: "In-person Java Trainer for IT Graduates" }), { ...c, ocultarEntrada: true }).ok).toBe(true);
  });

  it("«Java Software Engineer» busca Java: no exige que el título también diga «Software»", () => {
    expect(coincidePalabras(v({ titulo: "Desarrollador Java Sr" }), ["Java Software Engineer"])).toBe(true);
    expect(coincidePalabras(v({ titulo: "Java Developer (Spring)" }), ["Java Software Engineer"])).toBe(true);
    expect(coincidePalabras(v({ titulo: "Software Engineer, Payments" }), ["Java Software Engineer"])).toBe(false);
  });

  it("ubicaciones en clave de país: «US-REMOTE; US-CHICAGO; CA-TOR» pide vivir en EE. UU. o Canadá", () => {
    expect(paisesDeTexto("US-REMOTE; US-CHICAGO; US-ATLANTA; CA-TOR").paises).toEqual(["CA", "US"]);
    expect(paisesDeTexto("US").paises).toEqual(["US"]);
    expect(paisesDeTexto("San Jose, CA").paises).toEqual(["US"]);
    expect(paisesDeTexto("Join us remotely").paises).toEqual([]);
    // Las que ya estaban guardadas se corrigen al volver a puntuar.
    const stripe = { ...v({ fuente: "greenhouse", titulo: "Partner Development Manager" }), ubicacion: "US-REMOTE; US-CHICAGO; CA-TOR", paises: [] };
    expect(completarVacante(stripe).paises).toEqual(["CA", "US"]);
  });

  it("«In-person» en el título es presencial aunque la plataforma diga remoto", () => {
    expect(modalidadDeTexto("In-person Java Trainer for IT Graduates")).toBe("presencial");
    expect(v({ titulo: "In-person Java Trainer for IT Graduates", modalidad: "remoto" }).modalidad).toBe("presencial");
    expect(v({ titulo: "Java Developer", modalidad: "remoto" }).modalidad).toBe("remoto");
  });

  it("un puesto que no pide herramientas técnicas no sale arriba por inglés y liderazgo", () => {
    const cv = "Líder técnico bilingüe. Inglés C2. Liderazgo de equipos. Java, Spring Boot, Kafka, React y OCI.";
    const negocio = puntuar(v({ titulo: "Partner Development Manager", descripcion: "Fluent English required. Leadership and negotiation skills. Stakeholder management." }), cv, RESPUESTAS_VACIAS, AHORA);
    expect(negocio.prioridad.valor).toBeLessThanOrEqual(15);
    expect(negocio.prioridad.factores.join(" ")).toMatch(/ninguna herramienta técnica/);
    const una = puntuar(v({ titulo: "Java Trainer", descripcion: "Teach Java to graduates. Fluent English and leadership." }), cv, RESPUESTAS_VACIAS, AHORA);
    expect(una.prioridad.valor).toBeLessThanOrEqual(55);
    const tecnica = puntuar(v({ titulo: "Backend Engineer", descripcion: "Java, Spring Boot and Kafka. Fluent English." }), cv, RESPUESTAS_VACIAS, AHORA);
    expect(tecnica.prioridad.valor).toBeGreaterThan(55);
  });

  it("si exige lenguajes que no tienes, que coincidan la base de datos o Docker no la sube (Supabase pedía Haskell y C)", () => {
    const cv = "Java, Spring Boot, Kafka, React, PostgreSQL, Oracle SQL/PL-SQL, Docker y OCI.";
    const descripcion = "Strong Haskell skills with at least 3 years of experience.\nExperience using the C language.\nSolid knowledge of SQL and plpgsql scripting in PostgreSQL.\nExperience with Docker.";
    const supabase = puntuar(v({ titulo: "Data API Engineer", descripcion }), cv, RESPUESTAS_VACIAS, AHORA);
    expect(supabase.prioridad.valor).toBeLessThanOrEqual(40);
    expect(supabase.prioridad.factores.join(" ")).toMatch(/Pide como requisito .*Haskell.* ninguno de esos lenguajes \(tope 40\)/);
    // Con uno de los lenguajes que pide (aquí Java) no hay tope: el resto es negociable.
    const conJava = puntuar(v({ titulo: "Backend Engineer", descripcion: "Java or Go. Kafka and PostgreSQL. Docker." }), cv, RESPUESTAS_VACIAS, AHORA);
    expect(conJava.prioridad.factores.join(" ")).not.toMatch(/tope 40/);
  });

  it("busca con todas tus herramientas: HTML, CSS y JavaScript también, aunque los menciones menos", () => {
    const cv = "Java, Java, Java. Spring Boot, Spring Boot. Kafka, Kafka. React, React. Kotlin. PostgreSQL. Python. HTML, CSS y JavaScript.";
    expect(terminosDelCv(cv)).toEqual(expect.arrayContaining(["html", "css", "javascript"]));
  });

  it("en el tablero oficial de la empresa una vacante antigua sigue abierta", () => {
    const cv = "Backend con Node.js y PostgreSQL.";
    const vieja = { publicadaEn: "2025-01-01T00:00:00Z" };
    const deTablero = puntuar(v({ ...vieja, fuente: "greenhouse", url: "https://job-boards.greenhouse.io/a/jobs/1" }), cv, RESPUESTAS_VACIAS, AHORA);
    const deAgregador = puntuar(v({ ...vieja, fuente: "remotive" }), cv, RESPUESTAS_VACIAS, AHORA);
    expect(deTablero.prioridad.factores.join(" ")).not.toMatch(/puede estar cerrada/);
    expect(deAgregador.prioridad.factores.join(" ")).toMatch(/puede estar cerrada/);
  });
});

describe("señales de nivel e idioma", () => {
  const CV = "Backend con Node.js, PostgreSQL y Docker.";
  const EN = "We are looking for a backend engineer with Node.js and PostgreSQL experience to join our team and build our platform.";

  it("puesto senior con pocos años y puesto de entrada con muchos", () => {
    const junior = sanitizarRespuestas({ aniosExperiencia: 2 });
    const f1 = puntuar(v({ titulo: "Senior Backend Engineer" }), CV, junior, AHORA).prioridad.factores.join(" ");
    expect(f1).toMatch(/Pide nivel senior y tienes 2 años/);
    const experto = sanitizarRespuestas({ aniosExperiencia: 8 });
    const f2 = puntuar(v({ titulo: "Junior Backend Developer" }), CV, experto, AHORA).prioridad.factores.join(" ");
    expect(f2).toMatch(/puesto de entrada y tienes 8 años/);
  });

  it("vacante en inglés con inglés básico baja mucho; con avanzado no cambia", () => {
    const basico = puntuar(v({ descripcion: EN }), CV, sanitizarRespuestas({ nivelIngles: "basico" }), AHORA);
    const avanzado = puntuar(v({ descripcion: EN }), CV, sanitizarRespuestas({ nivelIngles: "avanzado" }), AHORA);
    expect(basico.prioridad.factores.join(" ")).toMatch(/inglés básico \(−20\)/);
    expect((avanzado.prioridad.valor ?? 0) - (basico.prioridad.valor ?? 0)).toBe(20);
  });

  it("la huella cambia si cambian el CV o las respuestas", () => {
    const cv = { id: "a", actualizadoEn: "2026-09-28T00:00:00.000Z" };
    const r = sanitizarRespuestas({ nivelIngles: "avanzado" });
    expect(huellaPuntaje(cv, r)).toBe(huellaPuntaje(cv, sanitizarRespuestas({ nivelIngles: "avanzado" })));
    expect(huellaPuntaje(cv, r)).not.toBe(huellaPuntaje(cv, sanitizarRespuestas({ nivelIngles: "basico" })));
    expect(huellaPuntaje(cv, r)).not.toBe(huellaPuntaje({ ...cv, actualizadoEn: "2026-09-29T00:00:00.000Z" }, r));
  });
});
