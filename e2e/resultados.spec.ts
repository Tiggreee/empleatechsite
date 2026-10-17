import { expect, test } from "./base";

const CV = `Ana Torres
Desarrolladora Backend
ana.torres@correo.mx

Experiencia
Desarrolladora Backend — Acme Pagos
Ene 2021 – Presente
- Diseñé APIs REST en Node.js con PostgreSQL y Docker.`;

test.describe("Qué te funciona", () => {
  test("sin envíos invita a empezar", async ({ page }) => {
    await page.goto("/resultados");
    await expect(page.getByText("Aún no has enviado postulaciones")).toBeVisible();
  });

  test("cuenta lo enviado, lo desglosa por plataforma y no concluye con pocos datos", async ({ page, isMobile }) => {
    await page.goto("/cv");
    await page.getByRole("button", { name: /Subir mi CV|Agregar CV/ }).first().click();
    await page.getByLabel(/Texto del CV/).fill(CV);
    await page.getByRole("button", { name: "Guardar CV" }).click();
    await expect(page.getByText("CV guardado.")).toBeVisible();

    await page.goto("/hoy");
    await page.getByRole("button", { name: "Buscar vacantes" }).click();
    const wizeline = page.getByRole("article", { name: /Wizeline/ });
    if (isMobile) {
      // En el celular las vacantes van de una en una: salta hasta llegar a la de Wizeline.
      const contador = page.getByText(/^Vacante 1 de \d+$/);
      await expect(contador).toBeVisible();
      while (!(await wizeline.isVisible())) {
        const antes = (await contador.textContent()) ?? "";
        await page.getByRole("button", { name: "Saltar" }).click();
        await expect(contador).not.toHaveText(antes);
      }
    }
    await expect(wizeline).toBeVisible();
    page.once("dialog", (d) => void d.accept());
    await wizeline.getByRole("button", { name: "Ya la envié" }).click();
    await expect(page.getByText(/Enviada: /)).toBeVisible();

    await page.goto("/postulaciones");
    await page.getByRole("button", { name: "Pasó a entrevista" }).click();
    await expect(page.getByRole("region", { name: "Entrevista" }).getByText("Senior Backend Developer (Node.js)", { exact: true })).toBeVisible();

    await page.goto("/resultados");
    await expect(page.getByText("Enviadas", { exact: true })).toBeVisible();
    await expect(page.getByText("100%", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("1/20")).toBeVisible();
    await expect(page.getByText(/Llevas 1 postulación enviada\. Con 20 empezamos/)).toBeVisible();
    const plataforma = page.getByRole("heading", { name: "Plataforma", exact: true }).locator("..").locator("..");
    const fila = plataforma.getByRole("listitem").filter({ hasText: "Greenhouse" });
    await expect(fila).toHaveCount(1);
    await expect(fila).toContainText("100% · 1 de 1");
    await expect(fila).toContainText("(pocos datos)");
  });
});
