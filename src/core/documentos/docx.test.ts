import mammoth from "mammoth";
import { describe, expect, it } from "vitest";
import { leerPerfil } from "../perfil/estructurado";
import { limpiarTextoCv } from "../perfil/limpiar";
import { cvADocx, nombreCvDocx, xmlSeguro } from "./docx";

const CV = `Ana Torres
Desarrolladora Backend
Guadalajara, México | ana@correo.mx | +52 33 1234 5678

Experiencia
Desarrolladora Backend — Acme Pagos & Cía
Ene 2021 – Presente
- Diseñé la API de cobros en Node.js con PostgreSQL que procesa 2M de transacciones <al mes>.
- Migré reportes a Python con pandas.

Habilidades
Java, Python, Node.js, PostgreSQL`;

async function textoDe(bytes: Uint8Array): Promise<string> {
  return (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
}

describe("CV en .docx", () => {
  const { perfil } = leerPerfil(CV);

  it("Word lo abre y conserva nombre, secciones, viñetas y caracteres especiales", async () => {
    const bytes = await cvADocx(perfil, "es");
    expect([...bytes.slice(0, 2)]).toEqual([0x50, 0x4b]); // es un zip
    const texto = await textoDe(bytes);
    expect(texto).toContain("Ana Torres");
    expect(texto).toContain("EXPERIENCIA");
    expect(texto).toContain("HABILIDADES");
    expect(texto).toContain("Acme Pagos & Cía");
    expect(texto).toContain("transacciones <al mes>");
    expect(texto).toMatch(/•\s+Migré reportes a Python/);
  });

  it("al volver a subirlo a la app (mismo camino que /cv: mammoth → limpiar → leer), sale el mismo perfil", async () => {
    const otra = leerPerfil(limpiarTextoCv(await textoDe(await cvADocx(perfil, "es")))).perfil;
    expect(otra.basics.name).toBe(perfil.basics.name);
    expect(otra.basics.email).toBe(perfil.basics.email);
    expect(otra.work.length).toBe(perfil.work.length);
    expect(otra.work[0].highlights).toEqual(perfil.work[0].highlights);
  });

  it("usa los títulos del idioma de la vacante", async () => {
    const texto = await textoDe(await cvADocx(perfil, "en"));
    expect(texto).toContain("EXPERIENCE");
    expect(texto).toContain("SKILLS");
  });

  it("escapa XML y quita caracteres de control", () => {
    expect(xmlSeguro(`a & b < c > "d"\u0007`)).toBe("a &amp; b &lt; c &gt; &quot;d&quot;");
  });

  it("nombre de archivo sin acentos ni signos", () => {
    expect(nombreCvDocx("Víctor Salgado", "Customer Success Engineer (LatAm)", "Mercor")).toBe("Victor Salgado - Customer Success Engineer LatAm - Mercor.docx");
    expect(nombreCvDocx("", "", "")).toBe("CV.docx");
    expect(nombreCvDocx("Ana", "Dev/Ops: C#?")).toBe("Ana - Dev Ops C.docx");
  });
});
