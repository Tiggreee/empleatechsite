import { expect, test, type Page } from "./base";
import { CV_COMPLETO, crearOdt } from "./archivos";

async function subirCvOdt(page: Page) {
  await page.goto("/cv");
  await page.getByRole("button", { name: "Subir mi CV" }).click();
  await page.locator("input[type=file]").setInputFiles({ name: "cv.odt", mimeType: "application/vnd.oasis.opendocument.text", buffer: crearOdt(CV_COMPLETO) });
  await expect(page.getByText(/Leído cv\.odt/)).toBeVisible();
  await page.getByRole("button", { name: "Guardar CV" }).click();
  await expect(page.getByText("CV guardado.")).toBeVisible();
}

test.describe("Perfil estructurado", () => {
  test("sin CV invita a subirlo", async ({ page }) => {
    await page.goto("/perfil");
    await expect(page.getByText("Primero sube tu CV")).toBeVisible();
  });

  test("un CV en ODT se lee y arma el perfil con experiencia, educación e idiomas", async ({ page }) => {
    await subirCvOdt(page);
    await page.goto("/perfil");
    await expect(page.getByLabel("Nombre completo")).toHaveValue("Ana Torres");
    await expect(page.getByLabel("Correo")).toHaveValue("ana.torres@correo.mx");
    await expect(page.getByLabel("Teléfono")).toHaveValue("+52 33 1234 5678");
    await expect(page.getByLabel("Puesto", { exact: true })).toHaveValue("Desarrolladora Backend");
    await expect(page.getByLabel("Empresa", { exact: true })).toHaveValue("Acme Pagos");
    await expect(page.getByLabel("Desde", { exact: true })).toHaveValue("2021-01");
    await expect(page.getByLabel("Institución", { exact: true })).toHaveValue("Universidad de Guadalajara");
    await expect(page.getByLabel("Idioma", { exact: true })).toHaveValue("Inglés");
    await expect(page.getByText("Leímos tus datos principales.")).toBeVisible();
  });

  test("las correcciones se guardan y sobreviven a recargar", async ({ page }) => {
    await subirCvOdt(page);
    await page.goto("/perfil");
    await page.getByLabel("Título profesional").fill("Backend Senior");
    await page.getByRole("button", { name: "Guardar perfil" }).click();
    await expect(page.getByText("Perfil guardado.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Título profesional")).toHaveValue("Backend Senior");
    await expect(page.getByText("Con tus correcciones")).toBeVisible();
  });

  test("las respuestas para formularios se contestan una vez y se conservan", async ({ page }) => {
    await page.goto("/perfil");
    await expect(page.getByText("7 respuestas pendientes")).toBeVisible();
    await page.getByLabel("Monto de la pretensión salarial").fill("55000");
    await page.getByLabel("Disponibilidad").selectOption("2-semanas");
    await page.getByLabel("Remoto").check();
    await page.getByLabel("México").check();
    await page.getByRole("radiogroup", { name: "Patrocinio de visa" }).getByLabel("No").check();
    await page.getByLabel("Años de experiencia").fill("6");
    await page.getByLabel("Nivel de inglés").selectOption("avanzado");
    await page.getByRole("button", { name: "Guardar respuestas" }).click();
    await expect(page.getByText("Respuestas guardadas.")).toBeVisible();
    await expect(page.getByText("Respuestas listas")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Monto de la pretensión salarial")).toHaveValue("55000");
    await expect(page.getByLabel("México")).toBeChecked();
    await expect(page.getByText("Respuestas listas")).toBeVisible();
  });
});
