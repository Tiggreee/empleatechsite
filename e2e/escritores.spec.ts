import { expect, test } from "./base";

/**
 * Dos escritores a la vez: la extensión registra una postulación mientras tienes /postulaciones abierto con los datos de
 * antes. Guardar en esa pestaña no debe borrar lo que registró la extensión.
 */
test("guardar en una pestaña con datos viejos no borra lo que registró la extensión", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "basta con una pantalla");
  const ahora = new Date().toISOString();
  const semilla = await request.patch("/api/state", {
    data: { postulaciones: { guardar: [{ id: "p-acme", empresa: "Acme", puesto: "Backend Java", estado: "guardada", creadaEn: ahora, actualizadaEn: ahora, historial: [] }], borrar: [] } },
  });
  expect(semilla.ok()).toBeTruthy();

  await page.goto("/postulaciones");
  await expect(page.getByText("Acme", { exact: true })).toBeVisible();

  // Mientras tanto, la extensión registra un envío en Greenhouse.
  const envio = await request.post("/api/autollenado", {
    headers: { "x-empleatech": "extension" },
    data: { tipo: "enviada", url: "https://job-boards.greenhouse.io/wizeline/jobs/555", titulo: "Senior Backend Developer - Wizeline" },
  });
  expect((await envio.json()).registrada).toBe(true);

  // Esta pestaña sigue con la lista de antes y guarda una nota.
  await page.getByText("Agregar notas").click();
  await page.getByLabel("Notas de Backend Java en Acme").fill("Hablé con la reclutadora.");
  await page.getByRole("button", { name: "Guardar notas" }).click();
  await expect(page.getByText("Notas (1)")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Acme", { exact: true })).toBeVisible();
  await expect(page.getByText("Wizeline", { exact: true })).toBeVisible();
});
