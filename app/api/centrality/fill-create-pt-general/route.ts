import { chromium, Page, Frame, Locator } from "playwright";
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
      ['input[name="password"]', "#password", "#pass", 'input[type="password"]'],
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

async function waitForCreateWindowFrame(page: Page, debug: string[]) {
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
          return frame;
        }
      } catch {}
    }

    await page.waitForTimeout(500);
  }

  debug.push('No apareció la ventana "Crear permiso de trabajo".');
  return null;
}

async function getOrderedVisibleInputs(frame: Frame, debug: string[]) {
  const inputs = frame.locator("input, textarea");
  const count = await inputs.count();

  const list: Array<{
    locator: Locator;
    box: { x: number; y: number; width: number; height: number };
    tag: string;
    type: string;
  }> = [];

  for (let i = 0; i < count; i++) {
    const locator = inputs.nth(i);
    const box = await locator.boundingBox().catch(() => null);
    if (!box) continue;
    if (box.width < 40 || box.height < 16) continue;

    const tag = await locator.evaluate((el) => el.tagName.toLowerCase()).catch(() => "");
    const type =
      (await locator
        .evaluate((el: HTMLInputElement | HTMLTextAreaElement) =>
          "type" in el ? (el.type || "").toLowerCase() : ""
        )
        .catch(() => "")) || "";

    list.push({
      locator,
      box,
      tag,
      type,
    });
  }

  list.sort((a, b) => {
    if (Math.abs(a.box.y - b.box.y) > 8) return a.box.y - b.box.y;
    return a.box.x - b.box.x;
  });

  debug.push(`Inputs visibles ordenados detectados: ${list.length}`);
  list.slice(0, 20).forEach((item, idx) => {
    debug.push(
      `Input[${idx}] tag=${item.tag} type=${item.type} x=${Math.round(item.box.x)} y=${Math.round(
        item.box.y
      )} w=${Math.round(item.box.width)} h=${Math.round(item.box.height)}`
    );
  });

  return list;
}

async function selectAutocompleteValue(
  frame: Frame,
  input: Locator,
  textToType: string,
  optionText: string,
  debug: string[],
  debugName: string
) {
  const page = frame.page();

  await input.click({ force: true });
  await input.fill("");
  await page.waitForTimeout(250);

  await input.type(textToType, { delay: 90 });
  debug.push(`Escribí ${debugName}: ${textToType}`);
  await page.waitForTimeout(1400);

  await page.keyboard.press("ArrowDown");
  debug.push(`ArrowDown en ${debugName}`);
  await page.waitForTimeout(300);

  await page.keyboard.press("Enter");
  debug.push(`Enter en ${debugName}`);
  await page.waitForTimeout(900);

  const currentValue = normalizeText(await input.inputValue().catch(() => ""));
  if (
    currentValue.toLowerCase().includes("yuri") ||
    currentValue.toLowerCase().includes(optionText.toLowerCase())
  ) {
    debug.push(`Seleccioné ${debugName} por teclado: ${currentValue}`);
    return;
  }

  const optionCandidates = [
    frame.getByText(optionText, { exact: false }).first(),
    page.getByText(optionText, { exact: false }).first(),
    frame.locator("div, td, span, li").filter({ hasText: optionText }).first(),
    page.locator("div, td, span, li").filter({ hasText: optionText }).first(),
  ];

  for (const option of optionCandidates) {
    try {
      if (await option.count()) {
        await option.waitFor({ state: "visible", timeout: 2500 });
        await option.click({ force: true });
        await page.waitForTimeout(900);

        const valueAfterClick = normalizeText(await input.inputValue().catch(() => ""));
        if (
          valueAfterClick.toLowerCase().includes("yuri") ||
          valueAfterClick.toLowerCase().includes(optionText.toLowerCase())
        ) {
          debug.push(`Seleccioné ${debugName} por click: ${valueAfterClick}`);
          return;
        }
      }
    } catch {}
  }

  throw new Error(`No pude seleccionar ${debugName} desde el desplegable.`);
}

async function selectDropdownValue(frame: Frame, valueText: string, debug: string[], debugName: string) {
  const page = frame.page();
  const candidates = [
    frame.getByText(valueText, { exact: false }).first(),
    page.getByText(valueText, { exact: false }).first(),
    frame.locator("div, td, span, li").filter({ hasText: valueText }).first(),
    page.locator("div, td, span, li").filter({ hasText: valueText }).first(),
  ];

  for (const option of candidates) {
    try {
      if (await option.count()) {
        await option.waitFor({ state: "visible", timeout: 5000 });
        await option.click({ force: true });
        debug.push(`Seleccioné ${debugName}: ${valueText}`);
        await page.waitForTimeout(700);
        return;
      }
    } catch {}
  }

  throw new Error(`No pude seleccionar ${debugName}: ${valueText}`);
}

async function openComboNearInput(frame: Frame, input: Locator, debug: string[], debugName: string) {
  const inputBox = await input.boundingBox();
  if (!inputBox) throw new Error(`No pude ubicar el campo ${debugName}.`);

  const page = frame.page();

  const tries = [
    { x: inputBox.x + inputBox.width - 10, y: inputBox.y + inputBox.height / 2 },
    { x: inputBox.x + inputBox.width - 18, y: inputBox.y + inputBox.height / 2 },
    { x: inputBox.x + inputBox.width - 26, y: inputBox.y + inputBox.height / 2 },
  ];

  for (const t of tries) {
    try {
      await page.mouse.click(t.x, t.y);
      debug.push(`Abrí combo ${debugName} en (${Math.round(t.x)}, ${Math.round(t.y)})`);
      await page.waitForTimeout(700);
      return;
    } catch {}
  }

  throw new Error(`No pude abrir combo de ${debugName}.`);
}

async function selectDropdownByKeyboardToText(
  frame: Frame,
  input: Locator,
  targetText: string,
  debug: string[],
  debugName: string
) {
  const page = frame.page();

  await openComboNearInput(frame, input, debug, debugName);
  await page.waitForTimeout(700);

  // Primero intentamos click directo sobre la opción visible
  const directCandidates = [
    frame.getByText(targetText, { exact: false }).first(),
    page.getByText(targetText, { exact: false }).first(),
    frame.locator("div, td, span, li").filter({ hasText: targetText }).first(),
    page.locator("div, td, span, li").filter({ hasText: targetText }).first(),
  ];

  for (const option of directCandidates) {
    try {
      if (await option.count()) {
        await option.waitFor({ state: "visible", timeout: 1500 });
        await option.click({ force: true });
        debug.push(`Seleccioné ${debugName} por click directo: ${targetText}`);
        await page.waitForTimeout(700);
        return;
      }
    } catch {}
  }

  // Si no funcionó, usamos teclado
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(40);
  }
  debug.push(`${debugName}: moví al inicio del listado con ArrowUp`);

  for (let i = 0; i < 20; i++) {
    const visibleText = normalizeText(await page.textContent("body").catch(() => ""));
    if (visibleText.toLowerCase().includes(targetText.toLowerCase())) {
      break;
    }
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(80);
  }

  // intento final: click sobre la opción ya visible
  for (const option of directCandidates) {
    try {
      if (await option.count()) {
        await option.waitFor({ state: "visible", timeout: 2000 });
        await option.click({ force: true });
        debug.push(`Seleccioné ${debugName} por teclado+click: ${targetText}`);
        await page.waitForTimeout(700);
        return;
      }
    } catch {}
  }

  // último recurso: bajar bastante porque sabemos que está al final
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(60);
  }

  await page.keyboard.press("Enter");
  debug.push(`Seleccioné ${debugName} con Enter al final del listado`);
  await page.waitForTimeout(900);
}

async function fillCreatePtGeneral(frame: Frame, debug: string[]) {
  const page = frame.page();

  debug.push("Iniciando llenado de pestaña General...");

  let ordered = await getOrderedVisibleInputs(frame, debug);

  if (ordered.length < 12) {
    throw new Error(`Detecté muy pocos inputs visibles en la ventana General: ${ordered.length}`);
  }

  const input = (index: number) => {
    if (!ordered[index]) {
      throw new Error(`No encontré input visible en índice ${index}.`);
    }
    return ordered[index].locator;
  };

  const solicitanteInput = input(0);
  const tipoInput = input(1);
  const estadoInstIntervenirInput = input(2);
  const instalacionInput = input(3);
  const detalleInput = input(4);
  const areaInput = input(5);
  const areaRightInput = input(6);
  const descripcionInput = input(7);
  const ubicacionInput = input(8);
  const direccionInput = input(9);
  const sectorInput = input(10);

  await selectAutocompleteValue(
    frame,
    solicitanteInput,
    "yuri",
    "Yuri Erasmo Pinto Contreras",
    debug,
    "Solicitante de PT"
  );

  await selectDropdownByKeyboardToText(
    frame,
    tipoInput,
    "SODI TERCEROS",
    debug,
    "Tipo de permiso"
  );

  debug.push("Estado instalación a intervenir: no modificado en esta prueba.");

  await instalacionInput.click({ force: true });
  await instalacionInput.fill("Paños");
  debug.push('Escribí "Paños" en Instalación a intervenir');
  await page.waitForTimeout(400);

  await detalleInput.click({ force: true });
  await detalleInput.fill("Instalacion Terceros");
  debug.push('Escribí "Instalacion Terceros" en Detalle de instalación');
  await page.waitForTimeout(400);

  await areaInput.click({ force: true });
  await areaInput.fill("Área CCT");
  debug.push('Escribí "Área CCT" en Área');
  await page.waitForTimeout(400);

  await areaRightInput.click({ force: true });
  await areaRightInput.fill("SODI TERCEROS");
  debug.push('Escribí "SODI TERCEROS" en campo derecho de Área');
  await page.waitForTimeout(400);

  await descripcionInput.click({ force: true });
  await descripcionInput.fill("prueba 01");
  debug.push('Escribí descripción: "prueba 01"');
  await page.waitForTimeout(500);

  await ubicacionInput.click({ force: true });
  await ubicacionInput.fill("LORD COCHRANE");
  debug.push('Escribí ubicación: "LORD COCHRANE"');
  await page.waitForTimeout(1500);

  const direccionValue = normalizeText(await direccionInput.inputValue().catch(() => ""));
  debug.push(`Dirección después de ubicación: ${direccionValue || "(vacía)"}`);

  await sectorInput.click({ force: true });
  await sectorInput.fill("No Aplica");
  debug.push('Escribí "No Aplica" en Sector afectado');

  ordered = await getOrderedVisibleInputs(frame, debug);

  const lowerInputs = ordered.filter((x) => x.box.y > 280 && x.box.y < 620 && x.box.width > 60);

  debug.push(`Inputs zona media-baja detectados: ${lowerInputs.length}`);

  const dateLike = lowerInputs.filter((x) => x.box.width >= 140 && x.box.width <= 260);
  const timeLike = lowerInputs.filter((x) => x.box.width >= 80 && x.box.width <= 130);

  if (dateLike.length >= 2 && timeLike.length >= 2) {
    await dateLike[0].locator.click({ force: true });
    await dateLike[0].locator.fill("20/04/2026");
    debug.push("Fecha inicio = 20/04/2026");

    await timeLike[0].locator.click({ force: true });
    await timeLike[0].locator.fill("08:00:00");
    debug.push("Hora inicio = 08:00:00");

    await dateLike[1].locator.click({ force: true });
    await dateLike[1].locator.fill("20/04/2026");
    debug.push("Fecha fin = 20/04/2026");

    await timeLike[1].locator.click({ force: true });
    await timeLike[1].locator.fill("18:00:00");
    debug.push("Hora fin = 18:00:00");
  } else {
    debug.push("No pude identificar con seguridad los 4 campos fecha/hora.");
  }

  await page.mouse.wheel(0, 700);
  await page.waitForTimeout(1000);

  ordered = await getOrderedVisibleInputs(frame, debug);

  const modificacionInput = ordered.find(
    (x) => x.box.y > 360 && x.box.y < 650 && x.box.width > 500
  )?.locator;

  const textareas = frame.locator("textarea");
  const textareaCount = await textareas.count();
  let observacionesInput: Locator | null = null;
  if (textareaCount > 0) {
    observacionesInput = textareas.last();
  }

  const visibleInputs3 = ordered.map((x) => x.locator);
  const estadoInstalacionInput =
    visibleInputs3.length >= 3 ? visibleInputs3[visibleInputs3.length - 3] : null;

  if (modificacionInput) {
    await modificacionInput.click({ force: true });
    await modificacionInput.fill("NO");
    debug.push('Escribí "NO" en Modificación al esquema eléctrico');
  } else {
    debug.push("No pude identificar Modificación al esquema eléctrico.");
  }

  if (observacionesInput) {
    await observacionesInput.click({ force: true });
    await observacionesInput.fill("trabajos por parte de terceros");
    debug.push('Escribí observaciones: "trabajos por parte de terceros"');
  } else {
    debug.push("No pude identificar Observaciones.");
  }

  if (estadoInstalacionInput) {
    try {
      await openComboNearInput(frame, estadoInstalacionInput, debug, "Estado de la instalación");
      await selectDropdownValue(frame, "5. Instalación Energizada", debug, "Estado de la instalación");
    } catch {
      debug.push('No pude seleccionar "5. Instalación Energizada".');
    }
  } else {
    debug.push("No pude identificar Estado de la instalación.");
  }

  debug.push('Dejé "Desconexión de origen externo" en valor por defecto.');
  await page.waitForTimeout(1000);
  debug.push("Pestaña General rellenada.");
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
    const createFrame = await waitForCreateWindowFrame(page, debug);
    if (!createFrame) {
      await savePageArtifacts(page, "07b_create_window_not_found", debug);
      throw new Error('Hice click en "Crear", pero no apareció la ventana "Crear permiso de trabajo".');
    }

    debug.push("Paso 8: rellenar pestaña General");
    await fillCreatePtGeneral(createFrame, debug);

    await savePageArtifacts(page, "08_general_filled", debug);
    await saveFrameArtifacts(createFrame, "08b_general_filled_frame", debug);

    return Response.json({
      ok: true,
      message: 'Pestaña "General" rellenada correctamente.',
      debug,
    });
  } catch (error: any) {
    if (page) {
      await savePageArtifacts(page, "99_error", debug).catch(() => {});
      await dumpFrames(page, debug).catch(() => {});
      const frames = page.frames();
      if (frames.length > 0) {
        await saveFrameArtifacts(frames[frames.length - 1], "99_error_best_frame", debug).catch(
          () => {}
        );
      }
    }

    if (browser) {
      await browser.close().catch(() => {});
    }

    return Response.json(
      {
        error: error?.message || "Error inesperado al rellenar General.",
        debug,
      },
      { status: 500 }
    );
  }
}