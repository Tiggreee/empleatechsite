import { expect, test, type Page } from "./base";

const CV = `Ana Torres
Desarrolladora Backend
Guadalajara, México | ana.torres@correo.mx

Experiencia
Desarrolladora Backend — Acme Pagos
Ene 2021 – Presente
- Diseñé APIs REST en Node.js con PostgreSQL y Docker.

Habilidades
Node.js, TypeScript, PostgreSQL, Docker, APIs REST, Inglés avanzado`;

async function colaConVacantes(page: Page) {
  await page.goto("/cv");
  await page.getByRole("button", { name: /Subir mi CV|Agregar CV/ }).first().click();
  await page.getByLabel(/Texto del CV/).fill(CV);
  await page.getByRole("button", { name: "Guardar CV" }).click();
  await expect(page.getByText("CV guardado.")).toBeVisible();
  await page.goto("/hoy");
  // Las palabras de búsqueda salen del perfil («Desarrolladora Backend»): no hay que configurar nada.
  await page.getByRole("button", { name: "Buscar vacantes" }).click();
  await expect(page.getByText(/Encontramos \d+ vacantes? nuevas?/)).toBeVisible();
}

test.describe("Vacantes de hoy", () => {
  test("sin CV pide subirlo", async ({ page }) => {
    await page.goto("/hoy");
    await expect(page.getByText("Primero sube tu CV")).toBeVisible();
  });

  test("arma las vacantes del día sin las ofertas riesgosas; enviar y saltar las vacían", async ({ page, isMobile }) => {
    test.skip(isMobile, "en el celular van de una en una: ver la prueba de deslizar");
    await colaConVacantes(page);
    const cola = page.getByRole("list").getByRole("article");
    await expect(cola).toHaveCount(2);
    await expect(page.getByRole("article", { name: /Estafa Rápida/ })).toHaveCount(0);
    await expect(page.getByText("0 de 10 empleos")).toBeVisible();

    const wizeline = page.getByRole("article", { name: /Wizeline/ });
    await expect(wizeline.getByRole("link", { name: "Abrir formulario ↗" })).toHaveAttribute("href", "https://job-boards.greenhouse.io/wizeline/jobs/555");
    await expect(wizeline.getByText("Formulario greenhouse")).toBeVisible();
    page.once("dialog", (d) => void d.accept());
    await wizeline.getByRole("button", { name: "Ya la envié" }).click();
    await expect(page.getByText(/Enviada: Senior Backend Developer \(Node\.js\) en Wizeline/)).toBeVisible();
    await expect(page.getByText("1 de 10 empleos")).toBeVisible();
    await expect(cola).toHaveCount(1);

    await page.getByRole("article", { name: /Nodo Pagos/ }).getByRole("button", { name: "Saltar" }).click();
    await expect(cola).toHaveCount(0);

    await page.goto("/postulaciones");
    await expect(page.getByRole("region", { name: "Postulada" }).getByText("Senior Backend Developer (Node.js)", { exact: true })).toBeVisible();
  });

  test("en el celular va una a la vez: los botones y deslizar envían o saltan", async ({ page, isMobile }) => {
    test.skip(!isMobile, "solo en pantallas chicas");
    await colaConVacantes(page);
    await expect(page.getByText("Vacante 1 de 2")).toBeVisible();
    await expect(page.getByRole("article", { name: /Estafa Rápida/ })).toHaveCount(0);
    await expect(page.getByRole("article")).toHaveCount(1);

    // Deslizar a la derecha pide la misma confirmación que el botón; si la cancelas, la tarjeta vuelve.
    const tarjeta = page.getByRole("article");
    const enReposo = await tarjeta.boundingBox();
    if (!enReposo) throw new Error("sin tarjeta");
    const deslizar = async (dx: number) => {
      // Al soltarla, la tarjeta tarda 0.2 s en volver a su lugar. Como una persona, el dedo baja cuando ya está quieta:
      // antes caía fuera de ella (16 ms después del gesto anterior en el CI) y ese deslizamiento no contaba.
      await expect.poll(async () => Math.round((await tarjeta.boundingBox())?.x ?? -1)).toBe(Math.round(enReposo.x));
      const caja = await tarjeta.boundingBox();
      if (!caja) throw new Error("sin tarjeta");
      await page.mouse.move(caja.x + caja.width / 2, caja.y + 40);
      await page.mouse.down();
      // Rápido a propósito: el dedo se levanta antes de que React pinte el último movimiento, y aun así cuenta.
      await page.mouse.move(caja.x + caja.width / 2 + dx, caja.y + 40, { steps: 2 });
      await page.mouse.up();
    };
    // Cada deslizamiento a la derecha espera su propia confirmación: si el gesto no la pide, falla aquí y no más adelante.
    const deslizarYContestar = async (aceptar: boolean) => {
      const dialogo = page.waitForEvent("dialog");
      const gesto = deslizar(180);
      const d = await dialogo;
      await (aceptar ? d.accept() : d.dismiss());
      await gesto;
    };
    await deslizarYContestar(false);
    await expect(page.getByText("Vacante 1 de 2")).toBeVisible();

    await deslizarYContestar(true);
    await expect(page.getByText(/^Enviada: .+\. Quedó en tus postulaciones\.$/)).toBeVisible();
    await expect(page.getByText("1 de 10 empleos")).toBeVisible();
    await expect(page.getByText("Vacante 1 de 1")).toBeVisible();

    await deslizar(-180);
    await expect(page.getByText("No hay vacantes listas por ahora")).toBeVisible();
  });

  test("con la meta cumplida lo celebra y no muestra más", async ({ page }) => {
    await colaConVacantes(page);
    await page.getByRole("button", { name: "Ajustar meta" }).click();
    await page.getByLabel("Empleos al día").fill("1");
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("0 de 1 empleos")).toBeVisible();
    await expect(page.getByRole("list").getByRole("article")).toHaveCount(1);
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Ya la envié" }).click();
    await expect(page.getByText("¡Meta del día cumplida!")).toBeVisible();
    await expect(page.getByRole("list").getByRole("article")).toHaveCount(0);
  });
});
