import { chromium, Page, Frame } from "playwright";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeText(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function ensureTmpDir() {
  const dir = path.join(process.cwd(), "tmp");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function savePageArtifacts(page: Page, name: string, debug: string[]) {
  try {
    const dir = ensureTmpDir();
    const png = path.join(dir, `${name}.png`);
    const html = path.join(dir, `${name}.html`);
    await page.screenshot({ path: png, fullPage: true });
    fs.writeFileSync(html, await page.content(), "utf8");
    debug.push(`Screenshot: ${png}`);
    debug.push(`HTML: ${html}`);
  } catch {
    debug.push(`No pude guardar artefactos de ${name}`);
  }
}

async function saveFrameArtifacts(frame: Frame, name: string, debug: string[]) {
  try {
    const dir = ensureTmpDir();
    const html = path.join(dir, `${name}.html`);
    fs.writeFileSync(html, await frame.content(), "utf8");
    debug.push(`Frame HTML: ${html}`);
  } catch {
    debug.push(`No pude guardar html de frame ${name}`);
  }
}

async function fillFirstVisible(page: Page, selectors: string[], value: string) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count()) {
      try {
        await locator.waitFor({ state: "visible", timeout: 2500 });
        await locator.fill(value);
        return true;
      } catch {}
    }
  }
  return false;
}

async function clickFirstVisible(page: Page, selectors: string[]) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count()) {
      try {
        await locator.waitFor({ state: "visible", timeout: 2500 });
        await locator.click();
        return true;
      } catch {}
    }
  }
  return false;
}

async function clickText(page: Page, text: string, debug: string[], exact = false) {
  const locator = page.getByText(text, { exact }).first();
  if (!(await locator.count())) {
    debug.push(`No encontré texto "${text}"`);
    return false;
  }

  try {
    await locator.waitFor({ state: "visible", timeout: 5000 });
    await locator.click();
    debug.push(`Click en "${text}"`);
    return true;
  } catch {
    debug.push(`Encontré "${text}" pero no pude hacer click`);
    return false;
  }
}

async function clickLinkByText(page: Page, text: string, debug: string[]) {
  const candidates = [
    page.getByRole("link", { name: new RegExp(`^${text}$`, "i") }).first(),
    page.getByRole("link", { name: new RegExp(text, "i") }).first(),
    page.locator("a", { hasText: text }).first(),
  ];

  for (const locator of candidates) {
    try {
      if (await locator.count()) {
        await locator.waitFor({ state: "visible", timeout: 5000 });
        await locator.click();
        debug.push(`Click link "${text}"`);
        return true;
      }
    } catch {}
  }

  debug.push(`No pude clickear link "${text}"`);
  return false;
}

async function resolveLogin(page: Page, username: string, password: string, debug: string[]) {
  const bodyText = normalizeText(await page.textContent("body")).toLowerCase();

  if (
    bodyText.includes("usuario") ||
    bodyText.includes("contraseña") ||
    bodyText.includes("login") ||
    bodyText.includes("ingresar")
  ) {
    debug.push("Login detectado. Intentando autenticar...");

    const userFilled = await fillFirstVisible(
      page,
      [
        'input[name="username"]',
        'input[name="user"]',
        'input[name="login"]',
        "#username",
        "#user",
        "#login",
        'input[type="text"]',
      ],
      username
    );

    const passFilled = await fillFirstVisible(
      page,
      [
        'input[name="password"]',
        "#password",
        "#pass",
        'input[type="password"]',
      ],
      password
    );

    if (!userFilled || !passFilled) {
      throw new Error("No pude completar el login automáticamente.");
    }

    const loginClicked = await clickFirstVisible(page, [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Ingresar")',
      'button:has-text("Entrar")',
      'button:has-text("Acceder")',
      'button:has-text("Login")',
      'input[value="Login"]',
    ]);

    if (!loginClicked) {
      await page.keyboard.press("Enter");
    }

    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3500);
    debug.push("Login enviado.");
  } else {
    debug.push("No se detectó login visible.");
  }
}

async function dumpFrames(page: Page, debug: string[]) {
  const frames = page.frames();
  debug.push(`Frames detectados: ${frames.length}`);

  for (let i = 0; i < frames.length; i++) {
    try {
      const txt = normalizeText(await frames[i].textContent("body"));
      debug.push(
        `Frame[${i}] url=${frames[i].url().slice(0, 140)} | texto=${txt.slice(0, 220)}`
      );
    } catch {
      debug.push(`Frame[${i}] no legible`);
    }
  }
}

async function getDmsFrame(page: Page, debug: string[]) {
  await page.waitForTimeout(2500);

  const frames = page.frames();
  let best: Frame | null = null;
  let bestScore = -1;

  for (const frame of frames) {
    try {
      const txt = normalizeText(await frame.textContent("body")).toLowerCase();
      let score = 0;

      if (txt.includes("planificación") || txt.includes("planificacion")) score += 5;
      if (txt.includes("consultas")) score += 2;
      if (txt.includes("modo contingencia")) score += 2;
      if (txt.includes("supervisión") || txt.includes("supervision")) score += 2;
      if (txt.includes("dms")) score += 2;
      if (txt.includes("permisos de trabajo")) score += 5;
      if (txt.length > 120) score += 1;

      if (score > bestScore) {
        bestScore = score;
        best = frame;
      }
    } catch {}
  }

  if (best) {
    debug.push(`Frame DMS seleccionado: ${best.url().slice(0, 160)}`);
    await saveFrameArtifacts(best, "04b_dms_frame", debug);
  } else {
    debug.push("No logré seleccionar frame DMS.");
  }

  return best;
}

async function clickPlanificacionInFrame(frame: Frame, debug: string[]) {
  const candidates = [
    frame.getByText("Planificación", { exact: false }).first(),
    frame.getByText("Planificacion", { exact: false }).first(),
    frame.locator("a, span, div, td").filter({ hasText: "Planificación" }).first(),
    frame.locator("a, span, div, td").filter({ hasText: "Planificacion" }).first(),
  ];

  for (const locator of candidates) {
    try {
      if (await locator.count()) {
        await locator.waitFor({ state: "visible", timeout: 6000 });
        await locator.click();
        debug.push('Click en "Planificación" dentro del frame DMS');
        return true;
      }
    } catch {}
  }

  debug.push('No pude hacer click en "Planificación" dentro del frame DMS');
  return false;
}

async function clickPermisosTrabajoInFrame(frame: Frame, debug: string[]) {
  const candidates = [
    frame.getByText("Permisos de trabajo", { exact: false }).first(),
    frame.locator("a, span, div, td").filter({ hasText: "Permisos de trabajo" }).first(),
  ];

  for (const locator of candidates) {
    try {
      if (await locator.count()) {
        await locator.waitFor({ state: "visible", timeout: 6000 });
        await locator.click();
        debug.push('Click en "Permisos de trabajo" dentro del menú');
        return true;
      }
    } catch {}
  }

  debug.push('No pude hacer click en "Permisos de trabajo" dentro del menú');
  return false;
}

async function navigateToPermisosTrabajo(page: Page, debug: string[]) {
  debug.push("Paso 1: Aplicaciones");
  const okAplicaciones = await clickText(page, "Aplicaciones", debug, false);
  if (!okAplicaciones) {
    throw new Error('No pude hacer click en "Aplicaciones".');
  }

  await page.waitForTimeout(2200);
  await savePageArtifacts(page, "03_aplicaciones", debug);

  debug.push("Paso 2: DMS");
  let okDms = await clickLinkByText(page, "DMS", debug);
  if (!okDms) okDms = await clickText(page, "DMS", debug, false);

  if (!okDms) {
    throw new Error('No pude hacer click en "DMS".');
  }

  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(3500);
  await savePageArtifacts(page, "04_dms", debug);
  await dumpFrames(page, debug);

  debug.push("Paso 3: identificar frame DMS");
  const dmsFrame = await getDmsFrame(page, debug);
  if (!dmsFrame) {
    throw new Error("No pude identificar el frame del módulo DMS.");
  }

  debug.push("Paso 4: Planificación");
  const okPlanificacion = await clickPlanificacionInFrame(dmsFrame, debug);
  if (!okPlanificacion) {
    throw new Error('No pude hacer click en "Planificación".');
  }

  await page.waitForTimeout(1800);
  await savePageArtifacts(page, "05_planificacion_menu", debug);
  await saveFrameArtifacts(dmsFrame, "05b_planificacion_menu_frame", debug);

  debug.push("Paso 5: Permisos de trabajo");
  const okPermisos = await clickPermisosTrabajoInFrame(dmsFrame, debug);
  if (!okPermisos) {
    throw new Error('No pude hacer click en "Permisos de trabajo".');
  }

  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await savePageArtifacts(page, "06_permisos_trabajo", debug);
  await dumpFrames(page, debug);
}

async function hasCreateButton(page: Page) {
  for (const frame of page.frames()) {
    try {
      const found = await frame.evaluate(() => {
        const text = (document.body?.innerText || "").replace(/\s+/g, " ").trim();
        return text.includes("Crear") && text.includes("Permisos de trabajo");
      });

      if (found) return true;
    } catch {}
  }
  return false;
}

async function clickCrearButton(page: Page, debug: string[]) {
  const tryLocators = async (frame: Frame) => {
    const candidates = [
      frame.getByText("Crear", { exact: true }).first(),
      frame.getByRole("button", { name: /crear/i }).first(),
      frame.locator("button, a, span, div, td").filter({ hasText: "Crear" }).first(),
      frame.locator(".x-btn-text").filter({ hasText: "Crear" }).first(),
      frame.locator(".x-btn").filter({ hasText: "Crear" }).first(),
    ];

    for (const locator of candidates) {
      try {
        if (await locator.count()) {
          await locator.waitFor({ state: "visible", timeout: 4000 });
          await locator.click({ force: true });
          debug.push('Click en botón "Crear"');
          return true;
        }
      } catch {}
    }

    return false;
  };

  for (const frame of page.frames()) {
    try {
      const txt = normalizeText(await frame.textContent("body")).toLowerCase();
      if (!txt.includes("permisos de trabajo")) continue;

      const ok = await tryLocators(frame);
      if (ok) return true;
    } catch {}
  }

  debug.push('No pude hacer click en el botón "Crear".');
  return false;
}

async function waitForCreateWindow(page: Page, debug: string[]) {
  const start = Date.now();

  while (Date.now() - start < 12000) {
    for (const frame of page.frames()) {
      try {
        const txt = normalizeText(await frame.textContent("body")).toLowerCase();
        if (
          txt.includes("crear permiso de trabajo") &&
          txt.includes("tipo de permiso de trabajo") &&
          txt.includes("descripción del trabajo general")
        ) {
          debug.push('Ventana "Crear permiso de trabajo" detectada.');
          await saveFrameArtifacts(frame, "07_create_window_frame", debug);
          return true;
        }
      } catch {}
    }

    const pageText = normalizeText(await page.textContent("body")).toLowerCase();
    if (
      pageText.includes("crear permiso de trabajo") &&
      pageText.includes("tipo de permiso de trabajo")
    ) {
      debug.push('Ventana "Crear permiso de trabajo" detectada en page.');
      return true;
    }

    await page.waitForTimeout(500);
  }

  debug.push('No apareció la ventana "Crear permiso de trabajo".');
  return false;
}

export async function POST(req: Request) {
  const debug: string[] = [];
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  let page: Page | null = null;

  try {
    const body = await req.json();
    const username = String(body?.username || "").trim();
    const password = String(body?.password || "").trim();

    if (!username || !password) {
      return Response.json(
        { error: "Debes ingresar usuario y contraseña." },
        { status: 400 }
      );
    }

    ensureTmpDir();

    browser = await chromium.launch({
      headless: false,
      slowMo: 350,
    });

    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1700, height: 1000 },
    });

    page = await context.newPage();

    debug.push("Entrando a Centrality...");
    await page.goto("https://stx.saesa.cl:8091/backend/sts/centrality.php", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    await page.waitForTimeout(2500);
    await savePageArtifacts(page, "01_inicio", debug);

    await resolveLogin(page, username, password, debug);
    await savePageArtifacts(page, "02_post_login", debug);

    await dumpFrames(page, debug);
    await navigateToPermisosTrabajo(page, debug);

    debug.push("Validando pantalla de Permisos de trabajo...");
    const canCreate = await hasCreateButton(page);
    if (!canCreate) {
      await savePageArtifacts(page, "06b_no_create_button", debug);
      throw new Error('Llegué a Permisos de trabajo, pero no encontré el botón "Crear".');
    }

    debug.push('Paso 6: click en "Crear"');
    const okCrear = await clickCrearButton(page, debug);
    if (!okCrear) {
      await savePageArtifacts(page, "06c_click_create_failed", debug);
      throw new Error('No pude hacer click en el botón "Crear".');
    }

    await page.waitForTimeout(2500);
    await savePageArtifacts(page, "07_post_create_click", debug);
    await dumpFrames(page, debug);

    debug.push("Paso 7: esperar ventana de creación");
    const createWindowDetected = await waitForCreateWindow(page, debug);
    if (!createWindowDetected) {
      await savePageArtifacts(page, "07b_create_window_not_found", debug);
      throw new Error('Hice click en "Crear", pero no apareció la ventana "Crear permiso de trabajo".');
    }

    await savePageArtifacts(page, "08_create_window_ok", debug);

    return Response.json({
      ok: true,
      message: 'Flujo completado hasta abrir "Crear permiso de trabajo".',
      debug,
    });
  } catch (error: any) {
    if (page) {
      await savePageArtifacts(page, "99_error", debug).catch(() => {});
      await dumpFrames(page, debug).catch(() => {});
      const frames = page.frames();
      if (frames.length > 0) {
        await saveFrameArtifacts(frames[frames.length - 1], "99_error_best_frame", debug).catch(() => {});
      }
    }

    if (browser) {
      await browser.close().catch(() => {});
    }

    return Response.json(
      {
        error: error?.message || "Error inesperado al abrir creación de PT.",
        debug,
      },
      { status: 500 }
    );
  }
}
