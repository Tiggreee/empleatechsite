import { decodificarEntidades } from "@/core/analisis/texto";
import { INFO_FUENTES, type Consulta, type ContextoFuente, type FuenteDeEmpresas, type FuenteVacantes } from "@/core/vacantes/fuentes";
import { paisesDeTexto } from "@/core/vacantes/paises";
import { crearVacante, fechaIso, htmlATexto, modalidadDeTexto, salarioDeTexto, type Modalidad, type Vacante } from "@/core/vacantes/vacante";
import { arr, definidas, nombreDeTablero, num, obj, str, strs } from "./json";

const MAX_EMPRESAS = 25;
/** Identificador de tablero: solo letras, números, guiones. Nunca se arma una URL con texto libre. */
const TOKEN = /^[a-z0-9][a-z0-9_-]{0,79}$/i;

export function tokensValidos(tokens: string[] | undefined): string[] {
  return [...new Set((tokens ?? []).map((t) => t.trim().toLowerCase()).filter((t) => TOKEN.test(t)))].slice(0, MAX_EMPRESAS);
}

/** Consulta cada tablero por separado; una empresa que falle (tablero cerrado, renombrado) no tumba a las demás. */
async function porEmpresa(fuente: FuenteDeEmpresas, c: Consulta, fn: (token: string) => Promise<Vacante[]>): Promise<Vacante[]> {
  const tokens = tokensValidos(c.empresas[fuente]);
  const res = await Promise.allSettled(tokens.map(fn));
  const ok = res.filter((r): r is PromiseFulfilledResult<Vacante[]> => r.status === "fulfilled");
  if (!ok.length && res.length) {
    const primero = res.find((r): r is PromiseRejectedResult => r.status === "rejected");
    throw primero?.reason instanceof Error ? primero.reason : new Error("ningún tablero respondió");
  }
  return ok.flatMap((r) => r.value);
}

// ---------------------------------------------------------------------------------------------------------------
// Greenhouse — https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true

export function mapearGreenhouse(json: unknown, token: string): Vacante[] {
  return definidas(
    arr(obj(json).jobs).map((x) => {
      const j = obj(x);
      const lugar = str(obj(j.location).name);
      const oficinas = arr(j.offices).map((o) => str(obj(o).name)).filter(Boolean).join(", ");
      return crearVacante("greenhouse", {
        idExterno: `${token}/${str(j.id) ?? ""}`,
        titulo: str(j.title) ?? "",
        empresa: str(j.company_name) ?? nombreDeTablero(token),
        ubicacion: lugar,
        // Las empresas marcan «Remote» cuando lo es; una ubicación sin esa palabra es presencial.
        modalidad: modalidadDeTexto(lugar) ?? (lugar ? "presencial" : undefined),
        paises: paisesDeTexto(lugar, oficinas).paises,
        url: str(j.absolute_url) ?? "",
        ats: "greenhouse",
        descripcion: htmlATexto(decodificarEntidades(str(j.content) ?? "")),
        publicadaEn: fechaIso(str(j.first_published) ?? str(j.updated_at)),
        etiquetas: arr(j.departments).map((d) => str(obj(d).name)).filter((s): s is string => !!s),
      });
    }),
  );
}

export const greenhouse: FuenteVacantes = {
  info: INFO_FUENTES.greenhouse,
  buscar: (c: Consulta, ctx: ContextoFuente) =>
    porEmpresa("greenhouse", c, async (t) => mapearGreenhouse(await ctx.http.json(`https://boards-api.greenhouse.io/v1/boards/${t}/jobs?content=true`), t)),
};

// ---------------------------------------------------------------------------------------------------------------
// Lever — https://api.lever.co/v0/postings/{token}?mode=json

const MODALIDAD_LEVER: Record<string, Modalidad> = { remote: "remoto", hybrid: "hibrido", onsite: "presencial", "on-site": "presencial" };
const PERIODO_LEVER: Record<string, "hora" | "mes" | "año"> = { "per-hour-wage": "hora", "per-month-salary": "mes", "per-year-salary": "año" };

export function mapearLever(json: unknown, token: string): Vacante[] {
  return definidas(
    arr(json).map((x) => {
      const j = obj(x);
      const cat = obj(j.categories);
      const lugares = [str(cat.location), ...strs(cat.allLocations)].filter((s): s is string => !!s);
      const listas = arr(j.lists)
        .map((l) => `${str(obj(l).text) ?? ""}\n${htmlATexto(str(obj(l).content) ?? "")}`)
        .join("\n");
      const s = obj(j.salaryRange);
      const tipo = str(j.workplaceType)?.toLowerCase() ?? "";
      const pais = str(j.country);
      return crearVacante("lever", {
        idExterno: `${token}/${str(j.id) ?? ""}`,
        titulo: str(j.text) ?? "",
        empresa: nombreDeTablero(token),
        ubicacion: [...new Set(lugares)].join(" · ") || undefined,
        modalidad: MODALIDAD_LEVER[tipo] ?? modalidadDeTexto(lugares.join(" ")) ?? (lugares.length ? "presencial" : undefined),
        paises: [...new Set([...(pais && /^[A-Z]{2}$/.test(pais) && tipo !== "remote" ? [pais] : []), ...paisesDeTexto(lugares.join(", ")).paises])],
        url: str(j.hostedUrl) ?? "",
        urlPostular: str(j.applyUrl),
        ats: "lever",
        descripcion: [str(j.descriptionPlain), listas, str(j.additionalPlain)].filter(Boolean).join("\n\n").trim(),
        publicadaEn: fechaIso(num(j.createdAt)),
        salario: num(s.min) || num(s.max) ? { min: num(s.min), max: num(s.max), moneda: str(s.currency), periodo: PERIODO_LEVER[str(s.interval) ?? ""] } : undefined,
        etiquetas: [str(cat.team), str(cat.department), str(cat.commitment)].filter((e): e is string => !!e),
      });
    }),
  );
}

export const lever: FuenteVacantes = {
  info: INFO_FUENTES.lever,
  buscar: (c, ctx) => porEmpresa("lever", c, async (t) => mapearLever(await ctx.http.json(`https://api.lever.co/v0/postings/${t}?mode=json`), t)),
};

// ---------------------------------------------------------------------------------------------------------------
// Ashby — https://api.ashbyhq.com/posting-api/job-board/{token}?includeCompensation=true

export function mapearAshby(json: unknown, token: string): Vacante[] {
  return definidas(
    arr(obj(json).jobs)
      .filter((x) => obj(x).isListed !== false)
      .map((x) => {
        const j = obj(x);
        const lugar = str(j.location);
        const secundarias = arr(j.secondaryLocations).map((l) => str(obj(l).location)).filter(Boolean).join(", ");
        const tipo = str(j.workplaceType)?.toLowerCase();
        const modalidad: Modalidad | undefined =
          tipo === "remote" || j.isRemote === true ? "remoto" : tipo === "hybrid" ? "hibrido" : tipo === "onsite" ? "presencial" : (modalidadDeTexto(lugar) ?? (j.isRemote === false ? "presencial" : undefined));
        const comp = obj(j.compensation);
        return crearVacante("ashby", {
          idExterno: `${token}/${str(j.id) ?? ""}`,
          titulo: str(j.title) ?? "",
          empresa: nombreDeTablero(token),
          ubicacion: [lugar, secundarias].filter(Boolean).join(" · ") || undefined,
          modalidad,
          paises: paisesDeTexto(lugar, secundarias).paises,
          url: str(j.jobUrl) ?? "",
          urlPostular: str(j.applyUrl),
          ats: "ashby",
          descripcion: str(j.descriptionPlain) ?? htmlATexto(str(j.descriptionHtml) ?? ""),
          publicadaEn: fechaIso(str(j.publishedAt)),
          salario: salarioDeTexto(str(comp.scrapeableCompensationSalarySummary) ?? str(comp.compensationTierSummary)),
          etiquetas: [str(j.department), str(j.team), str(j.employmentType)].filter((e): e is string => !!e),
        });
      }),
  );
}

export const ashby: FuenteVacantes = {
  info: INFO_FUENTES.ashby,
  buscar: (c, ctx) => porEmpresa("ashby", c, async (t) => mapearAshby(await ctx.http.json(`https://api.ashbyhq.com/posting-api/job-board/${t}?includeCompensation=true`), t)),
};
