import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, type Locator, type Page } from "@playwright/test";
import { expect, test } from "./base";

/**
 * Video promocional de la ficha (1280×720, para YouTube): la extensión de verdad, con datos ficticios (Ana Torres, Acme
 * Pagos) y páginas de vacantes de muestra. Rótulos numerados y un cursor visible para seguir cada clic.
 * Sale en extension/tienda/video-promocional.webm.
 */
const SALIDA = path.resolve(__dirname, "..", "extension", "tienda");
const DIST = path.resolve(__dirname, "..", "extension", "dist");
const TAMANO = { width: 1280, height: 720 };

const NEGRO = "#0e0e0e";
const NARANJA = "#ff4f1a";
const PAPEL = "#f3f3ef";

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
  main { max-width: 640px; margin: 24px 48px; background: #fff; border: 1px solid #e3e6eb; border-radius: 8px; padding: 24px 32px; }
  h1 { margin: 0 0 4px; font-size: 24px; } .sub { color: #5b6475; margin: 0 0 16px; }
  label { display: block; font-weight: 600; margin: 12px 0 6px; font-size: 14px; }
  input, select, textarea { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid #c9ced8; border-radius: 6px; font: inherit; background: #fff; }
  .doble { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }
  button[type=submit], .enviar { margin-top: 18px; padding: 11px 20px; border: 0; border-radius: 6px; background: #1d2433; color: #fff; font-weight: 700; cursor: pointer; }
</style>`;

const FORMULARIO = "https://jobs.lever.co/acme-pagos/senior-backend";
const HTML_FORMULARIO = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Senior Backend Developer - Acme Pagos</title>${ESTILO}</head><body>
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
const HTML_GRACIAS = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Thank you</title>${ESTILO}</head><body>
<header>Acme Pagos · Careers</header><main><h1>Thank you for applying to Acme Pagos!</h1><p class="sub">We will review your application and get back to you soon.</p></main></body></html>`;

const PROYECTO = "https://www.freelancer.com/projects/nodejs/payments-api-online-store";
const HTML_PROYECTO = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Payments API for an online store</title>${ESTILO}</head><body>
<header>Projects</header>
<main><h1>Payments API for an online store</h1><p class="sub">Budget $750 – $1,500 USD · Node.js · PostgreSQL · Docker</p>
<p>We are looking for a developer to build a Node.js REST API with PostgreSQL and Docker that charges cards for our online store. You will work with our team.</p>
<form><label for="bid">Describe your proposal</label><textarea id="bid" rows="10" maxlength="1500"></textarea><button type="button" class="enviar">Place Bid</button></form>
</main></body></html>`;

const logo = (lado: number) => `<svg width="${lado}" height="${lado}" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <rect width="32" height="32" fill="${NEGRO}"/><path d="M16 7 L26 25.5 H6 Z" fill="none" stroke="${NARANJA}" stroke-width="3" stroke-linejoin="miter"/>
  <circle cx="16" cy="6.5" r="2.6" fill="${NARANJA}"/></svg>`;

const tarjeta = (cuerpo: string) => `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">
  <div style="width:1280px;height:720px;box-sizing:border-box;background:${PAPEL};border:12px solid ${NEGRO};padding:72px 88px;display:flex;flex-direction:column;justify-content:space-between;font-family:'Arial Black',Arial,sans-serif;color:${NEGRO}">
    <div style="display:flex;align-items:center;gap:22px">${logo(84)}<span style="font-size:50px;letter-spacing:-2px;text-transform:uppercase">EmpleaTech</span></div>
    ${cuerpo}
  </div></body></html>`;

const PORTADA = tarjeta(`
  <div style="font-size:66px;line-height:1.05;letter-spacing:-2.6px;white-space:nowrap">Tu postulación, lista.<br><span style="color:#b43a0b">Del proceso nos encargamos.</span></div>
  <div style="font:600 24px/1.3 Consolas,'Courier New',monospace;letter-spacing:2px;text-transform:uppercase;color:#555">Extensión para Chrome · Empleo y freelance</div>`);

const CIERRE = tarjeta(`
  <div style="font-size:96px;line-height:1;letter-spacing:-4px">empleatech.site</div>
  <div style="font:600 24px/1.4 Consolas,'Courier New',monospace;letter-spacing:2px;text-transform:uppercase;color:#555">Gratis · Tú revisas, tú envías · Nunca envía por ti</div>`);

/** Un cursor visible (el video no graba el del sistema): sigue al mouse y se encoge al hacer clic. */
function cursorVisible() {
  const poner = () => {
    if (document.getElementById("cursor-demo")) return;
    const c = document.createElement("div");
    c.id = "cursor-demo";
    c.style.cssText =
      "position:fixed;left:-50px;top:-50px;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;background:rgba(255,79,26,.3);border:3px solid #ff4f1a;z-index:2147483647;pointer-events:none;transition:transform .1s";
    document.documentElement.appendChild(c);
    addEventListener("mousemove", (e) => {
      c.style.left = `${e.clientX}px`;
      c.style.top = `${e.clientY}px`;
    }, true);
    addEventListener("mousedown", () => (c.style.transform = "scale(.6)"), true);
    addEventListener("mouseup", () => (c.style.transform = ""), true);
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", poner);
  else poner();
}

let ultimo = { x: 640, y: 360 };

/** Lleva el cursor despacio al centro del elemento (y lo deja ahí para el clic). */
async function llevar(page: Page, objetivo: Locator) {
  await objetivo.scrollIntoViewIfNeeded();
  const caja = await objetivo.boundingBox();
  if (!caja) throw new Error("sin caja para el cursor");
  await page.mouse.move(ultimo.x, ultimo.y);
  ultimo = { x: caja.x + caja.width / 2, y: caja.y + caja.height / 2 };
  await page.mouse.move(ultimo.x, ultimo.y, { steps: 25 });
  await page.waitForTimeout(250);
}

async function clic(page: Page, objetivo: Locator) {
  await llevar(page, objetivo);
  await objetivo.click();
}

/** Rótulo del paso, arriba a la derecha, con la marca. */
async function rotulo(page: Page, numero: string, texto: string) {
  await page.evaluate(
    ([n, t]) => {
      document.getElementById("rotulo-demo")?.remove();
      const r = document.createElement("div");
      r.id = "rotulo-demo";
      r.style.cssText =
        "position:fixed;right:24px;top:20px;z-index:2147483646;background:#0e0e0e;color:#f3f3ef;padding:14px 22px;font:700 22px/1.25 system-ui,sans-serif;box-shadow:6px 6px 0 #ff4f1a;max-width:520px";
      const num = document.createElement("span");
      num.textContent = n;
      num.style.cssText = "color:#ff4f1a;margin-right:12px";
      r.append(num, t);
      document.documentElement.appendChild(r);
    },
    [numero, texto],
  );
}

test("video promocional de la ficha", async ({ page, baseURL }) => {
  test.setTimeout(180_000);
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

  const carpeta = path.join(os.tmpdir(), `empleatech-video-${Date.now()}`);
  const contexto = await chromium.launchPersistentContext(path.join(carpeta, "perfil"), {
    channel: "chromium",
    viewport: TAMANO,
    recordVideo: { dir: path.join(carpeta, "video"), size: TAMANO },
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  await contexto.addInitScript(cursorVisible);
  await contexto.route(`${FORMULARIO}/thanks**`, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: HTML_GRACIAS }));
  await contexto.route(FORMULARIO, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: HTML_FORMULARIO }));
  await contexto.route(PROYECTO, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: HTML_PROYECTO }));

  // Una sola pestaña de principio a fin: un solo video.
  const v = contexto.pages()[0] ?? (await contexto.newPage());
  try {
    // Portada.
    await v.setContent(PORTADA);
    await v.waitForTimeout(3500);

    // 1) Conectar desde la app.
    await v.goto(`${baseURL}/autollenado`);
    const conectar = v.getByRole("button", { name: "Conectar la extensión" });
    await expect(conectar).toBeVisible();
    // Los pasos para cargarla a mano no van en el video: publicada, esa lista dice «Instálala desde la tienda».
    await v.locator("main ol").evaluate((el) => (el.style.visibility = "hidden"));
    // La tarjeta al centro, para que se vea también el aviso de «Conectada».
    await conectar.evaluate((el) => el.closest("section, div")?.scrollIntoView({ block: "center" }));
    await rotulo(v, "1", "Conéctala a tu cuenta con un clic");
    await v.waitForTimeout(1200);
    await clic(v, conectar);
    const conectada = v.getByText("Conectada a", { exact: false });
    await expect(conectada).toBeVisible();
    // En producción dice la dirección de tu cuenta; aquí la app de prueba corre en localhost.
    await conectada.evaluate((el) => (el.textContent = (el.textContent ?? "").replace(/https?:\/\/[^\s.]+(:\d+)?/, "https://empleatech.site")));
    await v.waitForTimeout(2200);

    // 2) Formulario de una vacante.
    await v.goto(FORMULARIO);
    await rotulo(v, "2", "Abre la vacante y pulsa «Llenar con EmpleaTech»");
    await v.waitForTimeout(1500);
    await clic(v, v.getByRole("button", { name: "Llenar con EmpleaTech" }));
    await expect(v.locator("#first_name")).toHaveValue("Ana");
    await expect(v.getByText(/Te falta 1 obligatorio/)).toBeVisible();
    await rotulo(v, "3", "Llena tus datos, adjunta tu CV y marca lo que falta");
    await v.waitForTimeout(3500);

    // 3) Lo que falta lo contestas tú, y el envío también.
    await rotulo(v, "4", "Lo que falta lo contestas tú… y el envío también");
    await llevar(v, v.locator("#q3"));
    await v.locator("#q3").selectOption("LinkedIn");
    await v.waitForTimeout(800);
    await clic(v, v.getByRole("button", { name: "Volver a revisar" }));
    await expect(v.getByText(/Todo lo obligatorio está listo/)).toBeVisible();
    await v.waitForTimeout(1800);
    await clic(v, v.getByRole("button", { name: "Submit application" }));
    await expect(v.getByText("Registrada en tu tracker: Senior Backend Developer en Acme Pagos.")).toBeVisible({ timeout: 15_000 });
    await rotulo(v, "5", "Se registra sola en tu seguimiento");
    await v.waitForTimeout(3000);

    // 4) Propuesta freelance.
    await v.goto(PROYECTO);
    await rotulo(v, "6", "En proyectos freelance, arma tu propuesta");
    await v.waitForTimeout(1500);
    await clic(v, v.getByRole("button", { name: "Armar propuesta con EmpleaTech" }));
    await expect(v.locator("#bid")).toHaveValue(/Node\.js/);
    await v.waitForTimeout(4000);

    // Cierre (en una página en blanco: ahí no corre ningún script de la extensión).
    await v.goto("about:blank");
    await v.setContent(CIERRE);
    await v.waitForTimeout(3500);
  } finally {
    const video = v.video();
    await contexto.close();
    if (video) await fs.copyFile(await video.path(), path.join(SALIDA, "video-promocional.webm"));
  }
});
