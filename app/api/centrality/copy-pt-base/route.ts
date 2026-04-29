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
        `Frame[${i}] url=${frames[i].url().slice(0, 160)} | texto=${txt.slice(0, 260)}`
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
  if (!okAplicaciones) throw new Error('No pude hacer click en "Aplicaciones".');

  await page.waitForTimeout(2200);
  await savePageArtifacts(page, "03_aplicaciones", debug);

  debug.push("Paso 2: DMS");
  let okDms = await clickLinkByText(page, "DMS", debug);
  if (!okDms) okDms = await clickText(page, "DMS", debug, false);
  if (!okDms) throw new Error('No pude hacer click en "DMS".');

  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(3500);
  await savePageArtifacts(page, "04_dms", debug);
  await dumpFrames(page, debug);

  debug.push("Paso 3: identificar frame DMS");
  const dmsFrame = await getDmsFrame(page, debug);
  if (!dmsFrame) throw new Error("No pude identificar el frame del módulo DMS.");

  debug.push("Paso 4: Planificación");
  const okPlanificacion = await clickPlanificacionInFrame(dmsFrame, debug);
  if (!okPlanificacion) throw new Error('No pude hacer click en "Planificación".');

  await page.waitForTimeout(1800);
  await savePageArtifacts(page, "05_planificacion_menu", debug);
  await saveFrameArtifacts(dmsFrame, "05b_planificacion_menu_frame", debug);

  debug.push("Paso 5: Permisos de trabajo");
  const okPermisos = await clickPermisosTrabajoInFrame(dmsFrame, debug);
  if (!okPermisos) throw new Error('No pude hacer click en "Permisos de trabajo".');

  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await savePageArtifacts(page, "06_permisos_trabajo", debug);
  await dumpFrames(page, debug);
}

async function getPermisosFrame(page: Page, debug: string[]) {
  await page.waitForTimeout(1500);

  const frames = page.frames();
  let best: Frame | null = null;
  let bestScore = -1;

  for (const frame of frames) {
    try {
      const txt = normalizeText(await frame.textContent("body")).toLowerCase();
      let score = 0;

      if (txt.includes("permisos de trabajo")) score += 8;
      if (txt.includes("crear")) score += 2;
      if (txt.includes("copiar")) score += 3;
      if (txt.includes("filtro")) score += 3;
      if (txt.includes("tipo de permiso de trabajo")) score += 2;
      if (txt.includes("descripción del trabajo general") || txt.includes("descripcion del trabajo general")) score += 2;
      if (txt.length > 150) score += 1;

      if (score > bestScore) {
        bestScore = score;
        best = frame;
      }
    } catch {}
  }

  if (best) {
    debug.push(`Frame permisos seleccionado: ${best.url().slice(0, 180)}`);
    await saveFrameArtifacts(best, "06b_permisos_frame", debug);
  }

  return best;
}

async function clickToolbarText(frame: Frame, text: string, debug: string[]) {
  const candidates = [
    frame.getByText(text, { exact: true }).first(),
    frame.getByText(text, { exact: false }).first(),
    frame.locator("button, a, span, div, td").filter({ hasText: text }).first(),
    frame.locator(".x-btn-text").filter({ hasText: text }).first(),
    frame.locator(".x-btn").filter({ hasText: text }).first(),
  ];

  for (const locator of candidates) {
    try {
      if (await locator.count()) {
        await locator.waitFor({ state: "visible", timeout: 5000 });
        await locator.click({ force: true });
        debug.push(`Click en toolbar "${text}"`);
        return true;
      }
    } catch {}
  }

  debug.push(`No pude hacer click en toolbar "${text}"`);
  return false;
}

async function waitForFiltrosFrame(page: Page, debug: string[]) {
  const start = Date.now();

  while (Date.now() - start < 12000) {
    for (const frame of page.frames()) {
      try {
        const txt = normalizeText(await frame.textContent("body")).toLowerCase();
        if (txt.includes("filtros") && txt.includes("ids de permisos de trabajo")) {
          debug.push('Ventana "Filtros" detectada.');
          await saveFrameArtifacts(frame, "07_filtros_frame", debug);
          return frame;
        }
      } catch {}
    }
    await page.waitForTimeout(500);
  }

  debug.push('No apareció la ventana "Filtros".');
  return null;
}

async function waitForCopiarFrame(page: Page, debug: string[]) {
  const start = Date.now();

  while (Date.now() - start < 12000) {
    for (const frame of page.frames()) {
      try {
        const txt = normalizeText(await frame.textContent("body")).toLowerCase();
        if (txt.includes("copiar") && txt.includes("aceptar") && txt.includes("cancelar")) {
          debug.push('Popup de "Copiar" detectado.');
          await saveFrameArtifacts(frame, "10_copiar_popup_frame", debug);
          return frame;
        }
      } catch {}
    }
    await page.waitForTimeout(500);
  }

  debug.push('No apareció el popup de "Copiar".');
  return null;
}

type VisibleInput = {
  locator: Locator;
  box: { x: number; y: number; width: number; height: number };
};

async function getVisibleInputs(frame: Frame, debug: string[]) {
  const inputs = frame.locator("input, textarea");
  const count = await inputs.count();

  const result: VisibleInput[] = [];

  for (let i = 0; i < count; i++) {
    const locator = inputs.nth(i);
    const box = await locator.boundingBox().catch(() => null);
    if (!box) continue;
    if (box.width < 60 || box.height < 14) continue;
    result.push({ locator, box });
  }

  result.sort((a, b) => {
    if (Math.abs(a.box.y - b.box.y) > 8) return a.box.y - b.box.y;
    return a.box.x - b.box.x;
  });

  debug.push(`Inputs visibles detectados: ${result.length}`);
  return result;
}

async function fillIdsPermisosField(frame: Frame, ptBase: string, debug: string[]) {
  const inputs = await getVisibleInputs(frame, debug);
  const idsInput = inputs[0]?.locator;
  if (!idsInput) throw new Error('No encontré el campo "Ids de permisos de trabajo".');

  await idsInput.click({ force: true });
  await idsInput.fill("");
  await idsInput.fill(ptBase);
  debug.push(`Escribí PT base en filtro: ${ptBase}`);
}

async function clickAplicarInFiltros(frame: Frame, debug: string[]) {
  const candidates = [
    frame.getByText("Aplicar", { exact: true }).first(),
    frame.getByText("Aplicar", { exact: false }).first(),
    frame.locator("button, a, span, div, td").filter({ hasText: "Aplicar" }).first(),
    frame.locator(".x-btn-text").filter({ hasText: "Aplicar" }).first(),
    frame.locator(".x-btn").filter({ hasText: "Aplicar" }).first(),
  ];

  for (const locator of candidates) {
    try {
      if (await locator.count()) {
        await locator.waitFor({ state: "visible", timeout: 5000 });
        await locator.click({ force: true });
        debug.push('Click en "Aplicar" dentro de filtros');
        return true;
      }
    } catch {}
  }

  debug.push('No pude hacer click en "Aplicar" dentro de filtros');
  return false;
}

async function clickLimpiarInFiltros(frame: Frame, debug: string[]) {
  const candidates = [
    frame.getByText("Limpiar", { exact: true }).first(),
    frame.getByText("Limpiar", { exact: false }).first(),
    frame.locator("button, a, span, div, td").filter({ hasText: "Limpiar" }).first(),
    frame.locator(".x-btn-text").filter({ hasText: "Limpiar" }).first(),
    frame.locator(".x-btn").filter({ hasText: "Limpiar" }).first(),
  ];

  for (const locator of candidates) {
    try {
      if (await locator.count()) {
        await locator.waitFor({ state: "visible", timeout: 4000 });
        await locator.click({ force: true });
        debug.push('Click en "Limpiar" dentro de filtros');
        return true;
      }
    } catch {}
  }

  debug.push('No pude hacer click en "Limpiar" dentro de filtros');
  return false;
}

async function getLabelBox(frame: Frame, labelText: string, debug: string[]) {
  const boxes = await frame.locator("body *").evaluateAll((els, label) => {
    return els
      .map((el) => {
        const txt = (el.textContent || "").replace(/\s+/g, " ").trim();
        const rect = (el as HTMLElement).getBoundingClientRect();
        return {
          txt,
          x: rect.x,
          y: rect.y,
          w: rect.width,
          h: rect.height,
        };
      })
      .filter((x) => x.txt === label && x.w > 20 && x.h > 10);
  }, labelText);

  if (!boxes.length) {
    debug.push(`No encontré label exacto: ${labelText}`);
    return null;
  }

  const box = boxes[0];
  debug.push(
    `Label ${labelText} detectado en x=${Math.round(box.x)} y=${Math.round(box.y)}`
  );
  return box;
}

async function findInputRightOfLabel(frame: Frame, labelText: string, debug: string[]) {
  const label = await getLabelBox(frame, labelText, debug);
  if (!label) return null;

  const inputs = await getVisibleInputs(frame, debug);

  const candidates = inputs
    .filter((i) => Math.abs(i.box.y - label.y) < 40 || Math.abs(i.box.y - (label.y + 20)) < 40)
    .filter((i) => i.box.x > label.x + label.w - 30)
    .sort((a, b) => {
      // preferir el más ancho, no el más a la izquierda
      if (Math.abs(b.box.width - a.box.width) > 20) return b.box.width - a.box.width;
      return a.box.x - b.box.x;
    });

  if (!candidates.length) {
    debug.push(`No encontré input a la derecha de label ${labelText}`);
    return null;
  }

  const chosen = candidates[0];
  debug.push(
    `Input asociado a ${labelText} en x=${Math.round(chosen.box.x)} y=${Math.round(chosen.box.y)} w=${Math.round(chosen.box.width)}`
  );
  return chosen;
}

async function openComboForInput(frame: Frame, input: VisibleInput, debug: string[], debugName: string) {
  const page = frame.page();
  const box = input.box;

  const tries = [
    { x: box.x + box.width - 8, y: box.y + box.height / 2 },
    { x: box.x + box.width - 16, y: box.y + box.height / 2 },
    { x: box.x + box.width - 24, y: box.y + box.height / 2 },
  ];

  for (const t of tries) {
    try {
      await page.mouse.click(t.x, t.y);
      debug.push(`Abrí combo ${debugName} en (${Math.round(t.x)}, ${Math.round(t.y)})`);
      await page.waitForTimeout(800);
      return true;
    } catch {}
  }

  debug.push(`No pude abrir combo ${debugName}`);
  return false;
}

async function selectDropdownOptionFromOpenList(page: Page, text: string, debug: string[]) {
  const candidates = [
    page.getByText(text, { exact: true }).last(),
    page.getByText(text, { exact: false }).last(),
    page.locator("div, td, span, li").filter({ hasText: text }).last(),
  ];

  for (const locator of candidates) {
    try {
      if (await locator.count()) {
        await locator.waitFor({ state: "visible", timeout: 5000 });
        await locator.click({ force: true });
        debug.push(`Seleccioné opción dropdown: ${text}`);
        await page.waitForTimeout(700);
        return true;
      }
    } catch {}
  }

  debug.push(`No pude seleccionar opción dropdown: ${text}`);
  return false;
}

async function verifyInputHasText(locator: Locator, expected: string) {
  try {
    const value = await locator.inputValue().catch(() => "");
    if (normalizeText(value).toUpperCase().includes(expected.toUpperCase())) return true;

    const attr = await locator.getAttribute("value").catch(() => "");
    if (normalizeText(attr).toUpperCase().includes(expected.toUpperCase())) return true;

    const txt = await locator.textContent().catch(() => "");
    if (normalizeText(txt).toUpperCase().includes(expected.toUpperCase())) return true;
  } catch {}

  return false;
}

async function setTipoPermisoFilter(frame: Frame, debug: string[]) {
  const result = await frame.evaluate(async () => {
    const w = window as any;
    const Ext = w.Ext;

    if (!Ext) {
      return { ok: false, reason: "Ext no disponible en frame filtros." };
    }

    const normalize = (s: string) =>
      String(s || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();

    const allComponents: any[] = Ext.ComponentMgr?.all?.items || [];

    const combos = allComponents.filter((c: any) => {
      const label = normalize(c.fieldLabel || c.label || c.boxLabel || "");
      return (
        c &&
        typeof c.setValue === "function" &&
        typeof c.getValue === "function" &&
        (label.includes("tipo de permiso") || label === "tipo")
      );
    });

    if (!combos.length) {
      return {
        ok: false,
        reason: "No encontré combo tipo permiso",
        labels: allComponents
          .map((c: any) => (c.fieldLabel || c.label || c.boxLabel || "").toString().trim())
          .filter(Boolean)
          .slice(0, 50),
      };
    }

    const combo = combos[combos.length - 1];

    const ensureStoreLoaded = () =>
      new Promise<void>((resolve) => {
        try {
          if (!combo.store || combo.store.getCount() > 0) {
            resolve();
            return;
          }

          combo.store.load({
            callback: () => resolve(),
          });

          setTimeout(() => resolve(), 2500);
        } catch {
          resolve();
        }
      });

    try {
      if (typeof combo.expand === "function") combo.expand();

      await ensureStoreLoaded();

      let foundRecord: any = null;

      if (combo.store) {
        combo.store.each((rec: any) => {
          const candidates = [
            rec?.data?.[combo.displayField],
            rec?.data?.[combo.valueField],
            rec?.data?.text,
            rec?.data?.name,
            rec?.data?.value,
            rec?.data?.descripcion,
            rec?.data?.label,
          ];

          const joined = candidates
            .map((x) => String(x || "").trim().toUpperCase())
            .join(" ");

          if (joined.includes("SODI") && joined.includes("TERCEROS")) {
            foundRecord = rec;
          }
        });
      }

      if (!foundRecord) {
        return {
          ok: false,
          reason: "No encontré registro SODI TERCEROS en store del combo",
          storeCount: combo.store?.getCount?.() ?? null,
          label: combo.fieldLabel || combo.label || combo.boxLabel || "",
        };
      }

      const valueField = combo.valueField || combo.hiddenName || combo.displayField || "text";
      const displayField = combo.displayField || combo.valueField || "text";

      const realValue = foundRecord.get(valueField);
      const realRaw = foundRecord.get(displayField);

      combo.setValue(realValue);

      if (typeof combo.setRawValue === "function") {
        combo.setRawValue(realRaw);
      } else if (combo.el && combo.el.dom) {
        combo.el.dom.value = realRaw;
      }

      if (combo.hiddenField) {
        combo.hiddenField.value = realValue;
      }

      if (typeof combo.fireEvent === "function") {
        combo.fireEvent("select", combo, foundRecord, 0);
        combo.fireEvent("change", combo, realValue, null);
      }

      if (typeof combo.collapse === "function") combo.collapse();

      return {
        ok: true,
        label: combo.fieldLabel || combo.label || combo.boxLabel || "",
        rawValue: String(combo.getRawValue?.() ?? realRaw ?? "").trim(),
        value: String(combo.getValue?.() ?? realValue ?? "").trim(),
        valueField,
        displayField,
        storeCount: combo.store?.getCount?.() ?? null,
      };
    } catch (e: any) {
      return {
        ok: false,
        reason: e?.message || "Error seteando combo tipo permiso",
      };
    }
  });

  debug.push(`Resultado setTipoPermisoFilter: ${JSON.stringify(result)}`);

  if (!result?.ok) {
    throw new Error(result?.reason || "No pude configurar filtro tipo permiso");
  }

  const final = `${result.rawValue || ""} ${result.value || ""}`.toUpperCase();

  if (!final.includes("SODI") && !final.includes("TERCEROS")) {
    throw new Error(
      `El filtro no quedó seteado correctamente en SODI TERCEROS. raw="${result.rawValue}" value="${result.value}"`
    );
  }

  debug.push(`Filtro aplicado correctamente en: ${result.label}`);
}

async function selectFilteredRow(frame: Frame, ptBase: string, debug: string[]) {
  const candidates = [
    frame.getByText(ptBase, { exact: true }).first(),
    frame.getByText(ptBase, { exact: false }).first(),
    frame.locator("a, td, div, span").filter({ hasText: ptBase }).first(),
  ];

  for (const locator of candidates) {
    try {
      if (await locator.count()) {
        await locator.waitFor({ state: "visible", timeout: 6000 });
        await locator.click({ force: true });
        debug.push(`Seleccioné fila del PT base: ${ptBase}`);
        return true;
      }
    } catch {}
  }

  debug.push(`No pude seleccionar la fila del PT base ${ptBase}`);
  return false;
}

async function clickAceptarInCopiar(frame: Frame, debug: string[]) {
  const candidates = [
    frame.getByText("Aceptar", { exact: true }).first(),
    frame.getByText("Aceptar", { exact: false }).first(),
    frame.locator("button, a, span, div, td").filter({ hasText: "Aceptar" }).first(),
    frame.locator(".x-btn-text").filter({ hasText: "Aceptar" }).first(),
    frame.locator(".x-btn").filter({ hasText: "Aceptar" }).first(),
  ];

  for (const locator of candidates) {
    try {
      if (await locator.count()) {
        await locator.waitFor({ state: "visible", timeout: 5000 });
        await locator.click({ force: true });
        debug.push('Click en "Aceptar" del popup Copiar');
        return true;
      }
    } catch {}
  }

  debug.push('No pude hacer click en "Aceptar" del popup Copiar');
  return false;
}

async function reopenFilterAndSearchSodiTerceros(page: Page, debug: string[]) {
  const permisosFrame = await getPermisosFrame(page, debug);
  if (!permisosFrame) throw new Error("No pude recuperar frame permisos para refiltrar.");

  debug.push("Reabriendo filtro...");
  const okFiltro = await clickToolbarText(permisosFrame, "Filtro", debug);
  if (!okFiltro) throw new Error('No pude reabrir "Filtro".');

  await page.waitForTimeout(1200);

  const filtrosFrame = await waitForFiltrosFrame(page, debug);
  if (!filtrosFrame) throw new Error('No apareció ventana "Filtros" al reabrir.');

  await clickLimpiarInFiltros(filtrosFrame, debug);
  await page.waitForTimeout(700);

  await setTipoPermisoFilter(filtrosFrame, debug);
  await page.waitForTimeout(1200);
  await savePageArtifacts(page, "12b_filtro_tipo_seteado", debug);

  const okAplicar = await clickAplicarInFiltros(filtrosFrame, debug);
  if (!okAplicar) throw new Error('No pude aplicar filtro por tipo de permiso.');

  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(3500);
  await savePageArtifacts(page, "12_filter_sodi_applied", debug);
}

type VisibleRow = {
  id: string;
  raw: string;
};

async function extractVisibleRows(frame: Frame, debug: string[]) {
  const idsFromDom = await frame.evaluate(() => {
    const normalize = (s: string) => String(s || "").replace(/\s+/g, " ").trim();

    const all = Array.from(document.querySelectorAll("td, div, a, span"))
      .map((el) => normalize((el as HTMLElement).innerText || el.textContent || ""))
      .filter(Boolean);

    const ids: string[] = [];

    for (const txt of all) {
      const matches = txt.match(/\b\d{4}-\d{5}\b/g) || [];
      for (const id of matches) {
        if (!ids.includes(id)) ids.push(id);
      }
    }

    return ids;
  });

  debug.push(
    `IDs visibles extraídos desde DOM: ${idsFromDom.join(", ") || "(ninguno)"}`
  );

  const rows = idsFromDom.map((id) => ({ id, raw: id }));
  return rows;
}

function detectMostLikelyNewId(
  rows: { id: string; raw: string }[],
  ptBase: string,
  debug: string[]
) {
  const [baseYear, baseSeqRaw] = ptBase.split("-");
  const baseSeq = Number(baseSeqRaw || "0");

  const parsed = rows
    .map((r) => {
      const [year, seqRaw] = r.id.split("-");
      return {
        ...r,
        year,
        seq: Number(seqRaw || "0"),
      };
    })
    .filter((r) => r.year === baseYear && Number.isFinite(r.seq));

  debug.push(
    `Candidatos detectados: ${parsed.map((c) => `${c.id}(${c.seq})`).join(", ") || "(ninguno)"}`
  );

  const newer = parsed
    .filter((r) => r.seq > baseSeq)
    .sort((a, b) => b.seq - a.seq);

  if (newer.length > 0) {
    debug.push(`Nuevo PT detectado por mayor correlativo sobre base: ${newer[0].id}`);
    return newer[0].id;
  }

  const allSorted = parsed.sort((a, b) => b.seq - a.seq);
  if (allSorted.length > 0) {
    debug.push(`No hubo correlativo mayor que la base; tomo el mayor visible: ${allSorted[0].id}`);
    return allSorted[0].id;
  }

  debug.push("No detecté nuevo PT automáticamente.");
  return null;
}

export async function POST(req: Request) {
  const debug: string[] = [];
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  let page: Page | null = null;

  try {
    const body = await req.json();
    const username = String(body?.username || "").trim();
    const password = String(body?.password || "").trim();
    const ptBase = String(body?.ptBase || "2026-06560").trim();

    if (!username || !password) {
      return Response.json(
        { error: "Debes ingresar usuario y contraseña." },
        { status: 400 }
      );
    }

    ensureTmpDir();

    browser = await chromium.launch({
      headless: true,
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

    const permisosFrame = await getPermisosFrame(page, debug);
    if (!permisosFrame) throw new Error("No pude identificar la pantalla de Permisos de trabajo.");

    debug.push('Paso 6: click en "Filtro"');
    const okFiltro = await clickToolbarText(permisosFrame, "Filtro", debug);
    if (!okFiltro) {
      await savePageArtifacts(page, "06c_click_filtro_failed", debug);
      throw new Error('No pude hacer click en "Filtro".');
    }

    await page.waitForTimeout(1500);
    await savePageArtifacts(page, "07_filtro_open", debug);

    const filtrosFrame = await waitForFiltrosFrame(page, debug);
    if (!filtrosFrame) throw new Error('No apareció la ventana "Filtros".');

    debug.push("Paso 7: escribir PT base en filtros");
    await fillIdsPermisosField(filtrosFrame, ptBase, debug);
    await savePageArtifacts(page, "08_filtro_filled", debug);

    debug.push('Paso 8: click en "Aplicar"');
    const okAplicar = await clickAplicarInFiltros(filtrosFrame, debug);
    if (!okAplicar) throw new Error('No pude hacer click en "Aplicar".');

    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(3000);
    await savePageArtifacts(page, "09_filtro_aplicado", debug);

    const permisosFrame2 = await getPermisosFrame(page, debug);
    if (!permisosFrame2) {
      throw new Error("No pude volver a identificar la pantalla de Permisos después del filtro.");
    }

    debug.push("Paso 9: seleccionar PT base filtrado");
    const okSelectRow = await selectFilteredRow(permisosFrame2, ptBase, debug);
    if (!okSelectRow) throw new Error(`No pude seleccionar la fila del PT base ${ptBase}.`);

    await page.waitForTimeout(1200);
    await savePageArtifacts(page, "09b_row_selected", debug);

    debug.push('Paso 10: click en "Copiar"');
    const okCopiar = await clickToolbarText(permisosFrame2, "Copiar", debug);
    if (!okCopiar) throw new Error('No pude hacer click en "Copiar".');

    await page.waitForTimeout(1200);
    await savePageArtifacts(page, "10_copiar_clicked", debug);

    const copiarFrame = await waitForCopiarFrame(page, debug);
    if (!copiarFrame) throw new Error('No apareció el popup de "Copiar".');

    debug.push('Paso 11: click en "Aceptar" del popup');
    const okAceptar = await clickAceptarInCopiar(copiarFrame, debug);
    if (!okAceptar) throw new Error('No pude hacer click en "Aceptar" del popup Copiar.');

    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(4000);
    await savePageArtifacts(page, "11_copy_done", debug);
    await dumpFrames(page, debug);

    debug.push("Paso 12: limpiar filtro y seleccionar SODI TERCEROS");
    await reopenFilterAndSearchSodiTerceros(page, debug);

    const permisosFrame3 = await getPermisosFrame(page, debug);
    let newPtId: string | null = null;

    if (permisosFrame3) {
      const rows = await extractVisibleRows(permisosFrame3, debug);
      debug.push(`Total IDs visibles detectados en grilla: ${rows.length}`);
      newPtId = detectMostLikelyNewId(rows, ptBase, debug);
    }

    return Response.json({
      ok: true,
      message: "PT base copiado correctamente.",
      ptBase,
      newPtId,
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
        error: error?.message || "Error inesperado al copiar PT base.",
        debug,
      },
      { status: 500 }
    );
  }
}