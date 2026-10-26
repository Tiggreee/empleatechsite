import { describe, expect, it } from "vitest";
import { analizar, detectarHabilidades } from "./analizador";
import { CV_EJEMPLO, OFERTA_EJEMPLO } from "./ejemplo";

const AHORA = new Date("2026-09-19T12:00:00Z");
type R = ReturnType<typeof analizar>;
const find = (r: R, id: string) => r.hallazgos.find((h) => h.id === id);

describe("regresiones de la v1: falsos positivos por subcadena", () => {
  const oferta = `We are hiring a Senior Backend Engineer. You will build REST API services in Go and Python, deploy on AWS with Docker and Kubernetes, work with PostgreSQL. Good communication and interest in mentoring required. Experience with Java is a plus.`;
  const cv = `Frontend developer. Built websites with HTML, CSS and JavaScript at Google Fitness. Maintained email templates. Interested in learning new technologies and improving user interfaces every day.`;

  it("JavaScript no cuenta como Java", () => {
    expect(find(analizar(cv, oferta, { ahora: AHORA }), "java")?.estado).toBe("faltante");
  });

  it("'Google' no cuenta como Go ni 'interest' como REST", () => {
    const r = analizar(cv, oferta, { ahora: AHORA });
    expect(find(r, "go")?.estado).toBe("faltante");
    expect(find(r, "rest")?.estado).toBe("faltante");
  });

  it("un CV sin ninguna habilidad pedida puntúa 0", () => {
    expect(analizar(cv, oferta, { ahora: AHORA }).score).toBe(0);
  });

  it("no reporta palabras genéricas (senior, backend, hiring) como habilidades", () => {
    const ids = analizar(cv, oferta, { ahora: AHORA }).hallazgos.map((h) => h.label.toLowerCase());
    for (const ruido of ["senior", "backend", "hiring", "engineer"]) expect(ids).not.toContain(ruido);
  });

  it("un CV que cubre todo puntúa 100", () => {
    const completo = "Python, Go, AWS, Docker, Kubernetes, PostgreSQL, REST API, communication, Java. Backend engineer with seven projects delivered for customers across several industries and teams.";
    expect(analizar(completo, oferta, { ahora: AHORA }).score).toBe(100);
  });
});

describe("sufijo .js", () => {
  it("'Node.js' o 'Next.js' no cuentan como JavaScript, pero 'JS' sí", () => {
    const r = analizar("Uso JS a diario", "Requisitos:\n- Node.js y Next.js", { ahora: AHORA });
    expect(find(r, "javascript")).toBeUndefined();
    expect(find(analizar("x", "Requisitos:\n- Dominio de JS moderno", { ahora: AHORA }), "javascript")).toBeDefined();
  });
});

describe("Go como lenguaje", () => {
  it("reconoce 'Go' y descarta 'go-to-market' y 'go to'", () => {
    const of = "Requisitos:\n- Experiencia con Go y Python.\n- Estrategia go-to-market.";
    const r = analizar("Uso Go a diario.", of, { ahora: AHORA });
    expect(find(r, "go")?.menciones).toBe(1);
    const r2 = analizar("Uso Go a diario.", "Requisitos:\n- We go to market with Python.", { ahora: AHORA });
    expect(find(r2, "go")).toBeUndefined();
  });
});

describe("secciones de la oferta", () => {
  const r = analizar(CV_EJEMPLO, OFERTA_EJEMPLO, { ahora: AHORA });

  it("clasifica requeridas vs deseables", () => {
    expect(find(r, "postgres")?.nivel).toBe("requerida");
    expect(find(r, "terraform")?.nivel).toBe("deseable");
    expect(find(r, "graphql")?.nivel).toBe("deseable");
  });

  it("ignora la sección de beneficios (clases de inglés no es un requisito)", () => {
    const ing = find(r, "ingles");
    expect(ing?.nivel).toBe("requerida");
    expect(ing?.menciones).toBe(1);
  });

  it("marca 'is a plus' como deseable aun en párrafo corrido", () => {
    const x = analizar("Python", "You will use Python daily. Experience with Kubernetes is a plus.", { ahora: AHORA });
    expect(find(x, "python")?.nivel).toBe("requerida");
    expect(find(x, "kubernetes")?.nivel).toBe("deseable");
  });
});

describe("habilidades transferibles y evidencia", () => {
  const r = analizar(CV_EJEMPLO, OFERTA_EJEMPLO, { ahora: AHORA });

  it("PostgreSQL: cubierta con evidencia del CV", () => {
    const pg = find(r, "postgres");
    expect(pg?.estado).toBe("cubierta");
    expect(pg?.enCv).toMatch(/PostgreSQL/);
  });

  it("AWS faltante; Python faltante; Node cubierta", () => {
    expect(find(r, "aws")?.estado).toBe("faltante");
    expect(find(r, "python")?.estado).toBe("faltante");
    expect(find(r, "nodejs")?.estado).toBe("cubierta");
  });

  it("Docker en el CV da crédito transferible a Kubernetes", () => {
    const k = find(r, "kubernetes");
    expect(k?.estado).toBe("transferible");
    expect(k?.via).toBe("Docker");
  });

  it("MySQL transfiere a PostgreSQL cuando Postgres no aparece", () => {
    const x = analizar("Trabajo con MySQL cada día en proyectos de datos.", "Requisitos:\n- PostgreSQL", { ahora: AHORA });
    expect(find(x, "postgres")?.estado).toBe("transferible");
    expect(x.score).toBe(40);
  });

  it("las razones citan evidencia y las brechas se limitan a 3", () => {
    expect(r.razones.length).toBeGreaterThan(0);
    expect(r.razones[0]).toMatch(/Cubres/);
    expect(r.brechas.length).toBeLessThanOrEqual(3);
  });

  it("las sugerencias nunca invitan a inventar experiencia", () => {
    expect(r.sugerencias.join(" ")).toMatch(/no la inventes/);
  });
});

describe("experiencia", () => {
  it("puntúa años solo cuando el CV los declara", () => {
    const r = analizar(CV_EJEMPLO, OFERTA_EJEMPLO, { ahora: AHORA });
    expect(r.experiencia).toMatchObject({ aniosPedidos: 3, aniosCv: 4, fuente: "declarada", puntuada: true });
  });

  it("estima por fechas pero no puntúa, y avisa cómo declararlo", () => {
    const cv = "Desarrollador con Node.js. 2019 - 2024 en Acme construyendo servicios y APIs para clientes de banca y retail durante todo el periodo.";
    const of = "Requisitos:\n- 3+ años de experiencia con Node.js.";
    const r = analizar(cv, of, { ahora: AHORA });
    expect(r.experiencia).toMatchObject({ fuente: "estimada", aniosEstimados: 5, puntuada: false });
    expect(r.avisos.join(" ")).toMatch(/escríbelo explícitamente/);
  });

  it("los años declarados pero insuficientes bajan el score", () => {
    const cv = "1 año de experiencia con Node.js en proyectos personales y de estudio universitario durante la carrera.";
    const of = "Requisitos:\n- 4+ años de experiencia con Node.js.";
    const r = analizar(cv, of, { ahora: AHORA });
    expect(r.score).toBe(Math.round((1 * 0.8 + 0.25 * 0.2) * 100));
  });
});

describe("bilingüe y avisos", () => {
  it("detecta desajuste de idioma", () => {
    const r = analizar(CV_EJEMPLO, "We are looking for a backend engineer. You will work with our team and the company on Python services. Requirements: Python and PostgreSQL and the ability to work with our customers across teams.", { ahora: AHORA });
    expect(r.idiomaCv).toBe("es");
    expect(r.idiomaOferta).toBe("en");
    expect(r.avisos.join(" ")).toMatch(/inglés/);
  });

  it("acentos y mayúsculas no importan (ES)", () => {
    const r = analizar("Tengo liderazgo y COMUNICACIÓN efectiva en equipos.", "Requisitos:\n- Comunicación y Liderazgo", { ahora: AHORA });
    expect(find(r, "comunicacion")?.estado).toBe("cubierta");
    expect(find(r, "liderazgo")?.estado).toBe("cubierta");
  });

  it("entradas vacías o sin habilidades no revientan y devuelven score null", () => {
    expect(analizar("", "algo").score).toBeNull();
    const r = analizar("Texto cualquiera de mi CV sin tecnologias".repeat(3), "Buscamos a alguien amable y puntual para nuestro equipo de oficina, con ganas de aprender y crecer con nosotros.", { ahora: AHORA });
    expect(r.score).toBeNull();
    expect(r.avisos.join(" ")).toMatch(/No detectamos habilidades/);
  });

  it("soporta CRLF sin desalinear secciones", () => {
    const of = "Deseable:\r\n- Terraform\r\nRequisitos:\r\n- Python";
    const r = analizar("Python y Terraform en producción durante años.", of, { ahora: AHORA });
    expect(find(r, "terraform")?.nivel).toBe("deseable");
    expect(find(r, "python")?.nivel).toBe("requerida");
  });

  it("el puntaje es determinista y está en 0..100", () => {
    const a = analizar(CV_EJEMPLO, OFERTA_EJEMPLO, { ahora: AHORA });
    const b = analizar(CV_EJEMPLO, OFERTA_EJEMPLO, { ahora: AHORA });
    expect(a).toEqual(b);
    expect(a.score).toBeGreaterThanOrEqual(0);
    expect(a.score).toBeLessThanOrEqual(100);
  });
});

describe("detectarHabilidades", () => {
  it("lista lo que entiende del CV con su categoría, sin falsos positivos", () => {
    const h = detectarHabilidades("Trabajé con JavaScript y React en Google. Uso Docker y MySQL.");
    const ids = h.map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(["javascript", "react", "docker", "mysql"]));
    expect(ids).not.toContain("java");
    expect(ids).not.toContain("go");
    expect(h.find((x) => x.id === "docker")?.cat).toBe("devops");
  });

  it("ordena por menciones y no revienta con texto vacío", () => {
    expect(detectarHabilidades("Python Python Python Docker")[0].id).toBe("python");
    expect(detectarHabilidades("")).toEqual([]);
  });

  it("«C» solo cuenta como lenguaje cuando el contexto lo dice", () => {
    const ids = (t: string) => detectarHabilidades(t).map((h) => h.id);
    expect(ids("Experience using the C language.")).toContain("c");
    expect(ids("Proficiency in C/C++ and Rust.")).toEqual(expect.arrayContaining(["c", "cpp", "rust"]));
    expect(ids("Programas en C y Python.")).toContain("c");
    expect(ids("Strong Haskell skills.")).toContain("haskell");
    for (const t of ["Series C funding", "C-level stakeholders", "English C2", "C# and .NET", "Senior C++ developer", "Plan C"]) {
      expect(ids(t)).not.toContain("c");
    }
  });
});

describe("ofertas y CV de México y LatAm", () => {
  const OFERTA_MX = `Auxiliar Contable
Escolaridad: Licenciatura en Contaduría.
Conocimientos: Aspel COI, Excel (tablas dinámicas) y facturación electrónica CFDI.
Deseable: nóminas e IMSS.
Te ofrecemos:
- Prestaciones de ley, aguinaldo de 30 días y vales de despensa.
- Curso de Python para crecer.`;

  const CV_MX = `Contadora con 4 años de experiencia. Manejo de CONTPAQi, paquetería Office y cálculo de nómina.
Emisión de CFDI y atención a clientes. Inglés: TOEFL ITP 550.`;

  it("toma el contenido de las etiquetas en línea («Conocimientos: …»)", () => {
    const r = analizar(CV_MX, OFERTA_MX, { ahora: AHORA });
    const nivel = (id: string) => r.hallazgos.find((h) => h.id === id)?.nivel;
    expect(nivel("aspel")).toBe("requerida");
    expect(nivel("excel")).toBe("requerida");
    expect(nivel("facturacion")).toBe("requerida");
    expect(nivel("nomina")).toBe("deseable");
    expect(nivel("imss")).toBe("deseable");
  });

  it("ignora «Te ofrecemos» y las prestaciones aunque mencionen habilidades", () => {
    const r = analizar(CV_MX, OFERTA_MX, { ahora: AHORA });
    expect(r.hallazgos.some((h) => h.id === "python")).toBe(false);
  });

  it("CONTPAQi da crédito transferible para Aspel", () => {
    const r = analizar(CV_MX, OFERTA_MX, { ahora: AHORA });
    expect(r.hallazgos.find((h) => h.id === "aspel")).toMatchObject({ estado: "transferible", via: "CONTPAQi" });
    expect(r.hallazgos.find((h) => h.id === "facturacion")?.estado).toBe("cubierta");
  });

  it("una etiqueta como «Conocimientos en Excel» sin dos puntos es contenido, no título", () => {
    const r = analizar(CV_MX, "Requisitos\nConocimientos en Excel y SAP\nExperiencia en nómina", { ahora: AHORA });
    expect(r.hallazgos.map((h) => h.id)).toEqual(expect.arrayContaining(["excel", "sap", "nomina"]));
  });

  it("reconoce la jerga local en un CV", () => {
    const ids = detectarHabilidades(CV_MX).map((h) => h.id);
    expect(ids).toEqual(expect.arrayContaining(["contpaqi", "office", "nomina", "facturacion", "cliente", "ingles"]));
  });

  it("una etiqueta con texto tras los dos puntos también abre sección para las viñetas siguientes", () => {
    const r = analizar(CV_MX, "Funciones\n- Atención a clientes\nBeneficios: te ofrecemos lo siguiente\n- Curso de Python\n- Clases de inglés", { ahora: AHORA });
    const ids = r.hallazgos.map((h) => h.id);
    expect(ids).toContain("cliente");
    expect(ids).not.toContain("python");
    expect(ids).not.toContain("ingles");
  });

  it("«Prestaciones de ley…» como viñeta de requisitos no apaga el resto de la oferta", () => {
    const r = analizar(CV_MX, "Requisitos\n- Prestaciones de ley y cálculo de finiquitos\n- Excel avanzado\n- CONTPAQi", { ahora: AHORA });
    expect(r.hallazgos.map((h) => h.id)).toEqual(expect.arrayContaining(["excel", "contpaqi"]));
  });

  it("«Prestaciones:» sola sí es un título de beneficios", () => {
    const r = analizar(CV_MX, "Requisitos\n- Excel\nPrestaciones:\n- Curso de Python", { ahora: AHORA });
    expect(r.hallazgos.map((h) => h.id)).not.toContain("python");
  });

  it("no toma «sua» del portugués como IMSS", () => {
    expect(detectarHabilidades("Buscamos alguém para sua equipe, com sua experiência em vendas.").map((h) => h.id)).not.toContain("imss");
  });

  it("no confunde «redes sociales» ni «redes neuronales» con redes de cómputo", () => {
    const ids = detectarHabilidades("Community manager de redes sociales; investigación con redes neuronales.").map((h) => h.id);
    expect(ids).toContain("redes-sociales");
    expect(ids).not.toContain("networking");
  });
});
