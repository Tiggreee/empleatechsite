import { expect, test, type Page } from "./base";

const CV = "Ana Torres. Desarrolladora backend con 5 años de experiencia con Node.js, TypeScript, Docker y PostgreSQL. APIs REST. Inglés avanzado.";

async function guardarCv(page: Page) {
  await page.goto("/cv");
  await page.getByRole("button", { name: /Subir mi CV|Agregar CV/ }).first().click();
  await page.getByLabel(/Texto del CV/).fill(CV);
  await page.getByRole("button", { name: "Guardar CV" }).click();
  await expect(page.getByText("CV guardado.")).toBeVisible();
}

async function configurarYBuscar(page: Page) {
  await page.goto("/vacantes");
  await page.getByLabel("Puestos o palabras clave").fill("Backend Developer");
  await page.getByRole("button", { name: "Guardar preferencias" }).click();
  await expect(page.getByText("Preferencias guardadas.")).toBeVisible();
  await page.getByRole("button", { name: "Buscar ahora" }).click();
  await expect(page.getByText(/Encontramos \d+ vacantes? nuevas?/)).toBeVisible();
}

test.describe("Vacantes", () => {
  test("sin CV pide subirlo primero", async ({ page }) => {
    await page.goto("/vacantes");
    await expect(page.getByText("Primero sube tu CV")).toBeVisible();
    await expect(page.getByRole("button", { name: "Buscar ahora" })).toHaveCount(0);
  });

  test("busca en las plataformas, filtra lo que no aplica y marca las ofertas riesgosas", async ({ page }) => {
    await guardarCv(page);
    await configurarYBuscar(page);

    const tarjetas = page.locator("article");
    await expect(tarjetas).toHaveCount(3);
    await expect(page.getByRole("article", { name: /Chef/ })).toHaveCount(0);
    await expect(page.getByRole("article", { name: /Wizeline/ })).toBeVisible();
    await expect(page.getByRole("article", { name: /Nodo Pagos/ }).getByText("3,000–4,200 USD /mes")).toBeVisible();

    const riesgosa = page.getByRole("article", { name: /Estafa Rápida/ });
    await expect(riesgosa.getByText("Oferta riesgosa")).toBeVisible();
    await expect(riesgosa.getByText("Conviene descartar")).toBeVisible();
    await expect(riesgosa.getByRole("link", { name: /Ver en Remotive/ })).toHaveAttribute("href", "https://remotive.com/remote-jobs/software-dev/backend-engineer-101");

    await expect(page.getByText("Resultado por plataforma")).toBeVisible();
    await expect(page.getByText("requiere clave", { exact: true })).toHaveCount(3);
  });

  test("descartar y guardar en postulaciones; la segunda búsqueda respeta los intervalos", async ({ page }) => {
    await guardarCv(page);
    await configurarYBuscar(page);

    await page.getByRole("article", { name: /Estafa Rápida/ }).getByRole("button", { name: "Descartar" }).click();
    await expect(page.getByRole("article", { name: /Estafa Rápida/ })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Descartadas (1)" })).toBeVisible();

    await page.getByRole("article", { name: /Wizeline/ }).getByRole("button", { name: "Guardar en postulaciones" }).click();
    await expect(page.getByText(/pasó a tus postulaciones/)).toBeVisible();
    await expect(page.getByRole("tab", { name: "Guardadas (1)" })).toBeVisible();

    await page.getByRole("button", { name: "Buscar ahora" }).click();
    await expect(page.getByText("No hay vacantes nuevas por ahora.")).toBeVisible();
    await expect(page.getByText(/consultada hace poco; disponible en \d+ min/).first()).toBeVisible();
    // La descartada no vuelve a aparecer.
    await expect(page.getByRole("article", { name: /Estafa Rápida/ })).toHaveCount(0);

    await page.goto("/postulaciones");
    await expect(page.getByText("Senior Backend Developer (Node.js)", { exact: true })).toBeVisible();
  });
});

test("si cambias tus respuestas, las vacantes se vuelven a puntuar solas", async ({ page }) => {
  await guardarCv(page);
  await configurarYBuscar(page);
  const wizeline = page.getByRole("article", { name: /Wizeline/ });
  await wizeline.getByText("Por qué esta prioridad").click();
  await expect(wizeline.getByText(/Pide nivel senior/)).toHaveCount(0);

  await page.goto("/perfil");
  await page.getByLabel("Años de experiencia").fill("2");
  await page.getByRole("button", { name: "Guardar respuestas" }).click();
  await expect(page.getByText("Respuestas guardadas.")).toBeVisible();

  await page.goto("/vacantes");
  const otra = page.getByRole("article", { name: /Wizeline/ });
  await otra.getByText("Por qué esta prioridad").click();
  await expect(otra.getByText("Pide nivel senior y tienes 2 años de experiencia (−10)")).toBeVisible();
});
