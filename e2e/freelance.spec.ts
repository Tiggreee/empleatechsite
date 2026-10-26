import { expect, test, type Page } from "./base";

const CV = `Ana Torres
Desarrolladora Backend

Experiencia
Desarrolladora Backend — Acme Pagos
Ene 2021 – Presente
- Diseñé una API REST en Node.js con PostgreSQL y Docker para cobros con tarjeta.

Habilidades
Node.js, TypeScript, Docker, PostgreSQL`;

async function guardarCv(page: Page) {
  await page.goto("/cv");
  await page.getByRole("button", { name: /Subir mi CV|Agregar CV/ }).first().click();
  await page.getByLabel(/Texto del CV/).fill(CV);
  await page.getByRole("button", { name: "Guardar CV" }).click();
  await expect(page.getByText("CV guardado.")).toBeVisible();
}

test.describe("Proyectos freelance", () => {
  test("pantalla Freelance: propuesta para un proyecto pegado, perfil para pegar y registro que se guarda", async ({ page }) => {
    await guardarCv(page);
    await page.goto("/freelance");
    await expect(page.getByRole("heading", { name: "Freelance", exact: true })).toBeVisible();

    // Un proyecto de Workana o Upwork, pegado a mano.
    await page.getByLabel("Descripción del proyecto").fill("Necesito una API REST en Node.js con PostgreSQL para cobrar con tarjeta en mi tienda en línea. Idealmente con Docker.");
    await expect(page.getByRole("textbox", { name: "Propuesta" })).toHaveValue(/^Hola, leí tu proyecto «Necesito una API REST/);
    await expect(page.getByRole("textbox", { name: "Propuesta" })).toHaveValue(/en Acme Pagos diseñé una API REST/);
    await expect(page.getByRole("button", { name: "Copiar propuesta" })).toBeVisible();

    // Perfil para pegar: en inglés no mete frases del CV en español; en español sí.
    await expect(page.getByRole("textbox", { name: "Titular" })).toHaveValue(/^Desarrolladora Backend \| .*Node\.js/);
    await expect(page.getByRole("textbox", { name: /Descripción \(Sobre mí/ })).not.toHaveValue(/Diseñé/);
    await page.getByRole("tab", { name: "Español" }).click();
    await expect(page.getByRole("textbox", { name: /Descripción \(Sobre mí/ })).toHaveValue(/Diseñé una API REST/);

    // Registro en plataformas: se guarda en tu base.
    await expect(page.getByText("Dónde registrarte (0 de 9)")).toBeVisible();
    await page.getByLabel("Estado en Workana").selectOption("registrado");
    await expect(page.getByText("Dónde registrarte (1 de 9)")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Estado en Workana")).toHaveValue("registrado");
  });

  test("se activan aparte de las 5 plataformas de empleo, se puntúan y llevan a una propuesta lista para pegar", async ({ page }) => {
    await guardarCv(page);

    await page.goto("/vacantes");
    await page.getByLabel("Puestos o palabras clave").fill("Backend Developer");
    // Las 5 plataformas de empleo ya están elegidas; las de freelance siguen disponibles.
    await expect(page.getByText("(5 de 5)")).toBeVisible();
    const freelance = page.getByRole("group", { name: /Proyectos freelance/ });
    await freelance.getByRole("checkbox", { name: /Freelancer\.com/ }).check();
    await freelance.getByRole("checkbox", { name: /Braintrust/ }).check();
    await page.getByRole("button", { name: "Guardar preferencias" }).click();
    await expect(page.getByText("Preferencias guardadas.")).toBeVisible();
    await page.getByRole("button", { name: "Buscar ahora" }).click();
    await expect(page.getByText(/Encontramos \d+ vacantes? nuevas?/)).toBeVisible();

    const proyecto = page.getByRole("article", { name: /API backend para tienda en línea/ });
    await expect(proyecto.getByText("Proyecto freelance")).toBeVisible();
    await expect(proyecto.getByText("500–1,000 USD por proyecto")).toBeVisible();
    await expect(proyecto.getByText("4 propuestas", { exact: true })).toBeVisible();
    await expect(page.getByRole("article", { name: /Nube Andina/ }).getByText("40–55 USD /h")).toBeVisible();
    // El de US$50 no compensa una propuesta.
    await expect(page.getByRole("article", { name: /Logo para cafetería/ })).toHaveCount(0);

    await proyecto.getByRole("link", { name: "Preparar propuesta" }).click();
    await expect(page.getByRole("heading", { name: "Propuesta a la medida" })).toBeVisible();
    const texto = page.getByRole("textbox", { name: "Propuesta" });
    await expect(texto).toHaveValue(/^Hola, leí tu proyecto «API backend para tienda en línea»/);
    await expect(texto).toHaveValue(/Node\.js/);
    await expect(texto).toHaveValue(/Ana Torres$/);
    await expect(page.getByText(/\d+ \/ 1500/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Copiar propuesta" })).toBeVisible();

    // El CV sigue a un clic, por si la plataforma lo pide.
    await page.getByRole("tab", { name: "CV" }).click();
    await expect(page.getByText("Ana Torres").first()).toBeVisible();
  });
});
