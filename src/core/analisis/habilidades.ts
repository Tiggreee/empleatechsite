import { escapeRegex } from "./texto";

export type Categoria =
  | "lenguaje"
  | "frontend"
  | "backend"
  | "datos"
  | "cloud"
  | "devops"
  | "ia"
  | "practica"
  | "negocio"
  | "blanda"
  | "idioma";

export interface Skill {
  id: string;
  label: string;
  cat: Categoria;
  /** Alias en minúsculas y sin acentos; se busca por palabra completa. */
  aliases: string[];
  /** Fuentes de regex sobre texto plegado (minúsculas, sin acentos). */
  re?: string[];
  /** Fuentes de regex sensibles a mayúsculas, sobre el texto original. */
  cs?: string[];
  /** Habilidades de la misma familia dan crédito parcial (transferible). */
  family?: string;
}

const s = (
  id: string,
  label: string,
  cat: Categoria,
  aliases: string[],
  extra: Partial<Pick<Skill, "re" | "cs" | "family">> = {},
): Skill => ({ id, label, cat, aliases, ...extra });

export const SKILLS: Skill[] = [
  // Lenguajes
  s("python", "Python", "lenguaje", ["python", "python3"]),
  s("javascript", "JavaScript", "lenguaje", ["javascript", "ecmascript", "es6"], { re: ["(?<![.])js"], family: "js" }),
  s("typescript", "TypeScript", "lenguaje", ["typescript"], { family: "js" }),
  s("java", "Java", "lenguaje", ["java"], { family: "jvm" }),
  s("csharp", "C#", "lenguaje", ["c#", "csharp", "c sharp"]),
  s("dotnet", ".NET", "backend", [".net", "dotnet", "asp.net"]),
  s("cpp", "C++", "lenguaje", ["c++", "cpp"]),
  s("go", "Go", "lenguaje", ["golang"], {
    cs: ["(?<![A-Za-z0-9+#])Go(?![A-Za-z0-9+#])(?![-\\s]+(?:to|ahead|live|back|through|beyond|above|forward|further|the|market)\\b)"],
  }),
  s("rust", "Rust", "lenguaje", ["rust"]),
  s("php", "PHP", "lenguaje", ["php"]),
  s("ruby", "Ruby", "lenguaje", ["ruby"]),
  s("swift", "Swift", "lenguaje", ["swift", "swiftui"]),
  s("kotlin", "Kotlin", "lenguaje", ["kotlin"], { family: "jvm" }),
  s("scala", "Scala", "lenguaje", ["scala"], { family: "jvm" }),
  // «C» suelta es ambigua («Series C», «C-level», «English C2»): solo cuenta con contexto de lenguaje.
  s("c", "C", "lenguaje", [], {
    cs: [
      "(?<![A-Za-z0-9+#./-])C(?=\\s+(?:language|programming|lenguaje)\\b)",
      "(?<=\\b(?:[Ll]enguaje|[Ll]anguage|[Ii]n|[Ee]n)\\s)C(?![A-Za-z0-9+#/'’-]|\\.[A-Za-z0-9])",
      "(?<![A-Za-z0-9+#./-])C(?=\\s*(?:\\/|,|and|or|y|o)\\s*(?:C\\+\\+|C#|Rust|Go|Assembly)(?![A-Za-z]))",
      "(?<=(?:C\\+\\+|C#)\\s*(?:\\/|,|and|or|y|o)\\s*)C(?![A-Za-z0-9+#/'’-]|\\.[A-Za-z0-9])",
    ],
  }),
  s("haskell", "Haskell", "lenguaje", ["haskell"]),
  s("elixir", "Elixir", "lenguaje", ["elixir"], { family: "beam" }),
  s("erlang", "Erlang", "lenguaje", ["erlang"], { family: "beam" }),
  s("clojure", "Clojure", "lenguaje", ["clojure"]),
  s("ocaml", "OCaml", "lenguaje", ["ocaml"]),
  s("fsharp", "F#", "lenguaje", ["f#", "fsharp"]),
  s("perl", "Perl", "lenguaje", ["perl"]),
  s("cobol", "COBOL", "lenguaje", ["cobol"]),
  s("sql", "SQL", "datos", ["sql", "t-sql", "pl/sql", "plsql"], { family: "sql" }),
  s("bash", "Bash / Shell", "lenguaje", ["bash", "shell scripting", "shell script", "powershell"]),
  s("html", "HTML", "frontend", ["html", "html5"]),
  s("css", "CSS", "frontend", ["css", "css3", "scss", "sass"]),

  // Frontend
  s("react", "React", "frontend", [], { re: ["react(?:\\.?js)?(?![\\s-]+native)"], family: "jsfw" }),
  s("reactnative", "React Native", "frontend", ["react native", "react-native"], { family: "jsfw" }),
  // Móvil nativo y multiplataforma: comunes en proyectos freelance.
  s("android", "Android", "frontend", ["android", "android studio", "android sdk"], { family: "movil" }),
  s("ios", "iOS", "frontend", ["ios", "iphone", "ipad", "xcode"], { family: "movil" }),
  s("flutter", "Flutter", "frontend", ["flutter", "dart"], { family: "movil" }),
  s("nextjs", "Next.js", "frontend", ["next.js", "nextjs", "next js"], { family: "jsfw" }),
  s("vue", "Vue", "frontend", ["vue", "vuejs", "vue.js", "nuxt"], { family: "jsfw" }),
  s("angular", "Angular", "frontend", ["angular", "angularjs"], { family: "jsfw" }),
  s("svelte", "Svelte", "frontend", ["svelte", "sveltekit"], { family: "jsfw" }),
  s("tailwind", "Tailwind CSS", "frontend", ["tailwind", "tailwindcss"]),
  s("uxui", "UX/UI", "practica", ["ux", "ui", "ux/ui", "ui/ux", "user experience", "experiencia de usuario", "diseno de interfaces"]),
  s("figma", "Figma", "practica", ["figma"]),

  // Backend
  s("nodejs", "Node.js", "backend", ["node.js", "nodejs", "node"], { family: "nodefw" }),
  s("express", "Express", "backend", ["express.js", "expressjs"], { family: "nodefw" }),
  s("nestjs", "NestJS", "backend", ["nestjs", "nest.js"], { family: "nodefw" }),
  s("django", "Django", "backend", ["django"], { family: "pyweb" }),
  s("flask", "Flask", "backend", ["flask"], { family: "pyweb" }),
  s("fastapi", "FastAPI", "backend", ["fastapi"], { family: "pyweb" }),
  s("spring", "Spring", "backend", ["spring boot", "spring framework", "spring"], { family: "jvm" }),
  s("laravel", "Laravel", "backend", ["laravel"]),
  s("rails", "Ruby on Rails", "backend", ["ruby on rails", "rails"]),
  s("rest", "REST / APIs", "backend", ["rest api", "rest apis", "restful", "apis", "api rest", "web services", "servicios web"], {
    cs: ["(?<![A-Za-z0-9])REST(?![A-Za-z0-9])"],
  }),
  s("graphql", "GraphQL", "backend", ["graphql"]),
  s("microservicios", "Microservicios", "backend", ["microservices", "microservicios", "microservicio", "microservice"]),
  s("oauth", "Auth (OAuth/JWT)", "backend", ["oauth", "oauth2", "jwt", "sso", "openid"]),

  // Datos
  s("postgres", "PostgreSQL", "datos", ["postgresql", "postgres"], { family: "sql" }),
  s("mysql", "MySQL", "datos", ["mysql", "mariadb"], { family: "sql" }),
  s("sqlserver", "SQL Server", "datos", ["sql server", "mssql"], { family: "sql" }),
  s("oracle-db", "Oracle Database", "datos", ["oracle database", "oracle db", "oracle sql"], { family: "sql" }),
  s("mongodb", "MongoDB", "datos", ["mongodb", "mongo"], { family: "nosql" }),
  s("redis", "Redis", "datos", ["redis"], { family: "nosql" }),
  s("elasticsearch", "Elasticsearch", "datos", ["elasticsearch", "opensearch"], { family: "nosql" }),
  s("kafka", "Kafka", "datos", ["kafka", "rabbitmq"]),
  s("spark", "Spark", "datos", ["apache spark", "pyspark"], { cs: ["(?<![A-Za-z0-9])Spark(?![A-Za-z0-9])"] }),
  s("airflow", "Airflow", "datos", ["airflow", "dbt"]),
  s("etl", "ETL / Pipelines", "datos", ["etl", "elt", "data pipeline", "data pipelines", "pipelines de datos"]),
  s("pandas", "Pandas", "datos", ["pandas", "numpy"]),
  s("powerbi", "Power BI", "datos", ["power bi", "powerbi"], { family: "bi" }),
  s("tableau", "Tableau", "datos", ["tableau"], { family: "bi" }),
  s("looker", "Looker", "datos", ["looker", "looker studio", "metabase"], { family: "bi" }),
  s("excel", "Excel", "datos", ["excel", "hojas de calculo", "spreadsheets", "google sheets", "tablas dinamicas", "pivot tables", "buscarv", "vlookup"]),

  // Cloud y DevOps
  s("aws", "AWS", "cloud", ["aws", "amazon web services"], { family: "cloud" }),
  s("gcp", "Google Cloud", "cloud", ["gcp", "google cloud"], { family: "cloud" }),
  s("azure", "Azure", "cloud", ["azure"], { family: "cloud" }),
  s("oci", "Oracle Cloud (OCI)", "cloud", ["oracle cloud", "oracle cloud infrastructure", "oci"], { family: "cloud" }),
  s("docker", "Docker", "devops", ["docker", "contenedores", "containers"], { family: "containers" }),
  s("kubernetes", "Kubernetes", "devops", ["kubernetes", "k8s"], { family: "containers" }),
  s("terraform", "Terraform", "devops", ["terraform", "ansible", "infrastructure as code", "infraestructura como codigo", "iac"]),
  s("cicd", "CI/CD", "devops", ["ci/cd", "ci cd", "cicd", "integracion continua", "continuous integration", "github actions", "gitlab ci", "jenkins"]),
  s("git", "Git", "devops", ["git", "github", "gitlab", "bitbucket"]),
  s("linux", "Linux", "devops", ["linux", "unix"]),
  s("observabilidad", "Observabilidad", "devops", ["observability", "observabilidad", "prometheus", "grafana", "datadog", "sentry"]),

  // IA
  s("ml", "Machine Learning", "ia", ["machine learning", "aprendizaje automatico", "aprendizaje de maquina", "ml", "scikit-learn", "sklearn"], { family: "ai" }),
  s("dl", "Deep Learning", "ia", ["deep learning", "aprendizaje profundo", "redes neuronales", "neural networks"], { family: "ai" }),
  s("pytorch", "PyTorch / TensorFlow", "ia", ["pytorch", "tensorflow", "keras"], { family: "ai" }),
  s("llm", "LLMs / IA generativa", "ia", ["llm", "llms", "large language model", "large language models", "modelos de lenguaje", "ia generativa", "generative ai", "genai", "langchain", "prompt engineering"], {
    cs: ["(?<![A-Za-z0-9])RAG(?![A-Za-z0-9])"],
    family: "ai",
  }),
  s("nlp", "NLP", "ia", ["nlp", "procesamiento de lenguaje natural", "natural language processing"], { family: "ai" }),

  // Prácticas
  s("testing", "Testing", "practica", ["testing", "pruebas unitarias", "pruebas automatizadas", "unit test", "unit tests", "unit testing", "tdd", "qa"], { family: "test" }),
  s("jest", "Jest / Vitest", "practica", ["jest", "vitest", "mocha"], { family: "test" }),
  s("e2e", "Cypress / Playwright", "practica", ["cypress", "playwright", "selenium"], { family: "test" }),
  s("agile", "Agile / Scrum", "practica", ["agile", "scrum", "kanban", "metodologias agiles", "metodologia agil", "sprints"]),
  s("jira", "Jira", "practica", ["jira", "confluence"]),
  s("seguridad", "Seguridad", "practica", ["ciberseguridad", "cybersecurity", "owasp", "seguridad informatica", "application security"]),
  s("office", "Paquetería Office", "practica", ["paqueteria office", "microsoft office", "ms office", "office 365", "microsoft 365", "powerpoint", "microsoft word", "ms word", "google workspace"]),
  s("soporte", "Soporte técnico / mesa de ayuda", "devops", ["soporte tecnico", "mesa de ayuda", "help desk", "helpdesk", "service desk", "soporte ti", "it support"]),
  s("networking", "Redes (LAN/WAN)", "devops", ["ccna", "cisco", "redes lan", "lan/wan", "tcp/ip", "redes de computo", "redes de computadoras", "computer networking"]),
  s("manejo", "Licencia de manejo", "practica", ["licencia de manejo", "licencia de conducir", "driver's license", "drivers license", "driving license"]),

  // Negocio
  s("crm", "CRM", "negocio", ["crm"], { family: "crm" }),
  s("salesforce", "Salesforce", "negocio", ["salesforce"], { family: "crm" }),
  s("hubspot", "HubSpot", "negocio", ["hubspot", "zoho"], { family: "crm" }),
  // ERP y sistemas contables: CONTPAQi y Aspel son los más pedidos en México; entre sí dan crédito transferible.
  s("sap", "SAP", "negocio", ["sap", "erp"], { family: "erp" }),
  s("contpaqi", "CONTPAQi", "negocio", ["contpaqi", "contpaq", "contpaq i"], { family: "erp" }),
  s("aspel", "Aspel", "negocio", ["aspel", "aspel coi", "aspel noi", "aspel sae"], { family: "erp" }),
  s("odoo", "Odoo / NetSuite / Dynamics", "negocio", ["odoo", "netsuite", "microsoft dynamics", "dynamics 365"], { family: "erp" }),
  s("facturacion", "Facturación electrónica (CFDI)", "negocio", ["facturacion electronica", "facturacion", "cfdi", "e-invoicing", "electronic invoicing"]),
  s("nomina", "Nómina", "negocio", ["nomina", "nominas", "calculo de nomina", "payroll"]),
  s("imss", "IMSS / INFONAVIT", "negocio", ["imss", "infonavit", "idse", "seguridad social"]),
  s("fiscal", "Impuestos y cumplimiento fiscal", "negocio", ["impuestos", "declaraciones fiscales", "declaraciones anuales", "contabilidad fiscal", "tax compliance", "taxation"]),
  s("rrhh", "Reclutamiento / RR. HH.", "negocio", ["reclutamiento", "reclutamiento y seleccion", "recruiting", "recruitment", "talent acquisition", "recursos humanos", "human resources", "rrhh", "rr.hh."]),
  s("logistica", "Logística e inventarios", "negocio", ["logistica", "logistics", "inventarios", "inventory management", "cadena de suministro", "supply chain", "almacen", "warehouse"]),
  s("comex", "Comercio exterior / aduanas", "negocio", ["comercio exterior", "comercio internacional", "aduanas", "pedimentos", "importaciones", "exportaciones", "customs"]),
  s("redes-sociales", "Redes sociales", "negocio", ["redes sociales", "social media", "community manager", "community management"]),
  s("cobranza", "Cobranza", "negocio", ["cobranza", "gestion de cobranza", "debt collection"]),
  s("seo", "SEO", "negocio", ["seo"]),
  s("sem", "Publicidad digital", "negocio", ["sem", "google ads", "meta ads", "ppc", "publicidad digital", "paid media"]),
  s("analytics", "Analítica web", "negocio", ["google analytics", "ga4", "mixpanel", "amplitude"]),
  s("marketing", "Marketing", "negocio", ["marketing digital", "digital marketing", "content marketing", "marketing de contenidos", "email marketing"]),
  s("ventas", "Ventas", "negocio", ["ventas", "sales", "prospeccion", "prospecting", "cierre de ventas"]),
  s("cliente", "Atención al cliente", "negocio", ["atencion al cliente", "atencion a clientes", "customer service", "customer support", "soporte al cliente", "servicio al cliente", "servicio a clientes", "call center", "contact center", "centro de contacto"]),
  s("finanzas", "Finanzas / Contabilidad", "negocio", ["contabilidad", "accounting", "finanzas", "finance", "tesoreria"]),
  s("proyectos", "Gestión de proyectos", "negocio", ["gestion de proyectos", "project management", "pmp", "administracion de proyectos"]),
  s("producto", "Gestión de producto", "negocio", ["product management", "gestion de producto", "product owner", "roadmap"]),

  // Blandas
  s("liderazgo", "Liderazgo", "blanda", ["liderazgo", "leadership", "liderar equipos", "team lead", "lead a team", "lideraste", "liderando", "manejo de personal", "manejo de equipos", "gestion de equipos"]),
  s("comunicacion", "Comunicación", "blanda", ["comunicacion", "communication", "comunicacion efectiva", "communication skills"]),
  s("equipo", "Trabajo en equipo", "blanda", ["trabajo en equipo", "teamwork", "collaboration", "colaboracion", "collaborative"]),
  s("problemas", "Resolución de problemas", "blanda", ["resolucion de problemas", "problem solving", "problem-solving"]),
  s("analitico", "Pensamiento analítico", "blanda", ["pensamiento analitico", "analytical thinking", "analytical skills", "capacidad analitica"]),
  s("negociacion", "Negociación", "blanda", ["negociacion", "negotiation"]),

  // Idiomas
  // En ofertas de México, «bilingüe» casi siempre significa español-inglés; las certificaciones cuentan como evidencia.
  s("ingles", "Inglés", "idioma", ["ingles", "english", "bilingue", "toefl", "ielts"]),
  s("espanol", "Español", "idioma", ["espanol", "spanish", "castellano"]),
  s("portugues", "Portugués", "idioma", ["portugues", "portuguese"]),
];

export interface CompiledSkill {
  skill: Skill;
  folded: RegExp | null;
  cs: RegExp | null;
}

const cache = new Map<string, CompiledSkill>();

function aliasSource(a: string): string {
  return escapeRegex(a).replace(/ /g, "[\\s-]+");
}

export function compileSkill(skill: Skill): CompiledSkill {
  const hit = cache.get(skill.id);
  if (hit) return hit;
  const alts = [...skill.aliases.map(aliasSource), ...(skill.re ?? [])];
  const folded = alts.length
    ? new RegExp(`(?<![a-z0-9+#])(?:${alts.join("|")})(?![a-z0-9+#])`, "g")
    : null;
  const cs = skill.cs?.length ? new RegExp(`(?:${skill.cs.join("|")})`, "g") : null;
  const compiled = { skill, folded, cs };
  cache.set(skill.id, compiled);
  return compiled;
}

/** Devuelve las posiciones de cada mención de la habilidad. */
export function findMentions(folded: string, orig: string, skill: Skill): number[] {
  const c = compileSkill(skill);
  const out: number[] = [];
  if (c.folded) for (const m of folded.matchAll(c.folded)) out.push(m.index ?? 0);
  if (c.cs) for (const m of orig.matchAll(c.cs)) out.push(m.index ?? 0);
  return out.sort((a, b) => a - b);
}
