import { describe, expect, it } from "vitest";
import { carpetaDelDia, carpetasVigentes, esCvViejo, nombreSeguroDocx } from "./carpetaCv";

// Fechas locales (constructor con año, mes, día): la regla usa el calendario de la persona.
const HOY = new Date(2026, 10, 11, 22, 45);

describe("carpeta diaria de CVs", () => {
  it("se llama CV<mes>-<día> con la fecha local", () => {
    expect(carpetaDelDia(HOY)).toBe("CV11-11");
    expect(carpetaDelDia(new Date(2026, 0, 5))).toBe("CV01-05");
  });

  it("se guardan hoy y ayer, también al cambiar de mes y de año", () => {
    expect([...carpetasVigentes(HOY)]).toEqual(["CV11-11", "CV11-10"]);
    expect([...carpetasVigentes(new Date(2026, 2, 1))]).toEqual(["CV03-01", "CV02-28"]);
    expect([...carpetasVigentes(new Date(2027, 0, 1))]).toEqual(["CV01-01", "CV12-31"]);
  });

  it("solo marca para borrar CVs de carpetas CV viejas", () => {
    expect(esCvViejo("C:\\Users\\v\\Downloads\\CV11-09\\Ana - Dev.docx", HOY)).toBe(true);
    expect(esCvViejo("C:\\Users\\v\\Downloads\\CV11-10\\Ana - Dev.docx", HOY)).toBe(false);
    expect(esCvViejo("C:\\Users\\v\\Downloads\\CV11-11\\Ana - Dev.docx", HOY)).toBe(false);
    expect(esCvViejo("/home/v/Downloads/CV10-01/cv.docx", HOY)).toBe(true);
    // Nada fuera de una carpeta CV<mes>-<día>
    expect(esCvViejo("C:\\Users\\v\\Downloads\\Ana - Dev.docx", HOY)).toBe(false);
    expect(esCvViejo("C:\\Users\\v\\Downloads\\CVs viejos\\cv.docx", HOY)).toBe(false);
    expect(esCvViejo("C:\\Users\\v\\Downloads\\CV11-09\\sub\\cv.docx", HOY)).toBe(false);
  });

  it("el nombre que manda la página no puede salirse de la carpeta ni cambiar de tipo", () => {
    expect(nombreSeguroDocx("Victor Salgado - Mercor.docx")).toBe("Victor Salgado - Mercor.docx");
    expect(nombreSeguroDocx("..\\..\\Windows\\evil.exe")).toBe("evil.exe.docx");
    expect(nombreSeguroDocx("../../a/b.docx")).toBe("b.docx");
    expect(nombreSeguroDocx("")).toBe("CV.docx");
    expect(nombreSeguroDocx(42)).toBe("CV.docx");
    expect(nombreSeguroDocx("...")).toBe("CV.docx");
  });
});
