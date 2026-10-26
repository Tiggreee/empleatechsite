// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SITIOS_FORMULARIO, SITIOS_PROPUESTA, coberturaDe } from "./cobertura";
import { escanear } from "./dom";
import { claveDePostulacion } from "./url";

const manifest = JSON.parse(readFileSync(join(__dirname, "../../../extension/manifest.json"), "utf8")) as {
  content_scripts: { matches: string[]; js: string[] }[];
};
const hostsDe = (script: string) =>
  manifest.content_scripts.filter((c) => c.js.includes(script)).flatMap((c) => c.matches.map((m) => new URL(m.replaceAll("*", "x")).hostname));

describe("dónde trabaja la extensión", () => {
  it("la app dice lo mismo que el manifest: ningún sitio se queda sin aviso ni con un aviso falso", () => {
    expect([...SITIOS_FORMULARIO].sort()).toEqual(hostsDe("contenido.js").sort());
    expect([...SITIOS_PROPUESTA].sort()).toEqual(hostsDe("propuesta.js").sort());
  });

  it("distingue formulario, propuesta y lo que se llena a mano", () => {
    expect(coberturaDe("https://job-boards.greenhouse.io/acme/jobs/1")).toBe("formulario");
    expect(coberturaDe("https://app.usebraintrust.com/jobs/17940/")).toBe("formulario");
    expect(coberturaDe("https://www.workana.com/job/x")).toBe("propuesta");
    expect(coberturaDe("https://www.linkedin.com/jobs/view/1")).toBeNull();
    expect(coberturaDe(undefined)).toBeNull();
  });

  it("en Braintrust, el formulario es la misma vacante que se guardó", () => {
    expect(claveDePostulacion("https://app.usebraintrust.com/jobs/17940/proposals/new/")).toBe("braintrust:17940");
    expect(claveDePostulacion("https://app.usebraintrust.com/jobs/17940/")).toBe("braintrust:17940");
  });

  it("un campo de archivo con etiqueta de «arrastra aquí» toma la pregunta de su contenedor", () => {
    document.body.innerHTML = `
      <form>
        <div><p>Include your resume <span>Required</span></p>
          <div><div><label>Drag &amp; drop file or Browse<input type="file" accept="application/pdf"></label></div>
          <p>Attach up to 1 file, max 10 MB, PDFs only</p></div></div>
        <div><label for="first_name">Legal first name</label><input id="first_name" name="first_name"></div>
      </form>`;
    const archivo = escanear(document).find((c) => c.tipo === "archivo");
    expect(archivo?.campo).toBe("cv");
    expect(archivo?.etiqueta).toMatch(/Include your resume/);
  });
});
