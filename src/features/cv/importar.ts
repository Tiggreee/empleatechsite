import { decodificarEntidades, sinEtiquetas } from "@/core/analisis/texto";
import { limpiarTextoCv, lineasDesdeFragmentos, type FragmentoPdf } from "@/core/perfil/limpiar";

export const MAX_BYTES = 5 * 1024 * 1024;
const MAX_PAGINAS = 15;
const MIN_TEXTO_UTIL = 50;

export type FormatoCv = "pdf" | "docx" | "odt" | "texto";

export interface CvExtraido {
  texto: string;
  formato: FormatoCv;
  paginas?: number;
  avisos: string[];
}

export class ErrorImportacion extends Error {}

function empieza(bytes: Uint8Array, firma: number[]): boolean {
  return firma.every((b, i) => bytes[i] === b);
}

/** Decide el formato por el contenido real, no solo por la extensión. */
export function detectarFormato(nombre: string, cabecera: Uint8Array): FormatoCv {
  const ext = nombre.includes(".") ? (nombre.toLowerCase().split(".").pop() ?? "") : "";
  if (empieza(cabecera, [0x25, 0x50, 0x44, 0x46])) return "pdf";
  if (empieza(cabecera, [0x50, 0x4b, 0x03, 0x04])) {
    if (ext === "docx") return "docx";
    if (ext === "odt") return "odt";
    throw new ErrorImportacion("Ese archivo comprimido no es un CV en .docx ni .odt.");
  }
  if (empieza(cabecera, [0xd0, 0xcf, 0x11, 0xe0])) {
    throw new ErrorImportacion("Los .doc antiguos no se pueden leer. Guárdalo como .docx o PDF y vuelve a intentarlo.");
  }
  if (["txt", "md", "text", ""].includes(ext)) return "texto";
  throw new ErrorImportacion(`Formato no compatible (.${ext}). Usa PDF, DOCX, ODT, TXT o MD.`);
}

/** Texto legible del content.xml de un .odt: un párrafo por línea y las listas como viñetas. */
export function textoDesdeOdtXml(xml: string): string {
  const cuerpo = /<office:text[\s>][\s\S]*<\/office:text>/.exec(xml)?.[0] ?? xml;
  return decodificarEntidades(
    sinEtiquetas(
      cuerpo
        .replace(/<text:line-break\s*\/>/g, "\n")
        .replace(/<text:tab\s*\/>/g, "\t")
        .replace(/<text:s(?:\s+text:c="(\d+)")?\s*\/>/g, (_, n: string | undefined) => " ".repeat(Math.min(Number(n ?? 1), 20)))
        .replace(/<text:list-item(?:\s[^>]*)?>/g, "- ")
        .replace(/<\/text:(?:p|h)>/g, "\n"),
    ),
  );
}

async function extraerOdt(buffer: ArrayBuffer): Promise<string> {
  const JSZip = (await import("jszip")).default;
  try {
    const zip = await JSZip.loadAsync(buffer);
    const tipo = (await zip.file("mimetype")?.async("string"))?.trim();
    if (tipo !== "application/vnd.oasis.opendocument.text") throw new ErrorImportacion("Ese archivo no es un documento de texto .odt.");
    const contenido = await zip.file("content.xml")?.async("string");
    if (!contenido) throw new ErrorImportacion("El .odt no trae contenido.");
    return textoDesdeOdtXml(contenido);
  } catch (e) {
    if (e instanceof ErrorImportacion) throw e;
    throw new ErrorImportacion("No pudimos leer ese .odt. Puede estar dañado; prueba guardarlo de nuevo.");
  }
}

async function extraerPdf(buffer: ArrayBuffer): Promise<{ texto: string; paginas: number; avisos: string[] }> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

  const tarea = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  let doc;
  try {
    doc = await tarea.promise;
  } catch (e) {
    const nombre = e instanceof Error ? e.name : "";
    if (nombre === "PasswordException") throw new ErrorImportacion("El PDF está protegido con contraseña. Quítala y vuelve a subirlo.");
    throw new ErrorImportacion("No pudimos leer ese PDF. Puede estar dañado; prueba exportarlo de nuevo.");
  }

  const avisos: string[] = [];
  const total = doc.numPages;
  const leer = Math.min(total, MAX_PAGINAS);
  if (total > MAX_PAGINAS) avisos.push(`El PDF tiene ${total} páginas; leímos las primeras ${MAX_PAGINAS}.`);

  const paginas: string[] = [];
  try {
    for (let n = 1; n <= leer; n++) {
      const pagina = await doc.getPage(n);
      const contenido = await pagina.getTextContent();
      const fragmentos: FragmentoPdf[] = [];
      for (const item of contenido.items) {
        if ("str" in item) fragmentos.push({ texto: item.str, x: item.transform[4], y: item.transform[5], ancho: item.width });
      }
      paginas.push(lineasDesdeFragmentos(fragmentos).join("\n"));
    }
  } finally {
    await tarea.destroy();
  }
  return { texto: paginas.join("\n\n"), paginas: leer, avisos };
}

async function extraerDocx(buffer: ArrayBuffer): Promise<string> {
  const mammoth = (await import("mammoth")).default;
  try {
    const r = await mammoth.extractRawText({ arrayBuffer: buffer });
    return r.value;
  } catch {
    throw new ErrorImportacion("No pudimos leer ese .docx. Puede estar dañado; prueba guardarlo de nuevo.");
  }
}

export async function extraerTextoDeArchivo(archivo: File): Promise<CvExtraido> {
  if (archivo.size === 0) throw new ErrorImportacion("El archivo está vacío.");
  if (archivo.size > MAX_BYTES) throw new ErrorImportacion(`El archivo pesa más de ${MAX_BYTES / 1024 / 1024} MB.`);

  const buffer = await archivo.arrayBuffer();
  const formato = detectarFormato(archivo.name, new Uint8Array(buffer, 0, Math.min(8, buffer.byteLength)));
  const avisos: string[] = [];
  let crudo: string;
  let paginas: number | undefined;

  if (formato === "pdf") {
    const r = await extraerPdf(buffer);
    crudo = r.texto;
    paginas = r.paginas;
    avisos.push(...r.avisos);
    if (limpiarTextoCv(crudo).length < MIN_TEXTO_UTIL) {
      throw new ErrorImportacion("Este PDF parece ser una imagen escaneada: no tiene texto seleccionable. La app aún no hace OCR; exporta un PDF con texto o pega el contenido.");
    }
    avisos.push("Si tu CV tiene dos columnas, revisa que el texto quedó en orden.");
  } else if (formato === "docx") {
    crudo = await extraerDocx(buffer);
  } else if (formato === "odt") {
    crudo = await extraerOdt(buffer);
  } else {
    crudo = new TextDecoder("utf-8").decode(buffer);
  }

  const texto = limpiarTextoCv(crudo);
  if (!texto) throw new ErrorImportacion("No encontramos texto en el archivo.");
  return { texto, formato, paginas, avisos };
}

