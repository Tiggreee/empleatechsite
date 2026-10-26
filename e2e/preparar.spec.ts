import { expect, test, type Page } from "./base";

const CV = `Ana Torres
Desarrolladora Backend
Guadalajara, México | ana.torres@correo.mx | +52 33 1234 5678

Experiencia
Desarrolladora Backend — Acme Pagos
Ene 2021 – Presente
- Organicé la documentación interna del equipo.
- Diseñé APIs REST en Node.js con PostgreSQL para cobros.

Habilidades
Node.js, TypeScript, PostgreSQL, APIs REST, Inglés avanzado`;

async function prepararDesdeVacantes(page: Page) {
  await page.goto("/cv");
  await page.getByRole("button", { name: /Subir mi CV|Agregar CV/ }).first().click();
  await page.getByLabel(/Texto del CV/).fill(CV);
  await page.getByRole("button", { name: "Guardar CV" }).click();
  await expect(page.getByText("CV guardado.")).toBeVisible();

  await page.goto("/vacantes");
  await page.getByLabel("Puestos o palabras clave").fill("Backend Developer");
  await page.getByRole("button", { name: "Guardar preferencias" }).click();
  await expect(page.getByText("Preferencias guardadas.")).toBeVisible();
  await page.getByRole("button", { name: "Buscar ahora" }).click();
  await expect(page.getByText(/Encontramos \d+ vacantes? nuevas?/)).toBeVisible();
}

test.describe("CV y carta a la medida", () => {
  test("desde una vacante: CV reordenado, lo que falta y carta en su idioma", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await prepararDesdeVacantes(page);
    await page.getByRole("article", { name: /Nodo Pagos/ }).getByRole("link", { name: "Preparar CV y carta" }).click();

    await expect(page.getByRole("heading", { name: "CV y carta a la medida" })).toBeVisible();
    await expect(page.getByText(/Para Backend Developer en Nodo Pagos/)).toBeVisible();
    const hoja = page.getByRole("article", { name: "CV a la medida" });
    await expect(hoja.getByRole("heading", { name: "Ana Torres" })).toBeVisible();
    // El logro que habla de Node.js y PostgreSQL sube al primer lugar.
    await expect(hoja.getByRole("listitem").first()).toHaveText(/Diseñé APIs REST en Node\.js/);
    await expect(page.getByText("Lo piden y no está en tu CV")).toBeVisible();
    await expect(page.getByRole("complementary").getByText("Docker", { exact: true })).toBeVisible();

    await page.getByRole("tab", { name: "Carta de presentación" }).click();
    const carta = page.getByLabel("Carta de presentación");
    await expect(carta).toHaveValue(/^Hola, equipo de Nodo Pagos:/);
    await carta.fill("Mi carta editada.");
    await page.getByRole("button", { name: "Copiar carta como texto" }).click();
    await expect(page.getByText("Carta copiada.")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("Mi carta editada.");
  });

  test("al imprimir solo sale la hoja, sin menú ni botones", async ({ page }) => {
    await prepararDesdeVacantes(page);
    await page.getByRole("article", { name: /Nodo Pagos/ }).getByRole("link", { name: "Preparar CV y carta" }).click();
    await expect(page.getByRole("article", { name: "CV a la medida" })).toBeVisible();
    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("navigation", { name: "Principal" })).toBeHidden();
    await expect(page.getByRole("button", { name: /Descargar CV en PDF/ })).toBeHidden();
    await expect(page.getByRole("article", { name: "CV a la medida" })).toBeVisible();
  });

  test("desde una postulación guardada", async ({ page }) => {
    await prepararDesdeVacantes(page);
    await page.getByRole("article", { name: /Wizeline/ }).getByRole("button", { name: "Guardar en postulaciones" }).click();
    await expect(page.getByText(/pasó a tus postulaciones/)).toBeVisible();
    await page.goto("/postulaciones");
    await page.getByRole("link", { name: "Preparar CV y carta" }).first().click();
    await expect(page.getByText(/Para Senior Backend Developer \(Node\.js\) en Wizeline/)).toBeVisible();
    await expect(page.getByRole("article", { name: "CV a la medida" }).getByText("Ana Torres")).toBeVisible();
  });
});
