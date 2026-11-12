import type { PerfilJson } from "../perfil/estructurado";
import type { IdiomaDoc } from "./aMedida";
import { TITULOS, rangoFechas } from "./formato";

/**
 * CV a la medida en Word (.docx), con el mismo contenido y orden que el PDF: una columna, texto real y viñetas como
 * texto (sin listas numeradas), que es lo que mejor leen los sistemas de reclutamiento y lo que la persona puede
 * retocar en Word antes de subirlo.
 */

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const GRIS = "555555";

/** Texto seguro dentro de XML: escapa lo especial y quita caracteres de control que Word rechaza. */
export function xmlSeguro(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface OpcRun {
  negrita?: boolean;
  tam?: number;
  gris?: boolean;
}

function run(texto: string, { negrita, tam, gris }: OpcRun = {}): string {
  const props = [negrita ? "<w:b/>" : "", gris ? `<w:color w:val="${GRIS}"/>` : "", tam ? `<w:sz w:val="${Math.round(tam * 2)}"/>` : ""].join("");
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${xmlSeguro(texto)}</w:t></w:r>`;
}

interface OpcParrafo {
  antes?: number;
  despues?: number;
  linea?: boolean;
  sangria?: number;
}

function parrafo(runs: string, { antes = 0, despues = 2, linea, sangria }: OpcParrafo = {}): string {
  const props = [
    linea ? `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="BFBFBF"/></w:pBdr>` : "",
    `<w:spacing w:before="${antes * 20}" w:after="${despues * 20}"/>`,
    sangria ? `<w:ind w:left="${sangria}" w:hanging="200"/>` : "",
  ].join("");
  return `<w:p><w:pPr>${props}</w:pPr>${runs}</w:p>`;
}

const texto = (t: string | undefined, opc: OpcRun & OpcParrafo = {}) => (t?.trim() ? parrafo(run(t, opc), opc) : "");
const titulo = (t: string) => parrafo(run(t.toUpperCase(), { negrita: true, tam: 10.5 }), { antes: 10, despues: 3, linea: true });
const vineta = (t: string) => parrafo(run(`•  ${t}`), { sangria: 280, despues: 1 });

function cuerpo(cv: PerfilJson, idioma: IdiomaDoc): string {
  const t = TITULOS[idioma];
  const b = cv.basics;
  const ubicacion = [b.location?.city, b.location?.region, b.location?.countryCode].filter(Boolean).join(", ");
  const partes: string[] = [
    texto(b.name, { negrita: true, tam: 18, despues: 1 }),
    texto(b.label, { tam: 11, despues: 1 }),
    texto([b.email, b.phone, ubicacion, b.url, ...b.profiles.map((p) => p.url)].filter(Boolean).join("  ·  "), { tam: 9, gris: true }),
  ];
  if (b.summary) partes.push(titulo(t.resumen), texto(b.summary));
  if (cv.work.length) {
    partes.push(titulo(t.experiencia));
    for (const x of cv.work) {
      partes.push(texto([x.position, x.name].filter(Boolean).join(" — "), { negrita: true, antes: 4, despues: 0 }));
      partes.push(texto([rangoFechas(x.startDate, x.endDate, idioma), x.location].filter(Boolean).join(" · "), { tam: 9, gris: true }));
      partes.push(texto(x.summary));
      partes.push(...x.highlights.map(vineta));
    }
  }
  if (cv.education.length) {
    partes.push(titulo(t.educacion));
    for (const e of cv.education) partes.push(texto([[e.studyType, e.area].filter(Boolean).join(" "), e.institution, rangoFechas(e.startDate, e.endDate, idioma)].filter(Boolean).join(" — ")));
  }
  if (cv.skills.length) {
    partes.push(titulo(t.habilidades));
    for (const s of cv.skills) partes.push(parrafo(run(`${s.name}: `, { negrita: true }) + run(s.keywords.join(", "))));
  }
  if (cv.languages.length) partes.push(titulo(t.idiomas), texto(cv.languages.map((l) => [l.language, l.fluency].filter(Boolean).join(" — ")).join(" · ")));
  if (cv.certificates.length) {
    partes.push(titulo(t.certificaciones));
    for (const c of cv.certificates) partes.push(texto([c.name, c.issuer, c.date].filter(Boolean).join(" — ")));
  }
  if (cv.projects.length) {
    partes.push(titulo(t.proyectos));
    for (const p of cv.projects) partes.push(texto([p.name, p.description, p.url].filter(Boolean).join(" — ")));
  }
  // Carta (8.5×11"), márgenes de 0.75".
  const hoja = `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${partes.join("")}${hoja}</w:body></w:document>`;
}

const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:sz w:val="20"/><w:lang w:val="es-MX"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="40" w:line="252" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;

const TIPOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

function propiedades(nombre: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xmlSeguro(`${nombre || "CV"} - CV`)}</dc:title><dc:creator>${xmlSeguro(nombre || "EmpleaTech")}</dc:creator></cp:coreProperties>`;
}

/** El CV a la medida como archivo .docx (bytes listos para descargar o adjuntar). */
export async function cvADocx(cv: PerfilJson, idioma: IdiomaDoc): Promise<Uint8Array> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  // [Content_Types].xml va primero: algunos lectores lo esperan al inicio del paquete.
  zip.file("[Content_Types].xml", TIPOS);
  zip.file("_rels/.rels", RELS);
  zip.file("docProps/core.xml", propiedades(cv.basics.name));
  zip.file("word/document.xml", cuerpo(cv, idioma));
  zip.file("word/styles.xml", ESTILOS);
  zip.file("word/_rels/document.xml.rels", DOC_RELS);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

/**
 * Nombre de archivo para el CV: «Nombre - Puesto - Empresa.docx», sin acentos ni signos (algunos ATS los rechazan) y
 * corto para que quepa en cualquier sistema.
 */
export function nombreCvDocx(nombre: string, puesto?: string, empresa?: string): string {
  const base = [nombre || "CV", puesto, empresa]
    .filter(Boolean)
    .join(" - ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 .-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[ .-]+$/, "")
    .slice(0, 90)
    .trim();
  return `${base || "CV"}.docx`;
}
