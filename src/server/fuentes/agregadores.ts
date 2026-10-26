import { palabraClave } from "@/core/vacantes/busqueda";
import { INFO_FUENTES, type Consulta, type ContextoFuente, type FuenteVacantes } from "@/core/vacantes/fuentes";
import { paisesDeTexto } from "@/core/vacantes/paises";
import { crearVacante, fechaIso, htmlATexto, modalidadDeTexto, salarioDeTexto, type Modalidad, type Vacante } from "@/core/vacantes/vacante";
import { arr, definidas, num, obj, str, strs } from "./json";

/** Palabras para las fuentes que buscan del lado del servidor (máximo 3 consultas por búsqueda). */
const primeras = (c: Consulta) => (c.palabras.length ? c.palabras.slice(0, 3) : [""]);

// ---------------------------------------------------------------------------------------------------------------
// Get on Board — https://www.getonbrd.com/api/v0

const MODALIDAD_GOB: Record<string, Modalidad> = { fully_remote: "remoto", remote_local: "remoto", temporarily_remote: "remoto", hybrid: "hibrido", no_remote: "presencial" };

export function mapearGetOnBoard(json: unknown): Vacante[] {
  return definidas(
    arr(obj(json).data).map((d) => {
      const j = obj(d);
      const a = obj(j.attributes);
      const empresa = str(obj(obj(obj(a.company).data).attributes).name);
      const secciones = [a.description, a.functions, a.desirable, a.benefits].map(str).filter(Boolean).join("\n");
      const min = num(a.min_salary);
      const max = num(a.max_salary);
      // Con «remoto solo local», `countries` dice solo «Remote»: el país de verdad viene en `location_tenants`.
      const sedes = arr(obj(a.location_tenants).data).map((t) => str(obj(obj(t).attributes).name)).filter((n): n is string => !!n);
      const lugares = [...new Set([...strs(a.countries), ...sedes])].join(", ");
      return crearVacante("getonboard", {
        idExterno: str(j.id) ?? "",
        titulo: str(a.title) ?? "",
        empresa: empresa ?? "",
        ubicacion: lugares || undefined,
        modalidad: MODALIDAD_GOB[str(a.remote_modality) ?? ""] ?? (a.remote === true ? "remoto" : undefined),
        // «fully_remote» acepta a cualquiera; el resto pide estar en los países listados.
        paises: str(a.remote_modality) === "fully_remote" ? [] : paisesDeTexto(lugares).paises,
        url: str(obj(j.links).public_url) ?? "",
        descripcion: htmlATexto(secciones),
        publicadaEn: fechaIso(num(a.published_at)),
        // Get on Board publica sueldos brutos mensuales en USD.
        salario: min || max ? { min, max, moneda: "USD", periodo: "mes" } : undefined,
        etiquetas: [str(a.category_name)].filter((s): s is string => !!s),
      });
    }),
  );
}

export const getOnBoard: FuenteVacantes = {
  info: INFO_FUENTES.getonboard,
  async buscar(c: Consulta, ctx: ContextoFuente) {
    const expand = encodeURIComponent('["company","location_tenants"]');
    const lotes = await Promise.all(
      primeras(c).map((q) => ctx.http.json(`https://www.getonbrd.com/api/v0/search/jobs?query=${encodeURIComponent(q)}&per_page=50&page=1&expand=${expand}`)),
    );
    return lotes.flatMap(mapearGetOnBoard);
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Remotive — https://remotive.com/api/remote-jobs (máx. 4 consultas al día: una sola petición sin filtro)

export function mapearRemotive(json: unknown): Vacante[] {
  return definidas(
    arr(obj(json).jobs).map((x) => {
      const j = obj(x);
      const lugar = str(j.candidate_required_location);
      return crearVacante("remotive", {
        idExterno: str(j.id) ?? "",
        titulo: str(j.title) ?? "",
        empresa: str(j.company_name) ?? "",
        ubicacion: lugar,
        modalidad: "remoto",
        paises: paisesDeTexto(lugar).paises,
        url: str(j.url) ?? "",
        descripcion: htmlATexto(str(j.description) ?? ""),
        publicadaEn: fechaIso(str(j.publication_date)),
        salario: salarioDeTexto(str(j.salary)),
        etiquetas: [str(j.category), ...strs(j.tags)].filter((s): s is string => !!s),
      });
    }),
  );
}

export const remotive: FuenteVacantes = {
  info: INFO_FUENTES.remotive,
  async buscar(_c, ctx) {
    return mapearRemotive(await ctx.http.json("https://remotive.com/api/remote-jobs"));
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Remote OK — https://remoteok.com/api (el primer elemento es el aviso legal)

export function mapearRemoteOk(json: unknown): Vacante[] {
  return definidas(
    arr(json)
      .filter((x) => obj(x).id !== undefined && obj(x).position !== undefined)
      .map((x) => {
        const j = obj(x);
        const lugar = str(j.location);
        const min = num(j.salary_min);
        const max = num(j.salary_max);
        return crearVacante("remoteok", {
          idExterno: str(j.id) ?? "",
          titulo: str(j.position) ?? "",
          empresa: str(j.company) ?? "",
          ubicacion: lugar,
          modalidad: "remoto",
          paises: paisesDeTexto(lugar).paises,
          url: str(j.url) ?? "",
          urlPostular: str(j.apply_url),
          descripcion: htmlATexto(str(j.description) ?? ""),
          publicadaEn: fechaIso(str(j.date) ?? num(j.epoch)),
          salario: min || max ? { min, max, moneda: "USD", periodo: "año" } : undefined,
          etiquetas: strs(j.tags),
        });
      }),
  );
}

export const remoteOk: FuenteVacantes = {
  info: INFO_FUENTES.remoteok,
  async buscar(_c, ctx) {
    return mapearRemoteOk(await ctx.http.json("https://remoteok.com/api"));
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Jobicy — https://jobicy.com/api/v2/remote-jobs

export function mapearJobicy(json: unknown): Vacante[] {
  return definidas(
    arr(obj(json).jobs).map((x) => {
      const j = obj(x);
      const geo = str(j.jobGeo);
      const min = num(j.annualSalaryMin);
      const max = num(j.annualSalaryMax);
      return crearVacante("jobicy", {
        idExterno: str(j.id) ?? "",
        titulo: str(j.jobTitle) ?? "",
        empresa: str(j.companyName) ?? "",
        ubicacion: geo,
        modalidad: "remoto",
        paises: paisesDeTexto(geo).paises,
        url: str(j.url) ?? "",
        descripcion: htmlATexto(str(j.jobDescription) ?? ""),
        publicadaEn: fechaIso(str(j.pubDate)),
        salario: min || max ? { min, max, moneda: str(j.salaryCurrency) ?? "USD", periodo: "año" } : undefined,
        etiquetas: [...strs(j.jobIndustry), ...strs(j.jobType), str(j.jobLevel)].filter((s): s is string => !!s),
      });
    }),
  );
}

export const jobicy: FuenteVacantes = {
  info: INFO_FUENTES.jobicy,
  // Jobicy filtra por una etiqueta («backend», «data»…): una consulta por palabra clave.
  async buscar(c, ctx) {
    const etiquetas = [...new Set(c.palabras.slice(0, 3).map(palabraClave).filter((e): e is string => !!e))];
    const urls = etiquetas.length
      ? etiquetas.map((e) => `https://jobicy.com/api/v2/remote-jobs?count=100&tag=${encodeURIComponent(e)}`)
      : ["https://jobicy.com/api/v2/remote-jobs?count=100"];
    const lotes = await Promise.all(urls.map((u) => ctx.http.json(u)));
    const vistas = new Set<string>();
    return lotes.flatMap(mapearJobicy).filter((v) => !vistas.has(v.id) && vistas.add(v.id));
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Himalayas — https://himalayas.app/jobs/api/search

const PERIODO_HIMALAYAS: Record<string, "hora" | "mes" | "año"> = { hourly: "hora", monthly: "mes", annual: "año", yearly: "año" };

export function mapearHimalayas(json: unknown): Vacante[] {
  return definidas(
    arr(obj(json).jobs).map((x) => {
      const j = obj(x);
      const restricciones = strs(j.locationRestrictions);
      const min = num(j.minSalary);
      const max = num(j.maxSalary);
      return crearVacante("himalayas", {
        idExterno: str(j.guid) ?? "",
        titulo: str(j.title) ?? "",
        empresa: str(j.companyName) ?? "",
        ubicacion: restricciones.join(", ") || "Cualquier país",
        modalidad: "remoto",
        paises: paisesDeTexto(restricciones.join(", ")).paises,
        url: str(j.applicationLink) ?? str(j.guid) ?? "",
        descripcion: htmlATexto(str(j.description) ?? ""),
        publicadaEn: fechaIso(num(j.pubDate)),
        salario: min || max ? { min, max, moneda: str(j.currency), periodo: PERIODO_HIMALAYAS[str(j.salaryPeriod) ?? ""] } : undefined,
        etiquetas: [...strs(j.categories).map((c) => c.replace(/-/g, " ")), ...strs(j.seniority)],
      });
    }),
  );
}

export const himalayas: FuenteVacantes = {
  info: INFO_FUENTES.himalayas,
  async buscar(c, ctx) {
    const lotes = await Promise.all(primeras(c).map((q) => ctx.http.json(`https://himalayas.app/jobs/api/search?q=${encodeURIComponent(q)}&limit=100`)));
    return lotes.flatMap(mapearHimalayas);
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Arbeitnow — https://www.arbeitnow.com/api/job-board-api

export function mapearArbeitnow(json: unknown): Vacante[] {
  return definidas(
    arr(obj(json).data).map((x) => {
      const j = obj(x);
      const lugar = str(j.location);
      const remoto = j.remote === true;
      const paises = paisesDeTexto(lugar).paises;
      return crearVacante("arbeitnow", {
        idExterno: str(j.slug) ?? "",
        titulo: str(j.title) ?? "",
        empresa: str(j.company_name) ?? "",
        ubicacion: lugar,
        modalidad: remoto ? "remoto" : (modalidadDeTexto(lugar) ?? "presencial"),
        // Casi todo Arbeitnow es en Alemania: si no es remota y no dice país, se asume ahí.
        paises: remoto ? [] : paises.length ? paises : ["DE"],
        url: str(j.url) ?? "",
        descripcion: htmlATexto(str(j.description) ?? ""),
        publicadaEn: fechaIso(num(j.created_at)),
        etiquetas: [...strs(j.tags), ...strs(j.job_types)],
      });
    }),
  );
}

export const arbeitnow: FuenteVacantes = {
  info: INFO_FUENTES.arbeitnow,
  async buscar(_c, ctx) {
    return mapearArbeitnow(await ctx.http.json("https://www.arbeitnow.com/api/job-board-api"));
  },
};
