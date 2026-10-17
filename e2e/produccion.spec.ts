import { expect, test } from "./base";
import { CV_LINEAS, OFERTA_TEXTO, crearDocx, crearPdf } from "./archivos";

test.describe("cabeceras de seguridad", () => {
  test("todas las páginas las envían, con CSP restrictiva", async ({ request }) => {
    for (const ruta of ["/", "/panel", "/cv"]) {
      const h = (await request.get(ruta)).headers();
      expect(h["x-content-type-options"], ruta).toBe("nosniff");
      expect(h["x-frame-options"]).toBe("DENY");
      expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(h["permissions-policy"]).toContain("camera=()");
      expect(h["strict-transport-security"]).toContain("max-age=");
      expect(h["x-powered-by"]).toBeUndefined();
      const csp = h["content-security-policy"];
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("connect-src 'self'");
      expect(csp).not.toMatch(/script-src[^;]*https?:/);
    }
  });

  test("el service worker no se cachea", async ({ request }) => {
    const r = await request.get("/sw.js");
    expect(r.headers()["cache-control"]).toContain("no-cache");
    expect(r.headers()["content-type"]).toContain("javascript");
  });

  test("importar PDF y DOCX, analizar y guardar no viola la CSP", async ({ page }) => {
    const violaciones: string[] = [];
    page.on("console", (m) => {
      if (/Content Security Policy|Refused to/i.test(m.text())) violaciones.push(m.text());
    });
    page.on("pageerror", (e) => violaciones.push(`pageerror: ${e.message}`));

    await page.goto("/cv");
    await page.getByRole("button", { name: "Subir mi CV" }).click();
    await page.locator("input[type=file]").setInputFiles({ name: "cv.pdf", mimeType: "application/pdf", buffer: crearPdf(CV_LINEAS.map((texto, i) => ({ texto, x: 50, y: 720 - i * 18 }))) });
    await expect(page.getByText(/Leído cv\.pdf/)).toBeVisible();
    await page.locator("input[type=file]").setInputFiles({ name: "cv.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: crearDocx(["Ana Torres", "Node.js y PostgreSQL con más de cinco años de experiencia."]) });
    await expect(page.getByText(/Leído cv\.docx/)).toBeVisible();
    await page.getByRole("button", { name: "Guardar CV" }).click();
    // Con el CV ya en la copia local, la siguiente carga no debe tener errores de hidratación.
    await expect(page.getByText("CV guardado.")).toBeVisible();

    await page.goto("/analizar");
    await page.getByLabel("Texto de la oferta").fill(OFERTA_TEXTO);
    await expect(page.getByRole("img", { name: /Afinidad \d+ de 100/ })).toBeVisible();
    expect(violaciones).toEqual([]);
  });
});

test.describe("PWA", () => {
  test("manifest válido e íconos PNG reales", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.ok()).toBe(true);
    const m = await res.json();
    expect(m).toMatchObject({ short_name: "EmpleaTech", display: "standalone", start_url: "/panel", lang: "es" });
    const tamanos = m.icons.map((i: { sizes: string }) => i.sizes);
    expect(tamanos).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(m.icons.some((i: { purpose: string }) => i.purpose === "maskable")).toBe(true);
    for (const icono of m.icons as { src: string }[]) {
      const r = await request.get(icono.src);
      expect(r.status(), icono.src).toBe(200);
      expect(r.headers()["content-type"]).toBe("image/png");
      const bytes = await r.body();
      expect([...bytes.subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
    }
  });

  test("imagen para compartir, robots y sitemap", async ({ request }) => {
    const og = await request.get("/opengraph-image");
    expect(og.status()).toBe(200);
    expect(og.headers()["content-type"]).toBe("image/png");
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Disallow: /postulaciones");
    expect(robots).toContain("Sitemap:");
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toContain("/inteligencia");
    expect(sitemap).not.toContain("/postulaciones");
  });

  test("metadatos de la página de inicio", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/EmpleaTech/);
    expect(await page.locator('meta[property="og:image"]').getAttribute("content")).toContain("/opengraph-image");
    expect(await page.locator('meta[name="theme-color"]').getAttribute("content")).toBe("#f3f3ef");
    expect(await page.locator("html").getAttribute("lang")).toBe("es");
  });

  test("funciona sin conexión después de la primera visita", async ({ page, context }) => {
    await page.goto("/panel");
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(async () => {
      const c = await caches.open("empleatech-v1");
      return (await c.keys()).length >= 6;
    });

    await context.setOffline(true);
    await page.goto("/analizar");
    await expect(page.getByRole("heading", { name: "Analizar una oferta" })).toBeVisible();
    await expect(page.getByText(/Sin internet/)).toBeVisible();

    await page.getByRole("button", { name: "Cargar ejemplo" }).click();
    await expect(page.getByRole("img", { name: /Afinidad \d+ de 100/ })).toBeVisible();

    await page.goto("/cv");
    await expect(page.getByRole("heading", { name: "Mi CV" })).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByText(/Sin internet/)).toHaveCount(0);
  });
});

