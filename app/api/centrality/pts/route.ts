import { chromium, Page, Frame } from "playwright";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PtRow = {
  id: string;
  tipo: string;
  desde: string;
  hasta: string;
  area: string;
  descripcion: string;
};

function normalizeText(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function ensureTmpDir() {
  const dir = path.join(process.cwd(), "tmp");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function splitAreaAndDescription(rest: string) {
  const cleaned = normalizeText(rest);

  if (!cleaned) {
    return { area: "", descripcion: "" };
  }

  const metroMatch = cleaned.match(
    /^((?:ÁREA|Área|AREA|Area)\s+.*?\b(?:METROPOLITANA|Metropolitana)\b)\s*(.*)$/u
  );

  if (metroMatch) {
    return {
      area: normalizeText(metroMatch[1]),
      descripcion: normalizeText(metroMatch[2]),
    };
  }

  return {
    area: "",
    descripcion: cleaned,
  };
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
    ]);

    if (!loginClicked) {
      await page.keyboard.press("Enter");
    }

    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(4000);
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
        `Frame[${i}] url=${frames[i].url().slice(0, 120)} | texto=${txt.slice(0, 180)}`
      );
    } catch {
      debug.push(`Frame[${i}] no legible`);
    }
  }
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
      if (txt.includes("consultas")) score += 3;
      if (txt.includes("modo contingencia")) score += 3;
      if (txt.includes("supervisión") || txt.includes("supervision")) score += 3;
      if (txt.includes("dms")) score += 2;
      if (txt.includes("programación de trabajo") || txt.includes("programacion de trabajo")) score += 4;
      if (txt.length > 100) score += 1;

      if (score > bestScore) {
        bestScore = score;
        best = frame;
      }
    } catch {}
  }

  if (best) {
    debug.push(`Frame DMS seleccionado: ${best.url().slice(0, 150)}`);
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

async function clickProgramacionInFrame(frame: Frame, debug: string[]) {
  const candidates = [
    frame.getByText("Programación de trabajo", { exact: false }).first(),
    frame.getByText("Programacion de trabajo", { exact: false }).first(),
    frame.locator("a, span, div, td").filter({ hasText: "Programación de trabajo" }).first(),
    frame.locator("a, span, div, td").filter({ hasText: "Programacion de trabajo" }).first(),
  ];

  for (const locator of candidates) {
    try {
      if (await locator.count()) {
        await locator.waitFor({ state: "visible", timeout: 6000 });
        await locator.click();
        debug.push('Click en "Programación de trabajo" dentro del menú');
        return true;
      }
    } catch {}
  }

  debug.push('No pude hacer click en "Programación de trabajo" dentro del menú');
  return false;
}

async function navigateToProgramacion(page: Page, debug: string[]) {
  debug.push("Paso 1: Aplicaciones");
  const okAplicaciones = await clickText(page, "Aplicaciones", debug, false);
  if (!okAplicaciones) {
    throw new Error('No pude hacer click en "Aplicaciones".');
  }
  await page.waitForTimeout(2500);
  await savePageArtifacts(page, "03_aplicaciones", debug);

  debug.push("Paso 2: DMS");
  let okDms = await clickLinkByText(page, "DMS", debug);
  if (!okDms) okDms = await clickText(page, "DMS", debug, false);

  if (!okDms) {
    throw new Error('No pude hacer click en "DMS".');
  }

  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(4000);
  await savePageArtifacts(page, "04_dms", debug);
  await dumpFrames(page, debug);

  debug.push("Paso 3: identificar frame DMS");
  const dmsFrame = await getDmsFrame(page, debug);
  if (!dmsFrame) {
    throw new Error("No pude identificar el frame del módulo DMS.");
  }

  debug.push("Paso 4: Planificación en barra DMS");
  const okPlanificacion = await clickPlanificacionInFrame(dmsFrame, debug);
  if (!okPlanificacion) {
    throw new Error('No pude hacer click en "Planificación" dentro del módulo DMS.');
  }

  await page.waitForTimeout(2000);
  await savePageArtifacts(page, "05_planificacion_menu", debug);
  await saveFrameArtifacts(dmsFrame, "05b_planificacion_menu_frame", debug);

  debug.push("Paso 5: Programación de trabajo");
  const okProgramacion = await clickProgramacionInFrame(dmsFrame, debug);
  if (!okProgramacion) {
    throw new Error('No pude hacer click en "Programación de trabajo".');
  }

  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await savePageArtifacts(page, "06_programacion", debug);
  await dumpFrames(page, debug);

  debug.push("Pantalla Programación de trabajo detectada.");
}

async function hasRowsVisible(page: Page): Promise<boolean> {
  for (const frame of page.frames()) {
    try {
      const found = await frame.evaluate(() => {
        const text = (document.body?.innerText || "").replace(/\s+/g, " ").trim();
        return /\b20\d{2}-\d+\b/.test(text);
      });

      if (found) return true;
    } catch {}
  }
  return false;
}

async function openListadoPT(page: Page, debug: string[]) {
  const dmsFrame = await getDmsFrame(page, debug);
  if (!dmsFrame) {
    throw new Error("No pude identificar el frame DMS para abrir el listado.");
  }

  if (await hasRowsVisible(page)) {
    debug.push("Las filas de PT ya están visibles.");
    return;
  }

  async function trySelectorsInFrame() {
    const selectors = [
      ".x-layout-split-west .x-layout-mini",
      ".x-layout-split-west",
      ".x-layout-collapsed-west .x-tool",
      ".x-layout-collapsed-west",
      ".x-splitbar-h",
      ".x-layout-split",
      ".x-tool",
      ".x-panel-header",
    ];

    for (const selector of selectors) {
      try {
        const locator = dmsFrame.locator(selector).first();
        if (await locator.count()) {
          await locator.click({ force: true });
          debug.push(`Click selector "${selector}"`);
          await page.waitForTimeout(1800);

          if (await hasRowsVisible(page)) {
            debug.push(`Filas PT visibles después de selector ${selector}.`);
            return true;
          }
        }
      } catch {}
    }

    return false;
  }

  debug.push("Intentando abrir listado PT por splitter/flecha/selectores...");
  const okBySelector = await trySelectorsInFrame();
  await savePageArtifacts(page, "06b_try_selectors", debug);
  if (okBySelector) return;

  throw new Error("Llegué a Programación de trabajo, pero no logré mostrar filas reales de PTs.");
}

async function extractCurrentPageRows(page: Page, debug: string[]): Promise<PtRow[]> {
  for (const frame of page.frames()) {
    try {
      const result = await frame.evaluate(() => {
        const normalize = (value: string | null | undefined) =>
          (value || "").replace(/\s+/g, " ").trim();

        const idRegex = /^\d{4}-\d+$/;

        const diagnostics = {
          extRowCount: document.querySelectorAll(".x-grid3-row").length,
          extCellCount: document.querySelectorAll(".x-grid3-cell-inner").length,
          rowTableCount: document.querySelectorAll("table.x-grid3-row-table").length,
          tableCount: document.querySelectorAll("table").length,
          bodyText: normalize(document.body?.innerText || document.body?.textContent || ""),
        };

        const isVisibleCell = (el: Element) => {
          const html = el as HTMLElement;
          const style = window.getComputedStyle(html);
          if (style.display === "none" || style.visibility === "hidden") return false;
          if (html.classList.contains("x-hide-display")) return false;
          return true;
        };

        const rows: PtRow[] = [];

        const extRows = Array.from(document.querySelectorAll(".x-grid3-row"));

        for (const row of extRows) {
          const cells = Array.from(row.querySelectorAll("td.x-grid3-cell"))
            .filter(isVisibleCell)
            .map((td) => {
              const inner =
                td.querySelector(".x-grid3-cell-inner") ||
                td.querySelector("div") ||
                td;
              return normalize((inner as HTMLElement).innerText || inner.textContent);
            })
            .filter(Boolean);

          const idIndex = cells.findIndex((v) => idRegex.test(v));
          if (idIndex === -1) continue;

          const useful = cells.slice(idIndex, idIndex + 6);

          if (useful.length >= 6 && idRegex.test(useful[0])) {
            rows.push({
              id: useful[0],
              tipo: useful[1],
              desde: useful[2],
              hasta: useful[3],
              area: useful[4],
              descripcion: useful[5],
            });
          }
        }

        if (rows.length > 0) {
          return { rows, diagnostics, method: "x-grid3-visible-cells" };
        }

        const rowTables = Array.from(document.querySelectorAll("table.x-grid3-row-table"));

        for (const rowTable of rowTables) {
          const cells = Array.from(rowTable.querySelectorAll("td"))
            .filter(isVisibleCell)
            .map((td) => normalize((td as HTMLElement).innerText || td.textContent))
            .filter(Boolean);

          const idIndex = cells.findIndex((v) => idRegex.test(v));
          if (idIndex === -1) continue;

          const useful = cells.slice(idIndex, idIndex + 6);

          if (useful.length >= 6 && idRegex.test(useful[0])) {
            rows.push({
              id: useful[0],
              tipo: useful[1],
              desde: useful[2],
              hasta: useful[3],
              area: useful[4],
              descripcion: useful[5],
            });
          }
        }

        if (rows.length > 0) {
          return { rows, diagnostics, method: "rowTables-visible-cells" };
        }

        const bodyText = diagnostics.bodyText;
        const regex =
          /(\d{4}-\d+)\s+(.+?)\s+(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})\s+(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})\s+(.+?)(?=\s+\d{4}-\d+\s+|$)/gs;

        const parsed: PtRow[] = [];
        const seen = new Set<string>();

        for (const match of bodyText.matchAll(regex)) {
          const id = normalize(match[1]);
          const tipo = normalize(match[2]);
          const desde = normalize(match[3]);
          const hasta = normalize(match[4]);
          const rest = normalize(match[5]);

          if (!id || !tipo || !desde || !hasta) continue;
          if (seen.has(id)) continue;
          seen.add(id);

          parsed.push({
            id,
            tipo,
            desde,
            hasta,
            area: "",
            descripcion: rest,
          });
        }

        return { rows: parsed, diagnostics, method: "visible-text" };
      });

      debug.push(
        `Frame revisión ${frame.url().slice(0, 150)} | extRows=${result.diagnostics.extRowCount} | extCells=${result.diagnostics.extCellCount} | rowTables=${result.diagnostics.rowTableCount} | tables=${result.diagnostics.tableCount}`
      );
      debug.push(`Método extracción usado: ${result.method}`);
      debug.push(`Texto sample frame: ${result.diagnostics.bodyText.slice(0, 500)}`);

      if (result.rows.length > 0) {
        debug.push(
          `Filas extraídas en frame ${frame.url().slice(0, 150)}: ${result.rows.length}`
        );
        return result.rows.map((row) => {
          if (row.area && row.descripcion) return row;

          const split = splitAreaAndDescription(row.descripcion || "");
          return {
            ...row,
            area: row.area || split.area,
            descripcion: split.descripcion,
          };
        });
      }
    } catch {
      debug.push(`Falló lectura de frame ${frame.url().slice(0, 120)}`);
    }
  }

  debug.push("No encontré la tabla en ningún frame.");
  return [];
}

async function getPagerInfo(page: Page, debug: string[]) {
  for (const frame of page.frames()) {
    try {
      const info = await frame.evaluate(() => {
        const normalize = (value: string | null | undefined) =>
          (value || "").replace(/\s+/g, " ").trim();

        const rawText = document.body?.innerText || document.body?.textContent || "";
        const text = normalize(rawText);

        const pageMatch =
          rawText.match(/Página\s+(\d+)\s+de\s+(\d+)/i) ||
          text.match(/Página\s+(\d+)\s+de\s+(\d+)/i);

        const showingMatch =
          rawText.match(/Mostrando\s+(\d+)\s*-\s*(\d+)\s+de\s+(\d+)/i) ||
          text.match(/Mostrando\s+(\d+)\s*-\s*(\d+)\s+de\s+(\d+)/i);

        let currentPageFromInput: number | null = null;
        let totalPagesFromInput: number | null = null;
        let pagerInputSelector: string | null = null;

        const inputs = Array.from(document.querySelectorAll("input"));

        for (let i = 0; i < inputs.length; i++) {
          const input = inputs[i] as HTMLInputElement;
          const value = normalize(input.value || "");

          if (!/^\d+$/.test(value)) continue;

          const parentText =
            input.parentElement?.parentElement?.innerText ||
            input.parentElement?.innerText ||
            "";

          const localMatch =
            parentText.match(/Página\s+\d+\s+de\s+(\d+)/i) ||
            parentText.match(/de\s+(\d+)/i);

          const rect = input.getBoundingClientRect();
          const looksLikePagerInput =
            rect.width < 80 &&
            rect.height < 40 &&
            Number(value) >= 1 &&
            Number(value) <= 9999;

          if (localMatch || looksLikePagerInput) {
            currentPageFromInput = Number(value);

            if (localMatch) {
              totalPagesFromInput = Number(localMatch[1]);
            }

            if (input.id) {
              pagerInputSelector = `#${input.id}`;
            } else if (input.name) {
              pagerInputSelector = `input[name="${input.name}"]`;
            } else {
              pagerInputSelector = `input`;
            }

            break;
          }
        }

        const showingFrom = showingMatch ? Number(showingMatch[1]) : null;
        const showingTo = showingMatch ? Number(showingMatch[2]) : null;
        const totalRows = showingMatch ? Number(showingMatch[3]) : null;

        let inferredTotalPages: number | null = null;
        if (showingFrom && showingTo && totalRows) {
          const pageSize = showingTo - showingFrom + 1;
          if (pageSize > 0) {
            inferredTotalPages = Math.ceil(totalRows / pageSize);
          }
        }

        return {
          currentPage: currentPageFromInput ?? (pageMatch ? Number(pageMatch[1]) : null),
          totalPages:
            totalPagesFromInput ??
            (pageMatch ? Number(pageMatch[2]) : null) ??
            inferredTotalPages,
          showingFrom,
          showingTo,
          totalRows,
          pagerInputSelector,
          textSample: rawText.slice(0, 2000),
        };
      });

      debug.push(
        `Diagnóstico paginador frame ${frame.url().slice(0, 120)} | current=${info.currentPage} | total=${info.totalPages} | from=${info.showingFrom} | to=${info.showingTo} | totalRows=${info.totalRows} | input=${info.pagerInputSelector}`
      );

      if (info.totalPages || info.totalRows) {
        return info;
      }
    } catch {}
  }

  debug.push("No pude detectar el paginador.");
  return {
    currentPage: null,
    totalPages: null,
    showingFrom: null,
    showingTo: null,
    totalRows: null,
    pagerInputSelector: null,
    textSample: "",
  };
}

async function waitForPageDataChange(
  page: Page,
  previousFirstId: string | null,
  debug: string[],
  timeoutMs = 8000
) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const rows = await extractCurrentPageRows(page, debug);
    const currentFirstId = rows[0]?.id || null;

    if (rows.length > 0 && currentFirstId && currentFirstId !== previousFirstId) {
      debug.push(
        `Cambio real de datos detectado. Primer ID anterior=${previousFirstId} | nuevo=${currentFirstId}`
      );
      return true;
    }

    await page.waitForTimeout(600);
  }

  debug.push(`No detecté cambio real de primer ID dentro de ${timeoutMs} ms.`);
  return false;
}

async function clickNextPageBlind(page: Page, debug: string[]) {
  const dmsFrame = await getDmsFrame(page, debug);
  if (!dmsFrame) return false;

  const beforeRows = await extractCurrentPageRows(page, debug);
  const previousFirstId = beforeRows[0]?.id || null;

  try {
    const handle = await dmsFrame.frameElement();
    const box = await handle.boundingBox();
    if (!box) return false;

    const attempts = [
      { x: box.x + box.width * 0.255, y: box.y + box.height * 0.785, label: "next-1" },
      { x: box.x + box.width * 0.270, y: box.y + box.height * 0.785, label: "next-2" },
      { x: box.x + box.width * 0.285, y: box.y + box.height * 0.785, label: "next-3" },
      { x: box.x + box.width * 0.300, y: box.y + box.height * 0.785, label: "next-4" },
    ];

    for (const a of attempts) {
      await page.mouse.click(a.x, a.y);
      debug.push(`Click ciego siguiente ${a.label} (${Math.round(a.x)}, ${Math.round(a.y)})`);
      await page.waitForTimeout(1200);

      const changed = await waitForPageDataChange(page, previousFirstId, debug, 9000);
      if (changed) {
        debug.push(`Cambio real de filas detectado con ${a.label}.`);
        return true;
      }
    }
  } catch {}

  return false;
}

async function goToPage(page: Page, targetPage: number, debug: string[]) {
  const pager = await getPagerInfo(page, debug);
  const beforePage = pager.currentPage;

  const beforeRows = await extractCurrentPageRows(page, debug);
  const previousFirstId = beforeRows[0]?.id || null;

  for (const frame of page.frames()) {
    try {
      const inputs = frame.locator("input");
      const count = await inputs.count();

      for (let i = 0; i < count; i++) {
        const input = inputs.nth(i);

        try {
          const value = await input.inputValue().catch(() => "");
          const box = await input.boundingBox().catch(() => null);

          if (!box) continue;
          if (box.width > 80 || box.height > 40) continue;
          if (value && !/^\d+$/.test(value)) continue;

          await input.click({ force: true });
          await input.fill(String(targetPage));
          await input.press("Enter");
          debug.push(`Intenté ir a página ${targetPage} escribiendo en input #${i}.`);
          await page.waitForTimeout(1200);

          const changed = await waitForPageDataChange(page, previousFirstId, debug, 9000);
          const after = await getPagerInfo(page, debug);

          if (
            changed &&
            (
              after.currentPage === targetPage ||
              (after.showingFrom && pager.showingFrom && after.showingFrom !== pager.showingFrom)
            )
          ) {
            debug.push(`Cambio confirmado a página ${targetPage}.`);
            return true;
          }

          if (changed) {
            debug.push(`Los datos cambiaron al intentar ir a página ${targetPage}.`);
            return true;
          }
        } catch {}
      }
    } catch {}
  }

  if (beforePage && targetPage > beforePage) {
    let current = beforePage;

    while (current < targetPage) {
      const moved = await clickNextPageBlind(page, debug);
      if (!moved) return false;

      const changed = await waitForPageDataChange(page, previousFirstId, debug, 9000);
      if (!changed) return false;

      const after = await getPagerInfo(page, debug);
      if (after.currentPage && after.currentPage > current) {
        current = after.currentPage;
      } else {
        current += 1;
      }
    }

    return true;
  }

  return false;
}

async function readAllPtPages(page: Page, debug: string[]): Promise<PtRow[]> {
  const allRows: PtRow[] = [];

  const normalizePageRows = (rows: PtRow[]) => {
    const seen = new Set<string>();
    const clean: PtRow[] = [];

    for (const row of rows) {
      const key = `${row.id}|${row.tipo}|${row.desde}|${row.hasta}|${row.area}|${row.descripcion}`;
      if (seen.has(key)) continue;
      seen.add(key);
      clean.push(row);
    }

    return clean;
  };

  const firstRows = await extractCurrentPageRows(page, debug);
  const firstClean = normalizePageRows(firstRows);
  allRows.push(...firstClean);

  const pager = await getPagerInfo(page, debug);

  let totalPages = pager.totalPages || 1;

  if ((!totalPages || totalPages < 2) && pager.totalRows && firstClean.length > 0) {
    totalPages = Math.ceil(pager.totalRows / firstClean.length);
  }

  if (!totalPages || totalPages < 1) totalPages = 1;

  debug.push(`Iniciando lectura completa de PTs. Total páginas estimadas: ${totalPages}`);
  debug.push(
    `Página 1/${totalPages} procesada. Filas=${firstClean.length} | primero=${firstClean[0]?.id || "-"} | último=${firstClean[firstClean.length - 1]?.id || "-"} | acumulado=${allRows.length}`
  );

  for (let targetPage = 2; targetPage <= totalPages; targetPage++) {
    const moved = await goToPage(page, targetPage, debug);

    if (!moved) {
      debug.push(`No pude moverme a la página ${targetPage}. Fin de lectura.`);
      break;
    }

    await page.waitForTimeout(1600);

    const pageRows = await extractCurrentPageRows(page, debug);

    if (!pageRows.length) {
      debug.push(`Página ${targetPage} sin filas leídas. Detengo lectura.`);
      break;
    }

    const cleanRows = normalizePageRows(pageRows);
    allRows.push(...cleanRows);

    debug.push(
      `Página ${targetPage}/${totalPages} procesada. Filas=${cleanRows.length} | primero=${cleanRows[0]?.id || "-"} | último=${cleanRows[cleanRows.length - 1]?.id || "-"} | acumulado=${allRows.length}`
    );
  }

  debug.push(`Lectura completa terminada. Total PT leídos: ${allRows.length}`);
  return allRows;
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

    await page.waitForTimeout(3000);
    await savePageArtifacts(page, "01_inicio", debug);

    await resolveLogin(page, username, password, debug);
    await savePageArtifacts(page, "02_post_login", debug);

    await dumpFrames(page, debug);
    await navigateToProgramacion(page, debug);
    await openListadoPT(page, debug);
    await page.waitForTimeout(3500);

    const rows = await readAllPtPages(page, debug);

    if (!rows.length) {
      await savePageArtifacts(page, "07_no_rows", debug);
      throw new Error("Llegué a Programación de trabajo, pero no pude extraer filas de la tabla.");
    }

    await savePageArtifacts(page, "08_ok", debug);

    await browser.close();

    return Response.json({
      ok: true,
      rows,
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
        error: error?.message || "Error inesperado al leer Centrality.",
        debug,
      },
      { status: 500 }
    );
  }
}