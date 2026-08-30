const { test, expect } = require("@playwright/test");

const SUPABASE_CDN = "**/supabase-js@2";

async function mockSupabase(page) {
  await page.route(SUPABASE_CDN, (route) => route.fulfill({
    contentType: "application/javascript",
    body: `
      window.supabase = {
        createClient() {
          const query = {
            select() { return this; },
            eq() { return this; },
            not() { return this; },
            order() { return Promise.resolve({ data: [], error: null }); },
            insert() { return Promise.resolve({ data: [], error: null }); },
            update() { return this; },
            delete() { return this; },
            maybeSingle() { return Promise.resolve({ data: null, error: null }); }
          };
          return {
            from() { return Object.create(query); },
            functions: { invoke() { return Promise.resolve({ data: { ok: true, cumpleanerasHoy: [] }, error: null }); } },
            storage: { from() { return { upload() { return Promise.resolve({ error: null }); }, getPublicUrl(path) { return { data: { publicUrl: path } }; } }; } },
            auth: {
              getSession() { return Promise.resolve({ data: { session: null }, error: null }); },
              signInWithPassword() { return Promise.resolve({ error: null }); },
              signOut() { return Promise.resolve({ error: null }); },
              resetPasswordForEmail() { return Promise.resolve({ error: null }); }
            }
          };
        }
      };
    `
  }));
}

test.beforeEach(async ({ page }) => {
  await mockSupabase(page);
});

for (const viewport of [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 768, height: 900 },
  { width: 1440, height: 1000 }
]) {
  test(`public site fits ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/index.html");
    await expect(page.locator("h1").first()).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth
    }));
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
  });
}

test("join and donation modals open and close", async ({ page }) => {
  await page.goto("/index.html");

  await page.locator("#openJoinModalHero").click();
  await expect(page.locator("#joinModal")).toHaveClass(/open/);
  await page.locator("#closeJoinModal").click();
  await expect(page.locator("#joinModal")).not.toHaveClass(/open/);

  await page.route("**/donate-sdk.js", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `
      window.PayPal = {
        Donation: {
          Button() {
            return { render(selector) { document.querySelector(selector).textContent = "PayPal listo"; } };
          }
        }
      };
    `
  }));
  await page.locator("#openDonateModal").click();
  await expect(page.locator("#donateModal")).toHaveClass(/open/);
  await expect(page.locator("#donate-button")).toContainText("PayPal listo");
});

test("external media is deferred", async ({ page }) => {
  await page.goto("/index.html");

  const initial = await page.evaluate(() => ({
    paypal: Array.from(document.scripts).some((script) => script.src.includes("paypalobjects")),
    soundcloud: Array.from(document.scripts).some((script) => script.src.includes("w.soundcloud.com/player/api.js")),
    iframe: document.querySelector("#soundcloudWidget")?.getAttribute("src")
  }));
  expect(initial).toEqual({ paypal: false, soundcloud: false, iframe: null });
});

test("an empty YouTube catalog stays empty", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page.locator("#ytGrid .yt-card")).toHaveCount(0);
});

test("contact verification appears immediately before submit", async ({ page }) => {
  await page.goto("/index.html");

  const order = await page.locator("#contactForm").evaluate((form) =>
    Array.from(form.children).map((element) => element.id)
  );
  expect(order.indexOf("contactTurnstile")).toBe(order.indexOf("cSubmitBtn") - 1);

  const visualOrder = await page.evaluate(() => ({
    messageBottom: document.getElementById("cMensaje").getBoundingClientRect().bottom,
    turnstileTop: document.getElementById("contactTurnstile").getBoundingClientRect().top,
    turnstileBottom: document.getElementById("contactTurnstile").getBoundingClientRect().bottom,
    submitTop: document.getElementById("cSubmitBtn").getBoundingClientRect().top
  }));
  expect(visualOrder.turnstileTop).toBeGreaterThanOrEqual(visualOrder.messageBottom);
  expect(visualOrder.submitTop).toBeGreaterThanOrEqual(visualOrder.turnstileBottom);
});

test("mission and values copy is justified on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/index.html");
  await page.locator("#openVisionModal").click();

  await expect(page.locator("#visionModal")).toHaveClass(/open/);
  const alignment = await page.evaluate(() => ({
    paragraph: getComputedStyle(document.querySelector("#visionModal .modal-content > p")).textAlign,
    value: getComputedStyle(document.querySelector("#visionModal .modal-values-list li")).textAlign
  }));
  expect(alignment).toEqual({ paragraph: "justify", value: "justify" });
});

test("mission and vision paragraphs begin with an indent", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator("#openVisionModal").click();

  const indents = await page.locator("#visionModal .modal-content h3 + p").evaluateAll((paragraphs) =>
    paragraphs.map((paragraph) => parseFloat(getComputedStyle(paragraph).textIndent))
  );
  expect(indents).toHaveLength(2);
  indents.forEach((indent) => expect(indent).toBeGreaterThan(0));
});

test("mobile timeline shows every year in a vertical list", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/index.html");

  const years = page.locator("#timeline .timeline-step .year");
  await expect(years).toHaveCount(4);
  await expect(years).toHaveText(["2023", "2024", "2025", "2026"]);
  for (let index = 0; index < 4; index += 1) {
    await expect(years.nth(index)).toBeVisible();
  }

  const layout = await page.locator("#timeline .timeline-horizontal").evaluate((timeline) => ({
    overflowX: getComputedStyle(timeline).overflowX,
    columns: getComputedStyle(timeline).gridTemplateColumns,
    width: timeline.getBoundingClientRect().width,
    scrollWidth: timeline.scrollWidth
  }));
  expect(layout.overflowX).toBe("visible");
  expect(layout.scrollWidth).toBeLessThanOrEqual(Math.ceil(layout.width));
});

test("join image overlay copy remains white", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/index.html");

  const colors = await page.evaluate(() => ({
    title: getComputedStyle(document.querySelector(".join-image-overlay span")).color,
    copy: getComputedStyle(document.querySelector(".join-image-overlay p")).color
  }));
  expect(colors).toEqual({ title: "rgb(255, 255, 255)", copy: "rgb(255, 255, 255)" });
});

test("layout hides the decorative background watermark", async ({ page }) => {
  await page.goto("/index.html");

  const watermarkDisplay = await page.evaluate(() => getComputedStyle(document.body, "::before").display);
  expect(watermarkDisplay).toBe("none");
});

test("image uploads are converted and resized", async ({ page }) => {
  await page.goto("/admin.html");

  const result = await page.evaluate(async () => {
    const response = await fetch("assets/images/IMG_8287.jpeg");
    const blob = await response.blob();
    const original = new File([blob], "Prueba.jpeg", { type: blob.type });
    const optimized = await window.McpSupabase.optimizeImageForUpload(original, "eventos");
    const bitmap = await createImageBitmap(optimized);
    const output = {
      type: optimized.type,
      size: optimized.size,
      originalSize: original.size,
      width: bitmap.width,
      height: bitmap.height
    };
    bitmap.close();
    return output;
  });

  expect(result.type).toBe("image/webp");
  expect(result.size).toBeLessThan(result.originalSize);
  expect(result.width).toBeLessThanOrEqual(512);
  expect(result.height).toBeLessThanOrEqual(512);
});

test("dashboard layout is responsive without a live session", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/dashboard.html");
  await page.evaluate(() => {
    document.getElementById("dashboardAccessScreen").style.display = "none";
    document.getElementById("pdfArea").style.display = "block";
    renderTable([{
      nombreCompleto: "Ana Martinez",
      email: "ana@example.com",
      telefono: "+352 621 000",
      paisResidencia: "Luxemburgo",
      comunidad: "Europa",
      cristiana: "Sí",
      timestamp: "2026-07-29"
    }]);
  });

  await expect(page.locator(".user-row")).toHaveCount(1);
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > window.innerWidth
  );
  expect(overflow).toBe(false);
});
