import { describe, expect, it } from "vitest";
import type { Consulta, ContextoFuente } from "@/core/vacantes/fuentes";
import { mapearArbeitnow, mapearGetOnBoard, mapearHimalayas, mapearJobicy, mapearRemoteOk, mapearRemotive } from "./agregadores";
import { mapearAdzuna, mapearJooble, mapearUsaJobs, paisAdzuna } from "./con-clave";
import { greenhouse, mapearAshby, mapearGreenhouse, mapearLever, tokensValidos } from "./empresas";

// Respuestas sintéticas con la misma forma que las APIs reales (verificada en vivo con vivo.test.ts).

describe("agregadores", () => {
  it("Get on Board: empresa expandida, modalidad, países y sueldo mensual en USD", () => {
    const [v] = mapearGetOnBoard({
      data: [
        {
          id: "backend-acme-cdmx-1",
          attributes: {
            title: "Backend Developer",
            description: "<p>Node.js y PostgreSQL</p>",
            functions: "<ul><li>Diseñar APIs</li></ul>",
            remote: true,
            remote_modality: "remote_local",
            countries: ["Mexico"],
            category_name: "Programming",
            min_salary: 3000,
            max_salary: 4000,
            published_at: 1790346313,
            company: { data: { attributes: { name: "Acme MX" } } },
          },
          links: { public_url: "https://www.getonbrd.com/jobs/backend-acme-cdmx-1" },
        },
      ],
    });
    expect(v).toMatchObject({
      id: "getonboard:backend-acme-cdmx-1",
      empresa: "Acme MX",
      modalidad: "remoto",
      paises: ["MX"],
      salario: { min: 3000, max: 4000, moneda: "USD", periodo: "mes" },
      url: "https://www.getonbrd.com/jobs/backend-acme-cdmx-1",
    });
    expect(v.descripcion).toBe("Node.js y PostgreSQL\n\n- Diseñar APIs");
  });

  it("Get on Board: «remoto solo local» toma el país de location_tenants cuando countries solo dice «Remote»", () => {
    const [v] = mapearGetOnBoard({
      data: [
        {
          id: "desarrollador-back-end-agilesoft-spa-remote-b90b",
          attributes: {
            title: "Desarrollador Back-end Java / Quarkus / Kafka",
            description: "<p>Java y Kafka</p>",
            remote: true,
            remote_modality: "remote_local",
            countries: ["Remote"],
            location_tenants: { data: [{ id: "dominican_republic", type: "country", attributes: { name: "Dominican Republic" } }] },
            company: { data: { attributes: { name: "Agilesoft SpA" } } },
          },
          links: { public_url: "https://www.getonbrd.com/jobs/desarrollador-back-end-agilesoft-spa-remote-b90b" },
        },
      ],
    });
    expect(v).toMatchObject({ modalidad: "remoto", paises: ["DO"], ubicacion: "Remote, Dominican Republic" });
  });

  it("Remotive: remoto, países del texto libre y salario en texto", () => {
    const [v] = mapearRemotive({
      "0-legal-notice": "…",
      jobs: [{ id: 7, url: "https://remotive.com/remote-jobs/x-7", title: "Data Analyst", company_name: "Acme", category: "Data", tags: ["sql"], candidate_required_location: "LATAM", salary: "$40k - $60k", description: "<p>SQL</p>", publication_date: "2026-09-21T12:55:11" }],
    });
    expect(v).toMatchObject({ id: "remotive:7", modalidad: "remoto", salario: { min: 40000, max: 60000, moneda: "USD", periodo: "año" }, etiquetas: ["Data", "sql"] });
    expect(v.paises).toContain("MX");
  });

  it("Remote OK: ignora el aviso legal y toma el salario anual", () => {
    const vs = mapearRemoteOk([
      { legal: "API Terms of Service…" },
      { id: "9", position: "Frontend Engineer", company: "Bjak ", location: "Worldwide", url: "https://remoteOK.com/remote-jobs/9", apply_url: "https://remoteOK.com/remote-jobs/9", salary_min: 0, salary_max: 0, tags: ["react"], description: "<p>React</p>", date: "2026-09-23T00:00:04+00:00" },
    ]);
    expect(vs).toHaveLength(1);
    expect(vs[0]).toMatchObject({ empresa: "Bjak", paises: [], etiquetas: ["react"] });
    expect(vs[0].salario).toBeUndefined();
  });

  it("Jobicy y Himalayas: región LATAM y restricciones por país", () => {
    const [j] = mapearJobicy({ jobs: [{ id: 1, url: "https://jobicy.com/jobs/1", jobTitle: "Node Dev", companyName: "Airtm", jobGeo: "LATAM", jobIndustry: ["Software"], jobType: ["Full-Time"], jobDescription: "<p>x</p>", pubDate: "2026-09-20T11:23:33+00:00" }] });
    expect(j.paises).toContain("CO");
    const [h] = mapearHimalayas({ jobs: [{ guid: "https://himalayas.app/companies/a/jobs/b", title: "Dev", companyName: "A", locationRestrictions: ["Mexico", "Brazil"], minSalary: 50000, maxSalary: 70000, currency: "USD", salaryPeriod: "annual", categories: ["Software-Engineering"], description: "<p>x</p>", pubDate: 1790610628, applicationLink: "https://himalayas.app/companies/a/jobs/b" }] });
    expect(h).toMatchObject({ paises: ["BR", "MX"], salario: { min: 50000, max: 70000, moneda: "USD", periodo: "año" }, etiquetas: ["Software Engineering"] });
  });

  it("Arbeitnow: presencial en Alemania salvo que sea remota", () => {
    const [p, r] = mapearArbeitnow({
      data: [
        { slug: "a-1", title: "Software Engineer", company_name: "Preiswecker", remote: false, location: "Berlin", url: "https://www.arbeitnow.com/jobs/a-1", description: "<p>x</p>", tags: [], job_types: ["Full-time"], created_at: 1786516800 },
        { slug: "b-2", title: "Backend", company_name: "B", remote: true, location: "Hamburg", url: "https://www.arbeitnow.com/jobs/b-2", description: "", tags: [], job_types: [], created_at: 1786516800 },
      ],
    });
    expect(p).toMatchObject({ modalidad: "presencial", paises: ["DE"] });
    expect(r).toMatchObject({ modalidad: "remoto", paises: [] });
  });
});

describe("tableros de empresas", () => {
  it("Greenhouse: HTML escapado, ATS y ubicación", () => {
    const [v] = mapearGreenhouse(
      { jobs: [{ id: 855, title: "AI Engineer", company_name: "GitLab", absolute_url: "https://job-boards.greenhouse.io/gitlab/jobs/855", location: { name: "Remote, Americas" }, offices: [{ name: "Mexico" }], content: "&lt;p&gt;Python &amp;amp; Go&lt;/p&gt;", first_published: "2026-05-22T09:16:29-04:00", departments: [{ name: "Engineering" }] }] },
      "gitlab",
    );
    expect(v).toMatchObject({ id: "greenhouse:gitlab/855", ats: "greenhouse", modalidad: "remoto", descripcion: "Python & Go", etiquetas: ["Engineering"] });
    expect(v.paises).toContain("MX");
  });

  it("Lever: listas, salario y país solo si no es remota", () => {
    const [v] = mapearLever(
      [{ id: "abc", text: "Account Manager", categories: { location: "Remote", team: "Sales", commitment: "Full-time" }, country: "US", workplaceType: "remote", descriptionPlain: "Hola", lists: [{ text: "Requisitos:", content: "<li>SaaS</li>" }], hostedUrl: "https://jobs.lever.co/acme/abc", applyUrl: "https://jobs.lever.co/acme/abc/apply", createdAt: 1565990241800, salaryRange: { min: 85000, max: 175000, currency: "USD", interval: "per-year-salary" } }],
      "acme-labs",
    );
    expect(v).toMatchObject({ empresa: "Acme Labs", modalidad: "remoto", paises: [], ats: "lever", salario: { min: 85000, max: 175000, moneda: "USD", periodo: "año" } });
    expect(v.descripcion).toContain("- SaaS");
  });

  it("Ashby: modalidad, países secundarios, salario resumido y oculta las no listadas", () => {
    const vs = mapearAshby(
      {
        jobs: [
          { id: "1", title: "EM", location: "Remote - European Union", secondaryLocations: [{ location: "Spain" }], isRemote: true, workplaceType: "Remote", jobUrl: "https://jobs.ashbyhq.com/acme/1", applyUrl: "https://jobs.ashbyhq.com/acme/1/application", descriptionPlain: "Lead", publishedAt: "2024-03-04T14:29:08.532+00:00", compensation: { scrapeableCompensationSalarySummary: "€110K - €185K" }, department: "Engineering" },
          { id: "2", title: "Oculta", isListed: false, jobUrl: "https://jobs.ashbyhq.com/acme/2" },
        ],
      },
      "acme",
    );
    expect(vs).toHaveLength(1);
    expect(vs[0]).toMatchObject({ modalidad: "remoto", salario: { min: 110000, max: 185000, moneda: "EUR" }, ats: "ashby" });
    expect(vs[0].paises).toContain("ES");
  });

  it("solo acepta identificadores de tablero seguros y consulta cada empresa por separado", async () => {
    expect(tokensValidos(["gitlab", "../admin", "a b", "GitLab", "wizeline"])).toEqual(["gitlab", "wizeline"]);
    const urls: string[] = [];
    const ctx: ContextoFuente = {
      http: { json: async (u) => (urls.push(u), u.includes("rota") ? Promise.reject(new Error("respondió 404")) : { jobs: [] }) },
      claves: {},
      ahora: new Date(),
    };
    const c: Consulta = { palabras: [], soloRemoto: false, paises: [], empresas: { greenhouse: ["rota", "gitlab"] }, maxPorFuente: 10 };
    await expect(greenhouse.buscar(c, ctx)).resolves.toEqual([]);
    expect(urls).toEqual(["https://boards-api.greenhouse.io/v1/boards/rota/jobs?content=true", "https://boards-api.greenhouse.io/v1/boards/gitlab/jobs?content=true"]);
  });
});

describe("fuentes con clave", () => {
  it("Adzuna: país según la consulta", () => {
    expect(paisAdzuna({ palabras: [], soloRemoto: false, paises: ["CO", "MX"], empresas: {}, maxPorFuente: 1 })).toBe("mx");
    const [v] = mapearAdzuna({ results: [{ id: "5", title: "<strong>Backend</strong> Dev", company: { display_name: "Acme" }, location: { display_name: "Ciudad de México" }, redirect_url: "https://www.adzuna.com.mx/details/5", description: "Trabajo remoto", created: "2026-09-20T00:00:00Z", salary_min: 400000, salary_max: 500000 }] }, "mx");
    expect(v).toMatchObject({ titulo: "Backend Dev", paises: ["MX"], modalidad: "remoto", salario: { min: 400000, max: 500000, periodo: "año" } });
  });

  it("Jooble y USAJOBS", () => {
    const [j] = mapearJooble({ jobs: [{ id: 1, title: "Dev", company: "A", location: "Bogotá, Colombia", link: "https://jooble.org/desc/1", snippet: "<b>Node</b>", updated: "2026-09-20T00:00:00", salary: "COP 5,000,000 mensual", type: "Full-time" }] });
    expect(j).toMatchObject({ paises: ["CO"], salario: { min: 5000000, moneda: "COP", periodo: "mes" } });
    const [u] = mapearUsaJobs({
      SearchResult: { SearchResultItems: [{ MatchedObjectDescriptor: { PositionID: "X-1", PositionTitle: "IT Specialist", OrganizationName: "NASA", PositionLocationDisplay: "Houston, Texas", PositionURI: "https://www.usajobs.gov/job/1", ApplyURI: ["https://www.usajobs.gov/job/1/apply"], PublicationStartDate: "2026-09-01", PositionRemuneration: [{ MinimumRange: "90000", MaximumRange: "120000", RateIntervalCode: "PA" }], UserArea: { Details: { JobSummary: "Resumen" } } } }] },
    });
    expect(u).toMatchObject({ empresa: "NASA", paises: ["US"], modalidad: "presencial", salario: { min: 90000, max: 120000, moneda: "USD", periodo: "año" } });
  });
});

describe("modalidad en tableros de empresas (datos reales)", () => {
  it("sin la palabra «Remote» la vacante es presencial", () => {
    const [g] = mapearGreenhouse({ jobs: [{ id: 1, title: "Software Engineer - Backend", absolute_url: "https://job-boards.greenhouse.io/d/jobs/1", location: { name: "Belgrade, Serbia" }, content: "" }] }, "d");
    expect(g).toMatchObject({ modalidad: "presencial", paises: ["RS"] });
    const [a] = mapearAshby({ jobs: [{ id: "1", title: "Backend Engineer", location: "New York, NY (HQ)", isRemote: false, jobUrl: "https://jobs.ashbyhq.com/ramp/1", descriptionPlain: "" }] }, "ramp");
    expect(a).toMatchObject({ modalidad: "presencial", paises: ["US"] });
  });
});
