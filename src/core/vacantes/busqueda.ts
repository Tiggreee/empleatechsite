import { analizar } from "../analisis/analizador";
import { resumir, type ResumenAnalisis } from "../analisis/resumen";
import { SKILLS, findMentions, type Categoria } from "../analisis/habilidades";
import { detectarIdioma, escapeRegex, prep } from "../analisis/texto";
import { ETIQUETAS, type Respuestas } from "../perfil/respuestas";
import { detectarAlertas } from "../radar/radar";
import { prioridadDeResumen, type Prioridad } from "../seguimiento/prioridad";
import type { Consulta, ContextoFuente, FuenteVacantes } from "./fuentes";
import { claveDuplicado, type FuenteId, type Vacante } from "./vacante";

export interface ResultadoFuente {
  fuente: FuenteId;
  estado: "ok" | "error" | "omitida";
  encontradas: number;
  /** Cuántas pasaron los filtros (palabras, remoto, países). */
  aceptadas: number;
  detalle?: string;
}

export interface VacantePuntuada {
  vacante: Vacante;
  resumen: ResumenAnalisis;
  prioridad: Prioridad;
}

// ---------------------------------------------------------------------------------------------------------------
// Filtros

/** Palabras en minúsculas y sin acentos, sin repetir. Caben todas tus herramientas: la rotación las recorre por tandas. */
export function normalizarPalabras(palabras: string[]): string[] {
  return [...new Set(palabras.map((p) => prep(p).folded.trim().replace(/\s+/g, " ")).filter((p) => p.length >= 2))].slice(0, 40);
}

/** Equivalencias español → inglés a nivel de palabra, para que «Desarrolladora Backend» encuentre «Backend Developer». */
const EQUIVALENTE: Record<string, string> = {
  desarrollador: "developer", desarrolladora: "developer", programador: "developer", programadora: "developer", programmer: "developer", dev: "developer",
  ingeniero: "engineer", ingeniera: "engineer", analista: "analyst", datos: "data", disenador: "designer", disenadora: "designer",
  gerente: "manager", cientifico: "scientist", cientifica: "scientist", soporte: "support", ventas: "sales", producto: "product",
  proyecto: "project", proyectos: "project", seguridad: "security", nube: "cloud", movil: "mobile", pruebas: "qa", calidad: "qa",
  redes: "network", sistemas: "systems", contador: "accountant", contadora: "accountant", reclutador: "recruiter", reclutadora: "recruiter",
};
/**
 * Palabras demasiado generales: solo cuentan si la búsqueda no trae nada más específico. «Software» también: con ella,
 * «Java Software Engineer» exigía las dos palabras y dejaba fuera «Java Developer» o «Desarrollador Java».
 */
const GENERICAS = new Set(["developer", "engineer", "software", "specialist", "especialista"]);
const VACIAS = new Set(["de", "del", "en", "y", "e", "la", "el", "of", "the", "and", "for", "para", "con", "a"]);

function tokens(texto: string): string[] {
  return prep(texto)
    .folded.replace(/\b(back|front)[\s-]+end\b/g, "$1end")
    .replace(/\bfull[\s-]+stack\b/g, "fullstack")
    .replace(/\bdev[\s-]+ops\b/g, "devops")
    .replace(/[^a-z0-9+#.]+/g, " ")
    .split(" ")
    .map((w) => w.replace(/\.+$/, ""))
    .filter((w) => w && !VACIAS.has(w))
    .map((w) => EQUIVALENTE[w] ?? w);
}

/** Niveles del puesto: nunca son la palabra clave («Senior Java Engineer» → «java», no «senior»). */
const NIVELES = new Set(["senior", "sr", "semi", "ssr", "junior", "jr", "mid", "lead", "principal", "staff", "trainee", "intern", "becario", "practicante"]);

/** Categorías del catálogo que son herramientas de trabajo (no prácticas, idiomas ni habilidades blandas). */
const CATEGORIAS_HERRAMIENTA = new Set<Categoria>(["lenguaje", "backend", "frontend", "datos", "ia"]);
/** Lo técnico que puede pedir una vacante: las herramientas más nube y DevOps. */
const CATEGORIAS_TECNICAS = new Set<Categoria>([...CATEGORIAS_HERRAMIENTA, "cloud", "devops"]);

/** En qué se enfoca una herramienta: Spring Boot → backend. Los lenguajes no dicen enfoque por sí solos. */
const ENFOQUE: Partial<Record<Categoria, string>> = { backend: "backend", frontend: "frontend", datos: "data", ia: "machine learning" };

/**
 * Desde qué se busca, según tu CV: todas tus herramientas (las más mencionadas primero; los equivalentes solo si
 * también los tienes, como Kotlin junto a Java) y su enfoque (backend, frontend, fullstack si haces ambos, data…).
 * Todas, no las primeras seis: HTML, CSS o JavaScript se mencionan menos que Java o Spring y nunca les tocaba turno.
 */
export function terminosDelCv(cvTexto: string, max = Infinity): string[] {
  const { folded } = prep(cvTexto);
  const tuyas = SKILLS.filter((sk) => CATEGORIAS_HERRAMIENTA.has(sk.cat))
    .map((sk) => ({ sk, n: findMentions(folded, cvTexto, sk).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  // El enfoque es lo que domina: mencionar PostgreSQL no vuelve «data» a quien hace backend.
  const porEnfoque = new Map<string, number>();
  for (const x of tuyas) {
    const e = ENFOQUE[x.sk.cat];
    if (e) porEnfoque.set(e, (porEnfoque.get(e) ?? 0) + x.n);
  }
  const tope = Math.max(0, ...porEnfoque.values());
  const enfoques = [...porEnfoque].filter(([, n]) => n * 2 >= tope).map(([e]) => e);
  if (enfoques.includes("backend") && enfoques.includes("frontend")) enfoques.push("fullstack");
  // El primer alias es como se escribe en las vacantes («spring boot»); la etiqueta es para mostrar («REST / APIs»).
  return [...tuyas.slice(0, max).map((x) => x.sk.aliases[0] ?? x.sk.label), ...enfoques];
}

/**
 * Palabras de una búsqueda: las tuyas más las herramientas de tu CV. Las fuentes solo consultan las primeras 3, así que
 * `vuelta` rota cuáles van primero: cada búsqueda prueba otras sin hacer más consultas.
 */
export function palabrasDeLaBusqueda(palabras: string[], herramientas: string[], vuelta: number): string[] {
  const todas = normalizarPalabras([...palabras, ...herramientas]);
  if (!todas.length) return todas;
  const k = (Math.max(0, Math.floor(vuelta)) * 3) % todas.length;
  return [...todas.slice(k), ...todas.slice(0, k)];
}

/** La palabra más específica de una búsqueda («Desarrolladora Backend» → «backend»), para APIs que filtran por etiqueta. */
export function palabraClave(busqueda: string): string | undefined {
  const t = tokens(busqueda);
  return t.find((w) => !GENERICAS.has(w) && !NIVELES.has(w)) ?? t.find((w) => !NIVELES.has(w)) ?? t[0];
}

/** Habilidades de dos palabras del catálogo («spring boot», «react native»): «spring» sola también es un resorte. */
const ALIAS_COMPUESTOS = new Set(SKILLS.flatMap((sk) => sk.aliases).filter((a) => a.includes(" ")));

/** Lo que debe mencionar un proyecto: la habilidad principal de la búsqueda, completa si es de dos palabras. */
function claveDeProyecto(busqueda: string): string[] {
  const t = tokens(busqueda).filter((w) => !GENERICAS.has(w) && !NIVELES.has(w));
  if (t.length >= 2 && ALIAS_COMPUESTOS.has(`${t[0]} ${t[1]}`)) return [t[0], t[1]];
  const clave = palabraClave(busqueda);
  return clave ? [clave] : [];
}

/**
 * Una búsqueda coincide si todas sus palabras importantes aparecen (en cualquier orden) en el título o las etiquetas.
 * Basta con que coincida una de las búsquedas. Los proyectos freelance se titulan por lo que hay que construir
 * («App Android con GPS»), no por el puesto: para ellos basta la palabra más específica («java») en título o habilidades.
 */
export function coincidePalabras(v: Vacante, palabras: string[]): boolean {
  if (!palabras.length) return true;
  const texto = new Set(tokens(`${v.titulo} ${v.etiquetas.join(" ")}`));
  return palabras.some((p) => {
    const t = tokens(p);
    const especificas = t.filter((w) => !GENERICAS.has(w));
    const requeridas = v.tipo === "proyecto" ? claveDeProyecto(p) : especificas.length ? especificas : t;
    return requeridas.length > 0 && requeridas.every((w) => texto.has(w));
  });
}

export function pasaFiltros(
  v: Pick<Vacante, "modalidad" | "paises"> & { titulo?: string },
  c: Pick<Consulta, "soloRemoto" | "paises" | "ocultarEntrada">,
): { ok: boolean; motivo?: string } {
  if (c.soloRemoto && v.modalidad && v.modalidad !== "remoto") return { ok: false, motivo: "no es remota" };
  if (c.ocultarEntrada && v.titulo && NIVEL_ENTRADA.test(prep(v.titulo).folded)) return { ok: false, motivo: "beca, práctica o puesto junior" };
  if (c.paises.length && v.paises.length && !v.paises.some((p) => c.paises.includes(p))) {
    return { ok: false, motivo: `solo para ${v.paises.slice(0, 4).join(", ")}` };
  }
  return { ok: true };
}

/** Quita la misma vacante publicada en varias plataformas; conserva la que lleva directo al formulario de la empresa. */
export function deduplicar(vacantes: Vacante[]): Vacante[] {
  const mejor = new Map<string, Vacante>();
  for (const v of vacantes) {
    const clave = claveDuplicado(v);
    const previa = mejor.get(clave);
    if (!previa || (!previa.ats && v.ats) || (!previa.salario && v.salario && !!previa.ats === !!v.ats)) mejor.set(clave, v);
  }
  return [...mejor.values()];
}

// ---------------------------------------------------------------------------------------------------------------
// Puntaje

const NIVEL_ALTO = /\b(senior|sr|staff|principal|lead|l[ií]der|head|architect|arquitect[oa])\b/;
const NIVEL_ENTRADA = /\b(junior|jr|intern|internship|trainee|practicante|practicas|pasante|pasantia|becari[oa]|entry level|entry-level)\b/;

/**
 * Identifica con qué CV y respuestas se calculó un puntaje: si cambian, las vacantes guardadas se vuelven a puntuar.
 * FNV-1a de 32 bits: basta para detectar cambios, no es criptográfico.
 */
/** Súbela cuando cambie cómo se puntúa: las vacantes guardadas se vuelven a puntuar solas. */
const VERSION_PUNTAJE = 7;

/** Reglas del radar que no aplican al ordenar vacantes (ver detectarAlertas). */
const OMITIR_EN_BUSQUEDA = ["sin-rango-salarial"] as const;

export function huellaPuntaje(cv: { id: string; actualizadoEn: string }, respuestas: Respuestas, extra = ""): string {
  let h = 0x811c9dc5;
  for (const c of JSON.stringify(respuestas) + extra) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${cv.id}|${cv.actualizadoEn}|v${VERSION_PUNTAJE}|${h.toString(16)}`;
}

/**
 * Respuestas con las que se ordenan las vacantes. Si no declaraste en qué países puedes trabajar, se toma el país de
 * tu CV: a quien vive en Morelia no le sirve que una vacante presencial en Seattle le salga primero. Solo para ordenar;
 * los formularios se llenan únicamente con lo que tú declaraste.
 */
export function respuestasParaPuntuar(respuestas: Respuestas, paisDelCv: string | undefined): Respuestas {
  if (respuestas.paisesAutorizado.length || !paisDelCv) return respuestas;
  return { ...respuestas, paisesAutorizado: [paisDelCv] };
}

function textoParaAnalizar(v: Vacante): string {
  return `${v.titulo}\n${v.etiquetas.length ? `Requisitos: ${v.etiquetas.join(", ")}\n` : ""}${v.descripcion}`;
}

/**
 * Afinidad con el CV + radar de riesgos + tus preferencias, con cada factor explicado. `ajuste` es lo aprendido de tus
 * resultados (plataformas y niveles que te responden más o menos), ya acotado por quien lo calcula.
 */
export function puntuar(v: Vacante, cvTexto: string, respuestas: Respuestas, ahora: Date, ajuste?: { puntos: number; motivo: string } | null): VacantePuntuada {
  const texto = textoParaAnalizar(v);
  const analisis = analizar(cvTexto, texto, { ahora });
  const resumen = resumir(analisis, detectarAlertas(texto, ahora, { omitir: OMITIR_EN_BUSQUEDA }), ahora);
  const base = prioridadDeResumen(resumen);
  if (base.valor === null) return { vacante: v, resumen, prioridad: base };

  let valor = base.valor;
  const factores = [...base.factores];
  // La afinidad se mide sobre lo que pide la vacante. Si no pide herramientas técnicas (solo inglés, liderazgo,
  // negociación…), un 100 no dice que el puesto sea para ti: así salía «Partner Development Manager» primero.
  const herramientas = new Set(analisis.hallazgos.filter((h) => CATEGORIAS_TECNICAS.has(h.cat)).map((h) => h.id)).size;
  let tope = 100;
  if (herramientas === 0) {
    tope = 15;
    factores.push("No pide ninguna herramienta técnica: la afinidad sale de idiomas o habilidades generales (tope 15)");
  } else if (herramientas === 1) {
    tope = 55;
    factores.push("Pide una sola herramienta técnica reconocible: revisa a mano si el puesto es para ti (tope 55)");
  }
  // Si exige lenguajes y no tienes ninguno (ni uno de su familia), que coincidan la base de datos o la nube no la vuelve
  // tuya: así salía «Data API Engineer» de Supabase con 83 pidiendo Haskell y C.
  const lenguajes = analisis.hallazgos.filter((h) => h.cat === "lenguaje" && h.nivel === "requerida");
  if (lenguajes.length && lenguajes.every((h) => h.estado === "faltante")) {
    tope = Math.min(tope, 40);
    const nombres = lenguajes.slice(0, 3).map((h) => h.label).join(", ");
    factores.push(`Pide como requisito ${nombres} y tu CV no tiene ${lenguajes.length === 1 ? "ese lenguaje" : "ninguno de esos lenguajes"} (tope 40)`);
  }
  if (ajuste?.puntos) {
    valor += ajuste.puntos;
    factores.push(ajuste.motivo);
  }
  if (v.modalidad && respuestas.modalidades.length && !respuestas.modalidades.includes(v.modalidad)) {
    valor -= 15;
    factores.push(`Es ${ETIQUETAS.modalidad[v.modalidad].toLowerCase()} y tú buscas ${respuestas.modalidades.map((m) => ETIQUETAS.modalidad[m].toLowerCase()).join(" o ")} (−15)`);
  }
  if (v.paises.length && respuestas.paisesAutorizado.length && !v.paises.some((p) => respuestas.paisesAutorizado.includes(p))) {
    valor -= 25;
    factores.push(`Pide residir en ${v.paises.slice(0, 4).join(", ")} (−25)`);
  }
  const s = respuestas.salario;
  if (s && v.salario?.max && v.salario.moneda === s.moneda && v.salario.periodo === s.periodo && v.salario.max < s.monto * 0.8) {
    valor -= 10;
    factores.push(`Paga hasta ${v.salario.max.toLocaleString("es-MX")} ${v.salario.moneda}, por debajo de tu pretensión (−10)`);
  }
  // Nivel del puesto contra tus años de experiencia: los filtros automáticos descartan fuera de rango.
  const anios = respuestas.aniosExperiencia;
  const tituloPlegado = prep(v.titulo).folded;
  if (anios !== undefined && NIVEL_ALTO.test(tituloPlegado) && anios < 4) {
    valor -= 10;
    factores.push(`Pide nivel senior y tienes ${anios} año${anios === 1 ? "" : "s"} de experiencia (−10)`);
  } else if (anios !== undefined && NIVEL_ENTRADA.test(tituloPlegado) && anios >= 4) {
    valor -= 5;
    factores.push(`Es un puesto de entrada y tienes ${anios} años de experiencia (−5)`);
  }
  // Idioma de la vacante contra tu nivel de inglés.
  if (detectarIdioma(prep(`${v.titulo}\n${v.descripcion}`).folded) === "en") {
    if (respuestas.nivelIngles === "basico") {
      valor -= 20;
      factores.push("La vacante está en inglés y marcaste inglés básico (−20)");
    } else if (respuestas.nivelIngles === "intermedio") {
      valor -= 5;
      factores.push("La vacante está en inglés y marcaste inglés intermedio (−5)");
    }
  }

  const dias = v.publicadaEn ? Math.floor((ahora.getTime() - new Date(v.publicadaEn).getTime()) / 86_400_000) : 0;
  // En el tablero oficial de la empresa solo aparece lo que sigue abierto, aunque se haya publicado hace meses.
  const tableroOficial = v.fuente === "greenhouse" || v.fuente === "lever" || v.fuente === "ashby";
  if (dias > 30 && !tableroOficial) {
    valor -= 10;
    factores.push(`Publicada hace ${dias} días: puede estar cerrada (−10)`);
  } else if (v.publicadaEn && dias >= 0 && dias <= 3) {
    valor += 5;
    factores.push("Publicada hace menos de 4 días: postular pronto aumenta las respuestas (+5)");
  }

  // Las etiquetas de un proyecto son su lista de requisitos; las que el catálogo no conoce (SolidWorks, Telugu…) el
  // analizador no las ve, así que aquí se cuentan contra tu CV.
  if (v.tipo === "proyecto") {
    const faltan = habilidadesFaltantes(v.etiquetas, cvTexto);
    const utiles = v.etiquetas.filter((e) => !ETIQUETAS_GENERALES.has(prep(e).folded.trim())).length;
    if (faltan.length >= 3 && faltan.length * 2 >= utiles) {
      // La mayoría de lo que pide no está en tu CV: es de otra especialidad, aunque comparta alguna palabra.
      valor = Math.min(valor, 20);
      factores.push(`La mayoría de lo que pide no está en tu CV (${faltan.slice(0, 3).join(", ")}…): parece de otra especialidad`);
    } else if (faltan.length) {
      const menos = Math.min(30, faltan.length * 6);
      valor -= menos;
      factores.push(`Pide habilidades que no están en tu CV: ${faltan.slice(0, 3).join(", ")}${faltan.length > 3 ? "…" : ""} (−${menos})`);
    }
  }

  // Proyectos freelance: los primeros en proponer tienen mucha más probabilidad de que el cliente los lea.
  if (v.propuestas !== undefined) {
    if (v.propuestas <= 10) {
      valor += 5;
      factores.push(`Lleva ${v.propuestas} propuesta${v.propuestas === 1 ? "" : "s"}: llegas entre los primeros (+5)`);
    } else if (v.propuestas > 50) {
      valor -= 5;
      factores.push(`Ya lleva ${v.propuestas} propuestas: destaca con una propuesta corta y concreta (−5)`);
    }
  }

  valor = Math.max(0, Math.min(tope, Math.round(valor)));
  let recomendacion = base.recomendacion;
  if (recomendacion === "postular" && valor < 70) recomendacion = "revisar";
  if (recomendacion !== "descartar" && valor < 25) recomendacion = "descartar";
  return { vacante: v, resumen, prioridad: { valor, recomendacion, factores } };
}

/** Etiquetas tan generales que no dicen qué habilidad falta. */
const ETIQUETAS_GENERALES = new Set(["engineering", "software development", "software engineering", "programming", "coding", "web development", "software architecture"]);

/**
 * Etiquetas de un proyecto que el catálogo de habilidades no conoce y tampoco aparecen en tu CV. Las que el catálogo
 * sí conoce ya las evalúa el analizador (con crédito por habilidades transferibles), así que no se cuentan dos veces.
 */
export function habilidadesFaltantes(etiquetas: string[], cvTexto: string): string[] {
  const cv = prep(cvTexto).folded;
  return etiquetas.filter((e) => {
    const t = prep(e);
    const texto = t.folded.trim();
    if (!texto || ETIQUETAS_GENERALES.has(texto)) return false;
    if (SKILLS.some((sk) => findMentions(t.folded, t.orig, sk).length)) return false;
    return !new RegExp(`(^|[^a-z0-9])${escapeRegex(texto)}([^a-z0-9]|$)`).test(cv);
  });
}

export function ordenar(lista: VacantePuntuada[]): VacantePuntuada[] {
  return [...lista].sort((a, b) => (b.prioridad.valor ?? -1) - (a.prioridad.valor ?? -1) || (b.vacante.publicadaEn ?? "").localeCompare(a.vacante.publicadaEn ?? ""));
}

// ---------------------------------------------------------------------------------------------------------------
// Orquestación

export interface OpcionesBusqueda {
  /** Última consulta exitosa por fuente, para respetar el intervalo mínimo de cada una. */
  ultimaConsulta?: Partial<Record<FuenteId, Date>>;
  /** Ignora el intervalo mínimo (solo pruebas). */
  forzar?: boolean;
  timeoutMs?: number;
}

function conTiempoLimite<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`sin respuesta en ${Math.round(ms / 1000)} s`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** Consulta las fuentes en paralelo; una que falle no tumba a las demás. */
export async function buscarVacantes(
  fuentes: FuenteVacantes[],
  consulta: Consulta,
  ctx: ContextoFuente,
  opciones: OpcionesBusqueda = {},
): Promise<{ vacantes: Vacante[]; reporte: ResultadoFuente[] }> {
  const palabras = normalizarPalabras(consulta.palabras);
  const c: Consulta = { ...consulta, palabras };

  const resultados = await Promise.all(
    fuentes.map(async (f): Promise<{ reporte: ResultadoFuente; vacantes: Vacante[] }> => {
      const base = { fuente: f.info.id, encontradas: 0, aceptadas: 0 };
      const faltan = f.info.claves.filter((k) => !ctx.claves[k]);
      if (faltan.length) return { reporte: { ...base, estado: "omitida", detalle: `requiere clave (${faltan.join(", ")})` }, vacantes: [] };
      if (f.info.necesitaEmpresas && !c.empresas[f.info.id as keyof Consulta["empresas"]]?.length) {
        return { reporte: { ...base, estado: "omitida", detalle: "no hay empresas configuradas" }, vacantes: [] };
      }
      const ultima = opciones.ultimaConsulta?.[f.info.id];
      const minutos = ultima ? (ctx.ahora.getTime() - ultima.getTime()) / 60_000 : Infinity;
      if (!opciones.forzar && minutos < f.info.intervaloMinutos) {
        const espera = Math.ceil(f.info.intervaloMinutos - minutos);
        return { reporte: { ...base, estado: "omitida", detalle: `consultada hace poco; disponible en ${espera} min` }, vacantes: [] };
      }
      try {
        const crudas = await conTiempoLimite(f.buscar(c, ctx), opciones.timeoutMs ?? 20_000);
        const aceptadas = crudas.filter((v) => coincidePalabras(v, palabras) && pasaFiltros(v, c).ok).slice(0, c.maxPorFuente);
        return { reporte: { ...base, estado: "ok", encontradas: crudas.length, aceptadas: aceptadas.length }, vacantes: aceptadas };
      } catch (e) {
        return { reporte: { ...base, estado: "error", detalle: e instanceof Error ? e.message.slice(0, 200) : "error desconocido" }, vacantes: [] };
      }
    }),
  );

  return { vacantes: deduplicar(resultados.flatMap((r) => r.vacantes)), reporte: resultados.map((r) => r.reporte) };
}
