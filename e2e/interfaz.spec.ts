import { expect, test } from "./base";

test.describe("Estados de carga, vacío y error", () => {
  test("mientras llegan tus datos no aparece «aún no tienes CV»; después sí, si de verdad no hay", async ({ page }) => {
    let soltar!: () => void;
    const espera = new Promise<void>((r) => (soltar = r));
    await page.route("**/api/state", async (ruta) => {
      if (ruta.request().method() === "GET") await espera;
      await ruta.continue();
    });
    await page.goto("/cv");
    await expect(page.getByRole("status").filter({ hasText: "Cargando tus datos…" })).toBeAttached();
    await expect(page.getByText("Aún no guardas ningún CV")).toHaveCount(0);
    soltar();
    await expect(page.getByText("Aún no guardas ningún CV")).toBeVisible();
  });

  test("si el servidor falla lo dice y deja reintentar, en vez de pedirte que subas tu CV", async ({ page }) => {
    let fallar = true;
    await page.route("**/api/state", async (ruta) => {
      if (fallar && ruta.request().method() === "GET") {
        await ruta.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Error inesperado en el servidor." }) });
      } else await ruta.continue();
    });
    await page.goto("/hoy");
    await expect(page.getByRole("alert").filter({ hasText: "No pudimos cargar tus datos" })).toBeVisible();
    await expect(page.getByText("Primero sube tu CV")).toHaveCount(0);

    fallar = false;
    await page.getByRole("button", { name: "Reintentar" }).click();
    await expect(page.getByText("Primero sube tu CV")).toBeVisible();
  });
});

test.describe("Portada", () => {
  test("si tu CV ya está guardado lo dice, para que «Sube tu CV» no parezca que falta", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sube tu CV" })).toBeVisible();
    await expect(page.getByText("Tu CV ya está cargado")).toHaveCount(0);

    await page.route("**/api/state", async (ruta) => {
      if (ruta.request().method() !== "GET") return ruta.continue();
      const cv = { id: "cv-1", nombre: "Mi_CV", texto: "Desarrollador Java con Spring Boot.", actualizadoEn: "2026-10-01T10:00:00.000Z" };
      await ruta.fulfill({ contentType: "application/json", body: JSON.stringify({ perfil: { activoId: cv.id, cvs: [cv] }, postulaciones: [] }) });
    });
    await page.reload();
    await expect(page.getByRole("status").filter({ hasText: "Tu CV ya está cargado: Mi_CV" })).toBeVisible();
    await page.getByRole("link", { name: "Sigue: tus vacantes de hoy →" }).click();
    await expect(page).toHaveURL(/\/hoy$/);
  });
});

test.describe("Teclado", () => {
  test("lo primero con el tabulador es saltarse el menú", async ({ page, isMobile }) => {
    test.skip(isMobile, "en el teléfono no hay tabulador");
    await page.goto("/panel");
    await page.keyboard.press("Tab");
    const saltar = page.getByRole("link", { name: "Saltar al contenido" });
    await expect(saltar).toBeFocused();
    await saltar.press("Enter");
    await expect(page.locator("#contenido")).toBeFocused();
  });
});

test.describe("Menú en pantallas chicas", () => {
  test("los enlaces van detrás de «Menú» y se cierra al elegir uno", async ({ page, isMobile }) => {
    test.skip(!isMobile, "en escritorio los enlaces van a la vista");
    await page.goto("/panel");
    const nav = page.getByRole("navigation", { name: "Principal" });
    await expect(nav.getByRole("link", { name: "Vacantes" })).toBeHidden();

    const menu = nav.getByRole("button", { name: "Menú" });
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    expect((await menu.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await menu.click();
    await expect(nav.getByRole("button", { name: "Cerrar" })).toHaveAttribute("aria-expanded", "true");

    await nav.getByRole("link", { name: "Vacantes" }).click();
    await expect(page).toHaveURL(/\/vacantes$/);
    await expect(nav.getByRole("link", { name: "Vacantes" })).toBeHidden();

    await nav.getByRole("button", { name: "Menú" }).click();
    await page.keyboard.press("Escape");
    await expect(nav.getByRole("button", { name: "Menú" })).toHaveAttribute("aria-expanded", "false");
  });
});

test.describe("Panel: qué te subiría el puntaje", () => {
  test("con vacantes encontradas, dice qué agregar o aprender y cuánto subirían", async ({ page }) => {
    await page.goto("/cv");
    await page.getByRole("button", { name: /Subir mi CV|Agregar CV/ }).first().click();
    await page
      .getByLabel(/Texto del CV/)
      .fill("Ana Torres\nDesarrolladora Backend\n\nExperiencia\nDesarrolladora Backend — Acme Pagos\nEne 2021 – Presente\n- APIs REST en Node.js con PostgreSQL y Docker.\n\nHabilidades\nNode.js, TypeScript, PostgreSQL, Docker");
    await page.getByRole("button", { name: "Guardar CV" }).click();
    await expect(page.getByText("CV guardado.")).toBeVisible();
    await page.goto("/hoy");
    await page.getByRole("button", { name: "Buscar vacantes" }).click();
    await expect(page.getByText(/Encontramos \d+ vacantes? nuevas?/)).toBeVisible();

    await page.goto("/panel");
    const seccion = page.getByRole("region", { name: "Qué te subiría el puntaje" });
    await expect(seccion).toBeVisible();
    await expect(seccion.getByText(/\d+ de \d+ empleos en 90\+/)).toBeVisible();
    const filas = seccion.getByRole("list", { name: "Habilidades que más subirían tu puntaje" }).getByRole("listitem").filter({ has: page.getByRole("heading") });
    await expect(filas.first()).toBeVisible();
    await expect(filas.first()).toContainText(/\+\d+/);
    await expect(filas.first()).toContainText(/Te la piden en \d+ vacantes?/);
  });
});
