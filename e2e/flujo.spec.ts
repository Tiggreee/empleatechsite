import { expect, test, type Page } from "./base";
import { OFERTA_TEXTO } from "./archivos";

const CV_TXT = "Ana Torres. 5 años de experiencia con Node.js, Docker y PostgreSQL, APIs REST con TypeScript. Inglés avanzado. Liderazgo de equipos pequeños.";
const OFERTA_RIESGOSA = `Requisitos:\n- Node.js y PostgreSQL.\n- Inglés avanzado.\n\nRequiere inversión inicial de $2,000 para tu kit de trabajo. Ingresos ilimitados, solo comisiones. Envía tu CURP y tu INE por WhatsApp.`;

async function guardarCv(page: Page, texto = CV_TXT, nombre = "Principal") {
  await page.goto("/cv");
  await page.getByRole("button", { name: /Subir mi CV|Agregar CV/ }).first().click();
  await page.getByLabel("Nombre de esta versión").fill(nombre);
  await page.getByLabel(/Texto del CV/).fill(texto);
  await page.getByRole("button", { name: "Guardar CV" }).click();
  await expect(page.getByText("CV guardado.")).toBeVisible();
}

async function analizarYGuardar(page: Page, oferta: string, empresa: string, puesto: string) {
  await page.goto("/analizar");
  await page.getByLabel("Texto de la oferta").fill(oferta);
  await expect(page.getByRole("img", { name: /Afinidad \d+ de 100/ })).toBeVisible();
  await page.getByRole("textbox", { name: "Empresa" }).fill(empresa);
  await page.getByRole("textbox", { name: "Puesto" }).fill(puesto);
  await page.getByRole("button", { name: "Guardar con su análisis" }).click();
  await expect(page.getByText(/Guardada en tu tracker/)).toBeVisible();
}

test("panel vacío guía en tres pasos", async ({ page }) => {
  await page.goto("/panel");
  await expect(page.getByRole("heading", { name: "Empieza en tres pasos" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Subir CV" })).toBeVisible();
});

test("con CV guardado se analiza sin volver a subirlo y se ve la explicación", async ({ page }) => {
  await guardarCv(page);
  await page.goto("/analizar");
  await expect(page.getByText("Principal")).toBeVisible();
  await page.getByLabel("Texto de la oferta").fill(OFERTA_TEXTO);
  await expect(page.getByRole("img", { name: /Afinidad \d+ de 100/ })).toBeVisible();
  await expect(page.getByText("Por qué este puntaje")).toBeVisible();
});

test("una oferta riesgosa muestra alertas graves y recomienda descartar", async ({ page }) => {
  await guardarCv(page);
  await page.goto("/analizar");
  await page.getByLabel("Texto de la oferta").fill(OFERTA_RIESGOSA);
  await expect(page.getByText("Te piden dinero para empezar")).toBeVisible();
  await expect(page.getByText("Ingreso solo por comisión")).toBeVisible();
  await expect(page.getByText("Piden datos sensibles desde el primer contacto")).toBeVisible();
});

test("flujo completo: guardar, priorizar, sello humano y panel", async ({ page }) => {
  await guardarCv(page);
  await analizarYGuardar(page, OFERTA_TEXTO, "Acme", "Backend Sr");
  await analizarYGuardar(page, OFERTA_RIESGOSA, "Estafa SA", "Vendedor");

  await page.goto("/postulaciones");
  const guardadas = page.getByRole("region", { name: "Guardada" });
  const tarjetas = guardadas.locator("article");
  await expect(tarjetas).toHaveCount(2);

  const acme = tarjetas.nth(0);
  await acme.getByText("Marcar con sello humano").click();
  const marcar = acme.getByRole("button", { name: "Marcar como postulada" });
  await expect(marcar).toBeDisabled();
  for (const c of await acme.getByRole("checkbox").all()) await c.check();
  await expect(marcar).toBeEnabled();
  await marcar.click();

  await page.goto("/panel");
  await expect(page.getByRole("heading", { name: "Empieza en tres pasos" })).toHaveCount(0);
  await expect(page.getByText("Ofertas guardadas por prioridad")).toBeVisible();
});

test("borrar datos funciona desde el panel", async ({ page }) => {
  await guardarCv(page);
  await analizarYGuardar(page, OFERTA_TEXTO, "Acme", "Backend");
  await page.goto("/panel");
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Borrar mis datos guardados" }).click();
  await expect(page.getByText("Datos borrados.")).toBeVisible();
});

