import { prep } from "../analisis/texto";

export const LATAM = ["MX", "GT", "SV", "HN", "NI", "CR", "PA", "CU", "DO", "PR", "CO", "VE", "EC", "PE", "BO", "CL", "AR", "UY", "PY", "BR"];
const UE = ["DE", "FR", "ES", "IT", "PT", "NL", "BE", "LU", "IE", "AT", "DK", "SE", "FI", "PL", "CZ", "SK", "HU", "RO", "BG", "GR", "HR", "SI", "EE", "LV", "LT", "CY", "MT"];
const EUROPA = [...UE, "GB", "CH", "NO", "IS", "UA", "RS"];
const NORTEAMERICA = ["US", "CA", "MX"];
const APAC = ["AU", "NZ", "JP", "KR", "CN", "HK", "TW", "SG", "MY", "TH", "VN", "PH", "ID", "IN"];

const plegar = (s: string) => prep(s).folded.replace(/[^a-z0-9]+/g, " ").trim();

/** Códigos que Intl reconoce como región pero no son países vigentes (agrupaciones y códigos retirados). */
const NO_PAISES = new Set(["EU", "EZ", "UN", "QO", "XA", "XB", "ZZ", "AN", "BU", "CS", "DD", "DY", "FX", "HV", "NH", "NT", "RH", "SU", "TP", "UK", "VD", "YD", "YU", "ZR"]);

/** Nombre de país (plegado, en español e inglés) → ISO-2, a partir de los datos de Unicode que trae el propio runtime. */
const NOMBRES: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  const idiomas = ["en", "es"].map((l) => new Intl.DisplayNames([l], { type: "region", fallback: "none" }));
  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) {
      const codigo = String.fromCharCode(a, b);
      if (NO_PAISES.has(codigo)) continue;
      for (const dn of idiomas) {
        const nombre = dn.of(codigo);
        if (nombre && nombre !== codigo) out[plegar(nombre)] ??= codigo;
      }
    }
  }
  // Variantes comunes en las ofertas que no son el nombre oficial.
  const alias: Record<string, string> = {
    usa: "US", "u s a": "US", "u s": "US", eeuu: "US", "ee uu": "US", "united states of america": "US",
    uk: "GB", "great britain": "GB", england: "GB", scotland: "GB", wales: "GB", "reino unido": "GB",
    uae: "AE", holland: "NL", holanda: "NL", "czech republic": "CZ", "south korea": "KR", korea: "KR", russia: "RU",
    "republica dominicana": "DO", "dominican republic": "DO", brasil: "BR", "ciudad de mexico": "MX", cdmx: "MX", "mexico city": "MX",
  };
  return { ...out, ...alias };
})();

/**
 * Ciudades que las ofertas ponen sin el país («Seattle, San Francisco», «NYC», «Dublin»). Solo cuentan si la ubicación
 * no dice que es remota: «Remote (Berlin HQ)» no obliga a vivir en Berlín. Fuera las ambiguas (San José, Santiago,
 * León, Mérida, Cambridge…), que existen en más de un país.
 */
const CIUDADES: Record<string, string> = {
  "new york": "US", nyc: "US", "san francisco": "US", sf: "US", "bay area": "US", seattle: "US", boston: "US", chicago: "US",
  "los angeles": "US", denver: "US", atlanta: "US", miami: "US", dallas: "US", houston: "US", "palo alto": "US",
  "mountain view": "US", "salt lake city": "US", philadelphia: "US", pittsburgh: "US", "san diego": "US", raleigh: "US",
  toronto: "CA", vancouver: "CA", montreal: "CA", ottawa: "CA", calgary: "CA", waterloo: "CA",
  london: "GB", londres: "GB", manchester: "GB", edinburgh: "GB", dublin: "IE",
  berlin: "DE", munich: "DE", munchen: "DE", hamburg: "DE", frankfurt: "DE", amsterdam: "NL", paris: "FR",
  madrid: "ES", barcelona: "ES", lisbon: "PT", lisboa: "PT", warsaw: "PL", varsovia: "PL", krakow: "PL",
  bengaluru: "IN", bangalore: "IN", hyderabad: "IN", pune: "IN", chennai: "IN", mumbai: "IN", gurgaon: "IN", gurugram: "IN", noida: "IN",
  tokyo: "JP", sydney: "AU", melbourne: "AU", "sao paulo": "BR", "rio de janeiro": "BR", "buenos aires": "AR",
  bogota: "CO", medellin: "CO", montevideo: "UY", lima: "PE",
  guadalajara: "MX", monterrey: "MX", queretaro: "MX", puebla: "MX", tijuana: "MX", morelia: "MX", zapopan: "MX", cancun: "MX",
};

const REMOTO = /\b(remote|remoto|remota|anywhere|home office|teletrabajo)\b/;

/** Estados de EE. UU. escritos como «Austin, TX». */
const ESTADOS_EEUU = new Set(
  "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" "),
);

const REGIONES: [RegExp, string[]][] = [
  [/\b(latam|latinoamerica|latin america|america latina|south america|sudamerica|central america|centroamerica)\b/, LATAM],
  [/\b(european union|union europea|eu)\b/, UE],
  [/\b(europe|europa|emea)\b/, EUROPA],
  [/\b(north america|norteamerica)\b/, NORTEAMERICA],
  [/\bamericas\b/, [...NORTEAMERICA, ...LATAM]],
  [/\b(apac|asia pacific)\b/, APAC],
];

/** Sin restricción de país: la vacante acepta gente de cualquier lugar. */
const MUNDIAL = /\b(worldwide|anywhere|global|cualquier (lugar|pais)|en todo el mundo)\b/;

const CODIGOS = new Set(Object.values(NOMBRES));

/**
 * Países escritos en clave, como los ponen los tableros de las empresas: «US-REMOTE; US-CHICAGO; CA-TOR» o «US» solo.
 * Se leen del texto original (en mayúsculas): «us» en minúsculas es una palabra en inglés, y «, CA» es California.
 */
export function paisesEnClave(texto: string | undefined | null): string[] {
  if (!texto) return [];
  const out = new Set<string>();
  for (const m of texto.matchAll(/\b([A-Z]{2})-[A-Z]{2,}/g)) if (CODIGOS.has(m[1])) out.add(m[1]);
  if (/(^|[^A-Za-z])US([^A-Za-z]|$)/.test(texto)) out.add("US");
  return [...out].sort();
}

export interface PaisesDeTexto {
  paises: string[];
  mundial: boolean;
}

/** «Remote - LATAM», «Mexico, Colombia», «Austin, TX», «Belgrade, Serbia», «Worldwide» → códigos ISO-2. */
export function paisesDeTexto(...textos: (string | undefined | null)[]): PaisesDeTexto {
  const out = new Set<string>();
  let mundial = false;
  for (const t of textos) {
    if (!t) continue;
    const f = ` ${plegar(t)} `;
    if (MUNDIAL.test(f)) mundial = true;
    for (const [re, lista] of REGIONES) if (re.test(f)) lista.forEach((p) => out.add(p));
    // Frases de hasta 4 palabras: «el salvador», «united arab emirates», «papua new guinea».
    const palabras = f.trim().split(" ");
    for (let i = 0; i < palabras.length; i++) {
      for (let n = 4; n >= 1; n--) {
        const frase = palabras.slice(i, i + n).join(" ");
        if (NOMBRES[frase]) {
          out.add(NOMBRES[frase]);
          i += n - 1; // «papua new guinea» no debe contar también «guinea».
          break;
        }
      }
    }
    for (const m of t.matchAll(/,\s*([A-Z]{2})\b/g)) if (ESTADOS_EEUU.has(m[1])) out.add("US");
    for (const p of paisesEnClave(t)) out.add(p);
    if (!REMOTO.test(f)) {
      for (let i = 0; i < palabras.length; i++) {
        for (let n = 3; n >= 1; n--) {
          const ciudad = CIUDADES[palabras.slice(i, i + n).join(" ")];
          if (ciudad) {
            out.add(ciudad);
            i += n - 1;
            break;
          }
        }
      }
    }
  }
  return { paises: [...out].sort(), mundial: mundial && out.size === 0 };
}
