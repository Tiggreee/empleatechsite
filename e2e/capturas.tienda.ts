import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { chromium, type BrowserContext } from "@playwright/test";
import { expect, test } from "./base";

/**
 * Capturas de la ficha en la Chrome Web Store (1280×800): la extensión llenando un formulario, armando una propuesta y
 * conectándose desde la app. Todo con datos ficticios (Ana Torres, Acme Pagos); las páginas de vacantes son de muestra.
 */
const SALIDA = path.resolve(__dirname, "..", "extension", "tienda");
const DIST = path.resolve(__dirname, "..", "extension", "dist");
const TAMANO = { width: 1280, height: 800 };

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

const ESTILO = `<style>
  body { margin: 0; font: 15px/1.5 system-ui, sans-serif; color: #1d2433; background: #f6f7f9; }
  header { background: #fff; border-bottom: 1px solid #e3e6eb; padding: 18px 48px; font-weight: 700; font-size: 18px; }
  main { max-width: 640px; margin: 28px 48px; background: #fff; border: 1px solid #e3e6eb; border-radius: 8px; padding: 28px 32px; }
  h1 { margin: 0 0 4px; font-size: 24px; } .sub { color: #5b6475; margin: 0 0 22px; }
  label { display: block; font-weight: 600; margin: 14px 0 6px; font-size: 14px; }
  input, select, textarea { width: 100%; box-sizing: border-box; padding: 9px 10px; border: 1px solid #c9ced8; border-radius: 6px; font: inherit; background: #fff; }
  .doble { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }
  button[type=submit], .enviar { margin-top: 22px; padding: 11px 20px; border: 0; border-radius: 6px; background: #1d2433; color: #fff; font-weight: 700; }
</style>`;

const FORMULARIO = "https://jobs.lever.co/acme-pagos/senior-backend";
const HTML_FORMULARIO = `<!doctype html><html lang="en"><head><title>Senior Backend Developer - Acme Pagos</title>${ESTILO}</head><body>
<header>Acme Pagos · Careers</header>
<main><h1>Senior Backend Developer</h1><p class="sub">Remote · Mexico · Engineering</p>
<form action="${FORMULARIO}/thanks" method="get">
  <div class="doble">
    <div><label for="first_name">First Name *</label><input id="first_name" name="first_name" required></div>
    <div><label for="last_name">Last Name *</label><input id="last_name" name="last_name" required></div>
  </div>
  <div class="doble">
    <div><label for="email">Email *</label><input id="email" name="email" required></div>
    <div><label for="phone">Phone *</label><input id="phone" name="phone" required></div>
  </div>
  <label for="resume">Resume/CV *</label><input id="resume" name="resume" type="file" required>
  <label for="q1">LinkedIn Profile *</label><input id="q1" name="question_1" required>
  <label for="q2">Will you now or in the future require sponsorship to work in Mexico? *</label>
  <select id="q2" name="question_2" required><option value="">Select...</option><option>Yes</option><option>No</option></select>
  <label for="q3">How did you hear about this job? *</label>
  <select id="q3" name="question_3" required><option value="">Select...</option><option>LinkedIn</option><option>Referral</option><option>Other</option></select>
  <button type="submit">Submit application</button>
</form></main></body></html>`;

const PROYECTO = "https://www.freelancer.com/projects/nodejs/payments-api-online-store";
const HTML_PROYECTO = `<!doctype html><html lang="en"><head><title>Payments API for an online store</title>${ESTILO}</head><body>
<header>Projects</header>
<main><h1>Payments API for an online store</h1><p class="sub">Budget $750 – $1,500 USD · Node.js · PostgreSQL · Docker</p>
<p>We are looking for a developer to build a Node.js REST API with PostgreSQL and Docker that charges cards for our online store. You will work with our team.</p>
<form><label for="bid">Describe your proposal</label><textarea id="bid" rows="11" maxlength="1500"></textarea><button type="button" class="enviar">Place Bid</button></form>
</main></body></html>`;

let contexto: BrowserContext | undefined;

test.afterEach(async () => {
  await contexto?.close();
});

test("capturas de la ficha", async ({ page, baseURL }) => {
  execFileSync(process.execPath, [path.resolve(__dirname, "..", "scripts", "extension.mjs")], { stdio: "inherit" });

  // En la app: CV y respuestas de una persona ficticia.
  await page.goto("/cv");
  await page.getByRole("button", { name: /Subir mi CV|Agregar CV/ }).first().click();
  await page.getByLabel(/Texto del CV/).fill(CV);
  await page.getByRole("button", { name: "Guardar CV" }).click();
  await expect(page.getByText("CV guardado.")).toBeVisible();
  await page.goto("/perfil");
  await page.getByLabel("México").check();
  await page.getByRole("button", { name: "Guardar respuestas" }).click();
  await expect(page.getByText("Respuestas guardadas.")).toBeVisible();

  contexto = await chromium.launchPersistentContext(path.join(os.tmpdir(), `empleatech-tienda-${Date.now()}`), {
    channel: "chromium",
    viewport: TAMANO,
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  await contexto.route(FORMULARIO, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: HTML_FORMULARIO }));
  await contexto.route(PROYECTO, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: HTML_PROYECTO }));

  // 1) Conectar desde la app (la captura antes del clic: el botón, sin la dirección de pruebas).
  const app = await contexto.newPage();
  await app.goto(`${baseURL}/autollenado`);
  const conectar = app.getByRole("button", { name: "Conectar la extensión" });
  await expect(conectar).toBeVisible();
  await app.screenshot({ path: path.join(SALIDA, "captura-3-conectar.png") });
  await conectar.click();
  await expect(app.getByText("Conectada a", { exact: false })).toBeVisible();

  // 2) Formulario de postulación lleno, con lo que falta marcado.
  const ats = await contexto.newPage();
  await ats.goto(FORMULARIO);
  await ats.getByRole("button", { name: "Llenar con EmpleaTech" }).click();
  await expect(ats.locator("#first_name")).toHaveValue("Ana");
  await expect(ats.getByText(/Te falta 1 obligatorio/)).toBeVisible();
  await ats.screenshot({ path: path.join(SALIDA, "captura-1-formulario.png") });

  // 3) Propuesta freelance armada en su cuadro.
  const freelance = await contexto.newPage();
  await freelance.goto(PROYECTO);
  await freelance.getByRole("button", { name: "Armar propuesta con EmpleaTech" }).click();
  await expect(freelance.locator("#bid")).toHaveValue(/Node\.js/);
  await freelance.screenshot({ path: path.join(SALIDA, "captura-2-propuesta.png") });
});
