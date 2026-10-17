export interface Prepared {
  /** Texto original normalizado a NFC (para citar evidencia). */
  orig: string;
  /** Minúsculas sin acentos, con la MISMA longitud que `orig` (índices alineados). */
  folded: string;
}

function foldChar(c: string): string {
  const base = c.normalize("NFD")[0] ?? c;
  const lower = base.toLowerCase();
  return lower.length === 1 ? lower : c;
}

export function prep(text: string): Prepared {
  const orig = text.normalize("NFC");
  let folded = "";
  for (let i = 0; i < orig.length; i++) folded += foldChar(orig[i]);
  return { orig, folded };
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function wordCount(text: string): number {
  return (text.match(/[\p{L}\p{N}]+/gu) ?? []).length;
}

const ES_WORDS = new Set(
  "de la el en y con para los las del una por que se un es al lo como mas su nos sus experiencia trabajo equipo empresa buscamos requisitos años anos puesto".split(" "),
);
const EN_WORDS = new Set(
  "the and of to with for in is are you we our will be on as an or this that experience work team company looking requirements years role".split(" "),
);

export type Idioma = "es" | "en" | "mixto";

function contarIdioma(folded: string): { es: number; en: number } {
  let es = 0;
  let en = 0;
  for (const w of folded.match(/[a-z]+/g) ?? []) {
    if (ES_WORDS.has(w)) es++;
    if (EN_WORDS.has(w)) en++;
  }
  return { es, en };
}

export function detectarIdioma(folded: string): Idioma {
  const { es, en } = contarIdioma(folded);
  if (es + en < 8) return "mixto";
  if (es > en * 1.25) return "es";
  if (en > es * 1.25) return "en";
  return "mixto";
}

/**
 * ¿Una frase suelta está escrita en el otro idioma? detectarIdioma pide varias palabras para opinar; una frase corta
 * de un CV («Diseñé una API en Node.js») basta con que se incline al otro idioma para no pegarla sin traducir.
 */
export function enOtroIdioma(texto: string, idioma: "es" | "en"): boolean {
  const { es, en } = contarIdioma(prep(texto).folded);
  return idioma === "en" ? es > en : en > es;
}

export function recortar(s: string, max = 160): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

const ENTIDADES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘",
  rdquo: "”", ldquo: "“", bull: "•", middot: "·", aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Ntilde: "Ñ", uuml: "ü", euro: "€", copy: "©", reg: "®",
};

/**
 * Quita etiquetas HTML/XML hasta que no quede ninguna. Una sola pasada no basta: en «<<b>script>», quitar «<b>» arma
 * un «<script>» nuevo.
 */
export function sinEtiquetas(s: string): string {
  let antes: string;
  do {
    antes = s;
    s = s.replace(/<[^<>]*>/g, "");
  } while (s !== antes);
  return s;
}

/** Entidades de HTML/XML a texto («&amp;», «&#233;», «&#x2014;»); las desconocidas se quedan como vienen. */
export function decodificarEntidades(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] !== "#") return ENTIDADES[e] ?? ENTIDADES[e.toLowerCase()] ?? m;
    const cp = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
  });
}
