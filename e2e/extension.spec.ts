import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { chromium, type BrowserContext } from "@playwright/test";
import { expect, test } from "./base";

const DIST = path.resolve(__dirname, "..", "extension", "dist");
const FORMULARIO = "https://job-boards.greenhouse.io/wizeline/jobs/555";

const CV = `Ana Torres
Desarrolladora Backend
Guadalajara, México | ana.torres@correo.mx | +52 33 1234 5678
linkedin.com/in/anatorres

Experiencia
Desarrolladora Backend — Acme Pagos
Ene 2021 – Presente
- Diseñé APIs REST en Node.js con PostgreSQL y Docker.

Habilidades
Node.js, TypeScript, PostgreSQL, Docker, AWS`;

// Mismo esqueleto que un formulario real de Greenhouse (verificado contra su API pública de preguntas).
const HTML_FORMULARIO = `<!doctype html><html lang="en"><head><title>Senior Backend Developer - Wizeline</title></head><body>
<form action="${FORMULARIO}/confirmation" method="get">
  <label for="first_name">First Name *</label><input id="first_name" name="first_name" required>
  <label for="last_name">Last Name *</label><input id="last_name" name="last_name" required>
  <label for="email">Email *</label><input id="email" name="email" required>
  <label for="phone">Phone *</label><input id="phone" name="phone" required>
  <label for="resume">Resume/CV *</label><input id="resume" name="resume" type="file" required>
  <label for="q1">LinkedIn Profile *</label><input id="q1" name="question_1" required>
  <label for="q2">Will you now or in the future require sponsorship to work in Mexico? *</label>
  <select id="q2" name="question_2" required><option value="">Select...</option><option>Yes</option><option>No</option></select>
  <label for="q3">Have you been referred by any staff member of Wizeline? *</label>
  <select id="q3" name="question_3" required><option value="">Select...</option><option>Yes</option><option>No</option></select>
  <button type="submit">Submit application</button>
</form></body></html>`;

const HTML_GRACIAS = `<!doctype html><html><head><title>Thank you</title></head><body><h1>Thank you for applying to Wizeline!</h1></body></html>`;

test.describe("Extensión de Chrome", () => {
  test.skip(({ isMobile }) => isMobile, "Las extensiones son de Chrome de escritorio.");

  let contexto: BrowserContext | undefined;

  test.beforeAll(() => {
    execFileSync(process.execPath, [path.resolve(__dirname, "..", "scripts", "extension.mjs")], { stdio: "inherit" });
  });

  test.afterEach(async () => {
    await contexto?.close();
  });

  test("llena el formulario, marca lo que falta y registra la postulación cuando tú envías", async ({ page, baseURL, request }) => {
    // 1) En la app: CV, respuestas y búsqueda (fuentes simuladas; incluye esta vacante de Wizeline).
    await page.goto("/cv");
    await page.getByRole("button", { name: /Subir mi CV|Agregar CV/ }).first().click();
    await page.getByLabel(/Texto del CV/).fill(CV);
    await page.getByRole("button", { name: "Guardar CV" }).click();
    await expect(page.getByText("CV guardado.")).toBeVisible();
    await page.goto("/perfil");
    await page.getByRole("radiogroup", { name: "Patrocinio de visa" }).getByLabel("Sí").check();
    await page.getByLabel("México").check();
    await page.getByRole("button", { name: "Guardar respuestas" }).click();
    await expect(page.getByText("Respuestas guardadas.")).toBeVisible();
    await page.goto("/hoy");
    await page.getByRole("button", { name: "Buscar vacantes" }).click();
    await expect(page.getByRole("article", { name: /Wizeline/ })).toBeVisible();

    // 2) Chrome con la extensión, apuntando a esta app.
    contexto = await chromium.launchPersistentContext(path.join(os.tmpdir(), `empleatech-ext-${Date.now()}`), {
      channel: "chromium",
      args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
    });
    const sw = contexto.serviceWorkers()[0] ?? (await contexto.waitForEvent("serviceworker"));
    await sw.evaluate((b) => chrome.storage.local.set({ base: b }), baseURL as string);
    await contexto.route(`${FORMULARIO}/confirmation**`, (r) => r.fulfill({ contentType: "text/html", body: HTML_GRACIAS }));
    await contexto.route(FORMULARIO, (r) => r.fulfill({ contentType: "text/html", body: HTML_FORMULARIO }));

    const ats = await contexto.newPage();
    await ats.goto(FORMULARIO);
    await ats.getByRole("button", { name: "Llenar con EmpleaTech" }).click();

    await expect(ats.locator("#first_name")).toHaveValue("Ana");
    await expect(ats.locator("#last_name")).toHaveValue("Torres");
    await expect(ats.locator("#email")).toHaveValue("ana.torres@correo.mx");
    await expect(ats.locator("#q1")).toHaveValue("https://linkedin.com/in/anatorres");
    // Autorizada en México: no necesita patrocinio para trabajar ahí.
    await expect(ats.locator("#q2")).toHaveValue("No");
    expect(await ats.locator("#resume").evaluate((i: HTMLInputElement) => i.files?.[0]?.name)).toBe("CV - Ana Torres.pdf");
    await expect(ats.getByText("Para Senior Backend Developer (Node.js) en Wizeline.")).toBeVisible();
    await expect(ats.getByText("Te falta 1 obligatorio (marcados en rojo):")).toBeVisible();
    await expect(ats.locator("#q3")).toHaveAttribute("data-empleatech-falta", "1");

    // 3) Lo que falta lo contestas tú; el panel lo confirma. Y el clic en «Enviar» también es tuyo.
    await ats.locator("#q3").selectOption("No");
    await ats.getByRole("button", { name: "Volver a revisar" }).click();
    await expect(ats.getByText("Todo lo obligatorio está listo. Revisa y presiona «Enviar» tú.")).toBeVisible();
    await ats.getByRole("button", { name: "Submit application" }).click();
    await expect(ats.getByText(/Registrada en tu tracker: Senior Backend Developer \(Node\.js\) en Wizeline\./)).toBeVisible({ timeout: 15_000 });

    // 4) En la app: quedó como postulada y la respuesta nueva se aprendió para la próxima.
    await page.goto("/postulaciones");
    await expect(page.getByRole("region", { name: "Postulada" }).getByText("Senior Backend Developer (Node.js)", { exact: true })).toBeVisible();
    const r = await request.get(`/api/autollenado?url=${encodeURIComponent(FORMULARIO)}`, { headers: { "x-empleatech": "extension" } });
    const cuerpo = (await r.json()) as { datos: { aprendidas: Record<string, string> } };
    expect(cuerpo.datos.aprendidas["have you been referred by any staff member of wizeline"]).toBe("No");
  });

  test("en Freelancer.com arma la propuesta, la pone en su cuadro y la registra cuando dices que la enviaste", async ({ page, baseURL }) => {
    const PROYECTO = "https://www.freelancer.com/projects/nodejs/Payments-API-store";
    const HTML_PROYECTO = `<!doctype html><html lang="en"><head><title>Payments API for an online store | Freelancer</title></head><body>
      <nav>Browse Projects Messages Dashboard</nav>
      <main><h1>Payments API for an online store</h1>
      <p>We are looking for a developer to build a Node.js REST API with PostgreSQL and Docker that charges cards for our online store. You will work with our team.</p>
      <form><label for="bid">Describe your proposal</label><textarea id="bid" maxlength="1500"></textarea><button type="button">Place Bid</button></form></main>
      <footer>Freelancer® is a registered trademark</footer></body></html>`;

    await page.goto("/cv");
    await page.getByRole("button", { name: /Subir mi CV|Agregar CV/ }).first().click();
    await page.getByLabel(/Texto del CV/).fill(CV);
    await page.getByRole("button", { name: "Guardar CV" }).click();
    await expect(page.getByText("CV guardado.")).toBeVisible();

    contexto = await chromium.launchPersistentContext(path.join(os.tmpdir(), `empleatech-ext-${Date.now()}`), {
      channel: "chromium",
      args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
    });
    const sw = contexto.serviceWorkers()[0] ?? (await contexto.waitForEvent("serviceworker"));
    await sw.evaluate((b) => chrome.storage.local.set({ base: b }), baseURL as string);
    await contexto.route(PROYECTO, (r) => r.fulfill({ contentType: "text/html", body: HTML_PROYECTO }));

    const sitio = await contexto.newPage();
    await sitio.goto(PROYECTO);
    await sitio.getByRole("button", { name: "Armar propuesta con EmpleaTech" }).click();

    const cuadro = sitio.locator("#bid");
    await expect(cuadro).toHaveValue(/^Hi, I read your project "Payments API for an online store"/);
    await expect(cuadro).toHaveValue(/Node\.js/);
    // Sin datos de contacto: las plataformas lo prohíben antes del contrato.
    expect(await cuadro.inputValue()).not.toMatch(/ana\.torres@correo\.mx|\+52/);
    await expect(sitio.getByText("Puse tu propuesta en el cuadro. Revísala, ajústala si quieres y envíala tú.")).toBeVisible();

    // Enviar es tuyo; luego le avisas a EmpleaTech y queda en tu tracker.
    await sitio.getByRole("button", { name: "Ya la envié" }).click();
    await expect(sitio.getByText("Registrada en tu tracker.")).toBeVisible();
    await page.goto("/postulaciones");
    await expect(page.getByText("Payments API for an online store", { exact: true })).toBeVisible();
  });

  test("se conecta con un botón desde Autollenado, sin copiar nada a las opciones", async ({ baseURL }) => {
    contexto = await chromium.launchPersistentContext(path.join(os.tmpdir(), `empleatech-ext-${Date.now()}`), {
      channel: "chromium",
      args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
    });
    const sw = contexto.serviceWorkers()[0] ?? (await contexto.waitForEvent("serviceworker"));
    // Recién instalada apunta a internet; conectar desde esta app la cambia a la dirección de esta app.
    expect(await sw.evaluate(() => chrome.storage.local.get("base"))).toEqual({});

    const app = await contexto.newPage();
    await app.goto(`${baseURL}/autollenado`);
    await expect(app.getByText(/Extensión \d+\.\d+\.\d+ instalada en este navegador/)).toBeVisible();
    await app.getByRole("button", { name: "Conectar la extensión" }).click();
    const origen = new URL(baseURL as string).origin;
    await expect(app.getByText(`Conectada a ${origen}.`, { exact: false })).toBeVisible();
    expect(await sw.evaluate(() => chrome.storage.local.get(["base", "token"]))).toEqual({ base: origen, token: "" });
  });

  test("sin la extensión, Autollenado dice cómo instalarla en vez de mostrar el botón", async ({ page }) => {
    await page.goto("/autollenado");
    await expect(page.getByText("No vemos la extensión en este navegador.", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Conectar la extensión" })).toHaveCount(0);
  });

  test("el servicio no responde a páginas web cualquiera", async ({ request }) => {
    const sinEncabezado = await request.get(`/api/autollenado?url=${encodeURIComponent(FORMULARIO)}`);
    expect(sinEncabezado.status()).toBe(403);
    const desdeUnSitio = await request.get(`/api/autollenado?url=${encodeURIComponent(FORMULARIO)}`, { headers: { "x-empleatech": "extension", Origin: "https://sitio-malicioso.example" } });
    expect(desdeUnSitio.status()).toBe(403);
  });
});
