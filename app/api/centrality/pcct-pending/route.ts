import { NextRequest, NextResponse } from "next/server";
import { chromium, type Browser, type Frame, type Page } from "playwright";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE_URL = "https://stx.saesa.cl:8091/backend/sts/centrality.php";

import path from "path";
import fs from "fs";

const TMP_DIR =
  process.env.VERCEL === "1"
    ? "/tmp"
    : path.join(process.cwd(), "tmp");

function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
}

type PtRow = {
  id: string;
  fechaInicio: string;
  estado: string;
  tipo: string;
  descripcion: string;
};

function ensureTmp() {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
}

async function saveDebug(page: Page, name: string, debug: string[]) {
  try {
    ensureTmpDir();
    const png = path.join(TMP_DIR, `${name}.png`);
    const html = path.join(TMP_DIR, `${name}.html`);
    await page.screenshot({ path: png, fullPage: true });
    fs.writeFileSync(html, await page.content(), "utf8");
    debug.push(`Screenshot: ${png}`);
    debug.push(`HTML: ${html}`);
  } catch (e: any) {
    debug.push(`No pude guardar debug ${name}: ${e?.message || e}`);
  }
}

async function saveFrameDebug(frame: Frame, name: string, debug: string[]) {
  try {
    ensureTmp();
    const html = path.join(TMP_DIR, `${name}.html`);
    fs.writeFileSync(html, await frame.content(), "utf8");
    debug.push(`Frame HTML: ${html}`);
  } catch (e: any) {
    debug.push(`No pude guardar frame debug ${name}: ${e?.message || e}`);
  }
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function findFrameByText(page: Page, wanted: string) {
  for (let i = 0; i < 20; i++) {
    for (const frame of page.frames()) {
      const text = await frame.locator("body").innerText().catch(() => "");
      if (text.includes(wanted)) return frame;
    }
    await wait(500);
  }
  return null;
}

async function clickTextInFrame(frame: Frame, text: string, debug: string[]) {
  const loc = frame.getByText(text, { exact: false }).first();
  await loc.waitFor({ timeout: 15000 });
  await loc.click({ force: true });
  debug.push(`Click en "${text}"`);
  await wait(1200);
}

async function getDmsFrame(page: Page, debug: string[]) {
  const frame = await findFrameByText(page, "Planificación");
  if (!frame) throw new Error("No encontré frame DMS.");
  debug.push(`Frame DMS seleccionado: ${frame.url()}`);
  await saveFrameDebug(frame, "pcct_04b_dms_frame", debug);
  return frame;
}

async function getPermisosFrame(page: Page, debug: string[]) {
  for (let i = 0; i < 30; i++) {
    for (const frame of page.frames()) {
      const text = await frame.locator("body").innerText().catch(() => "");
      const url = frame.url();
      if (
        text.includes("Permisos de trabajo") &&
        text.includes("Filtro") &&
        (url.includes("dms_operation_orders") || text.includes("Aprobar"))
      ) {
        debug.push(`Frame permisos seleccionado: ${url}`);
        await saveFrameDebug(frame, "pcct_06b_permisos_frame", debug);
        return frame;
      }
    }
    await wait(500);
  }

  throw new Error("No encontré frame de Permisos de trabajo.");
}

async function getFiltroFrame(page: Page, debug: string[]) {
  for (let i = 0; i < 30; i++) {
    for (const frame of page.frames()) {
      const text = await frame.locator("body").innerText().catch(() => "");

      if (
        text.includes("Filtros") &&
        text.includes("En bandeja de trabajo") &&
        text.includes("Ids de permisos de trabajo")
      ) {
        debug.push(`Frame filtro seleccionado: ${frame.url()}`);
        await saveFrameDebug(frame, "pcct_07_filtro_frame", debug);
        return frame;
      }
    }

    await wait(500);
  }

  throw new Error("No encontré la ventana/frame de Filtros.");
}

async function login(page: Page, username: string, password: string, debug: string[]) {
  debug.push("Entrando a Centrality...");

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await wait(2500);
  await saveDebug(page, "pcct_01_inicio", debug);

  const body = await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");

  if (!body.toLowerCase().includes("login") && !body.toLowerCase().includes("contraseña")) {
    debug.push("Sesión ya iniciada o login no visible.");
    return;
  }

  debug.push("Login detectado. Intentando autenticar...");

  const userSelectors = [
    'input[name="username"]',
    'input[name="user"]',
    'input[name="login"]',
    'input[type="text"]',
    "input",
  ];

  let userFilled = false;

  for (const selector of userSelectors) {
    const loc = page.locator(selector).first();
    const count = await page.locator(selector).count().catch(() => 0);

    if (count > 0) {
      await loc.click({ force: true, timeout: 10000 }).catch(() => {});
      await loc.fill(username, { timeout: 10000 }).catch(() => {});
      const value = await loc.inputValue().catch(() => "");
      if (value) {
        userFilled = true;
        debug.push(`Usuario escrito usando selector: ${selector}`);
        break;
      }
    }
  }

  if (!userFilled) {
    throw new Error("No pude escribir el usuario en el login.");
  }

  const passSelectors = [
    'input[name="password"]',
    'input[name="pass"]',
    'input[type="password"]',
  ];

  let passFilled = false;

  for (const selector of passSelectors) {
    const loc = page.locator(selector).first();
    const count = await page.locator(selector).count().catch(() => 0);

    if (count > 0) {
      await loc.click({ force: true, timeout: 10000 }).catch(() => {});
      await loc.fill(password, { timeout: 10000 }).catch(() => {});
      const value = await loc.inputValue().catch(() => "");
      if (value) {
        passFilled = true;
        debug.push(`Contraseña escrita usando selector: ${selector}`);
        break;
      }
    }
  }

  if (!passFilled) {
    throw new Error("No pude escribir la contraseña en el login.");
  }

  const clicked =
    (await page
      .getByRole("button", { name: /login/i })
      .click({ force: true, timeout: 5000 })
      .then(() => true)
      .catch(() => false)) ||
    (await page
      .getByText("Login", { exact: false })
      .first()
      .click({ force: true, timeout: 5000 })
      .then(() => true)
      .catch(() => false)) ||
    (await page
      .locator('input[type="submit"], button')
      .first()
      .click({ force: true, timeout: 5000 })
      .then(() => true)
      .catch(() => false));

  if (!clicked) {
    throw new Error("No pude presionar el botón Login.");
  }

  debug.push("Login enviado.");
  await wait(5000);
  await saveDebug(page, "pcct_02_post_login", debug);
}
async function goToPermisosTrabajo(page: Page, debug: string[]) {
  debug.push("Paso 1: Aplicaciones");
  let frame = await findFrameByText(page, "Aplicaciones");
  if (!frame) throw new Error("No encontré pantalla principal con Aplicaciones.");

  await clickTextInFrame(frame, "Aplicaciones", debug);
  await saveDebug(page, "pcct_03_aplicaciones", debug);

  debug.push("Paso 2: DMS");
  frame = await findFrameByText(page, "DMS");
  if (!frame) throw new Error("No encontré DMS.");

  await clickTextInFrame(frame, "DMS", debug);
  await wait(2500);
  await saveDebug(page, "pcct_04_dms", debug);

  debug.push("Paso 3: identificar frame DMS");
  const dmsFrame = await getDmsFrame(page, debug);

  debug.push("Paso 4: Planificación");
  await clickTextInFrame(dmsFrame, "Planificación", debug);
  await wait(1000);
  await saveDebug(page, "pcct_05_planificacion_menu", debug);

  debug.push("Paso 5: Permisos de trabajo");
  const dmsFrame2 = await getDmsFrame(page, debug);
  await clickTextInFrame(dmsFrame2, "Permisos de trabajo", debug);
  await wait(3500);
  await saveDebug(page, "pcct_06_permisos_trabajo", debug);

  return await getPermisosFrame(page, debug);
}

async function clickToolbarButton(frame: Frame, label: string, debug: string[]) {
  const ok = await frame.evaluate((wanted) => {
    const candidates = Array.from(document.querySelectorAll("*")) as HTMLElement[];

    const el = candidates.find((node) => {
      const txt = (node.innerText || node.textContent || "").trim();
      const cls = node.className?.toString() || "";
      return txt === wanted || (txt.includes(wanted) && cls.includes("x-btn"));
    });

    if (!el) return false;

    el.click();
    return true;
  }, label);

  if (!ok) throw new Error(`No pude hacer click en botón "${label}".`);

  debug.push(`Click toolbar "${label}"`);
  await wait(1200);
}

async function openFiltro(frame: Frame, page: Page, debug: string[]) {
  debug.push("Paso 6: abrir Filtro");

  const result = await frame.evaluate(async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    function fireClick(el: Element | null) {
      if (!el) return false;

      const rect = (el as HTMLElement).getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;

      for (const type of ["mouseover", "mousedown", "mouseup", "click"]) {
        (el as HTMLElement).dispatchEvent(
          new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
          })
        );
      }

      return true;
    }

    function hasFiltroWindow() {
      const txt = document.body.innerText || "";
      return (
        txt.includes("Filtros") &&
        txt.includes("En bandeja de trabajo") &&
        txt.includes("Ids de permisos de trabajo")
      );
    }

    const all = Array.from(document.querySelectorAll("*")) as HTMLElement[];

    const candidates = all.filter((el) => {
      const txt = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
      const cls = el.className?.toString() || "";
      return txt === "Filtro" || (txt.includes("Filtro") && cls.includes("x-btn"));
    });

    for (const el of candidates) {
      fireClick(el);
      await sleep(1200);

      if (hasFiltroWindow()) {
        return {
          ok: true,
          step: "opened_by_text",
          clickedText: (el.innerText || el.textContent || "").trim(),
        };
      }
    }

    // Respaldo: buscar botón ExtJS por texto
    const extResult = await new Promise<any>((resolve) => {
      try {
        const w = window as any;
        if (!w.Ext) return resolve({ ok: false, step: "no_ext" });

        let clicked = false;

        w.Ext.ComponentMgr.all.each((cmp: any) => {
          if (clicked) return;

          const text = String(cmp.text || cmp.tooltip || "");
          if (text.includes("Filtro") && typeof cmp.handler === "function") {
            cmp.handler.call(cmp.scope || cmp, cmp);
            clicked = true;
          } else if (text.includes("Filtro") && cmp.el?.dom) {
            cmp.el.dom.click();
            clicked = true;
          }
        });

        resolve({ ok: clicked, step: clicked ? "ext_clicked" : "ext_no_button" });
      } catch (e: any) {
        resolve({ ok: false, step: "ext_error", error: e?.message || String(e) });
      }
    });

    await sleep(1500);

    if (hasFiltroWindow()) {
      return { ok: true, step: "opened_by_ext", extResult };
    }

    return {
      ok: false,
      step: "not_opened",
      candidates: candidates.map((el) => ({
        text: (el.innerText || el.textContent || "").trim(),
        cls: el.className?.toString() || "",
      })),
      extResult,
      bodySample: document.body.innerText.slice(0, 800),
    };
  });

  debug.push(`Resultado abrir Filtro: ${JSON.stringify(result)}`);

  if (!result?.ok) {
    throw new Error(`No pude abrir Filtro. Paso: ${result?.step}`);
  }

  await wait(1500);
  await saveDebug(page, "pcct_07_filtro_open", debug);
}

async function setEstadoRevisionPCCT(frame: Frame, debug: string[]) {
  debug.push("Paso 8: seleccionar estado Revisión y Autorización PCCT");

  const result = await frame.evaluate(async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    function norm(v: any) {
      return String(v || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
    }

    function clickEl(el: Element | null) {
      if (!el) return false;
      const r = (el as HTMLElement).getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;

      for (const type of ["mouseover", "mousedown", "mouseup", "click"]) {
        (el as HTMLElement).dispatchEvent(
          new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y })
        );
      }
      return true;
    }

    function textOf(el: Element | null) {
      return (((el as HTMLElement | null)?.innerText || (el as HTMLInputElement | null)?.value || "") + "").trim();
    }

    const all = Array.from(document.querySelectorAll("*")) as HTMLElement[];
    const estadoLabel = all
      .filter((el) => norm(textOf(el)) === "estado:")
      .map((el) => ({ el, rect: el.getBoundingClientRect() }))
      .filter((x) => x.rect.width > 15 && x.rect.height > 8)
      .sort((a, b) => b.rect.top - a.rect.top)[0];

    if (!estadoLabel) return { ok: false, step: "no_estado_label" };

    const rowY = estadoLabel.rect.top + estadoLabel.rect.height / 2;

    const triggers = Array.from(
      document.querySelectorAll(".x-form-trigger, .x-form-arrow-trigger, img")
    ) as HTMLElement[];

    const rowTriggers = triggers
      .map((el) => ({ el, rect: el.getBoundingClientRect(), cls: el.className?.toString() || "" }))
      .filter((x) => {
        const cy = x.rect.top + x.rect.height / 2;
        return Math.abs(cy - rowY) < 22 && x.rect.width > 5 && x.rect.height > 5;
      })
      .sort((a, b) => b.rect.left - a.rect.left);

    if (!rowTriggers.length) {
      return { ok: false, step: "no_estado_row_trigger", rowY: Math.round(rowY) };
    }

    clickEl(rowTriggers[0].el);
    await sleep(1000);

    const openedText = norm(document.body.innerText);
    if (!openedText.includes("revision y autorizacion pcct")) {
      return {
        ok: false,
        step: "estado_dropdown_not_opened",
        clickedTrigger: {
          left: Math.round(rowTriggers[0].rect.left),
          top: Math.round(rowTriggers[0].rect.top),
          cls: rowTriggers[0].cls,
        },
        sample: document.body.innerText.slice(0, 1500),
      };
    }

    const nodes = Array.from(document.querySelectorAll("*")) as HTMLElement[];

    const pcct = nodes
      .filter((el) => norm(textOf(el)).includes("revision y autorizacion pcct"))
      .map((el) => ({ el, rect: el.getBoundingClientRect(), text: textOf(el) }))
      .filter((x) => x.rect.width > 5 && x.rect.height > 5)
      .sort((a, b) => {
        const aw = a.rect.width * a.rect.height;
        const bw = b.rect.width * b.rect.height;
        return aw - bw;
      })[0];

    if (!pcct) {
      return {
        ok: false,
        step: "pcct_visible_but_not_clickable",
        sample: document.body.innerText.slice(0, 1800),
      };
    }

    const x = pcct.rect.left + Math.min(40, pcct.rect.width / 2);
    const y = pcct.rect.top + pcct.rect.height / 2;

    for (const type of ["mouseover", "mousedown", "mouseup", "click"]) {
      pcct.el.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
        })
      );
    }

    await sleep(900);

    const values = Array.from(document.querySelectorAll("input"))
      .map((i) => (i as HTMLInputElement).value)
      .join(" | ");

    const ok = norm(values).includes("revision y autorizacion pcct");

    return { ok, step: ok ? "done" : "selected_but_not_confirmed", values };
  });

  debug.push(`Resultado estado: ${JSON.stringify(result)}`);

  if (!result?.ok) {
    throw new Error(`No pude seleccionar estado PCCT. Paso: ${result?.step}`);
  }
}

async function applyFiltro(frame: Frame, page: Page, debug: string[]) {
  debug.push("Paso 9: aplicar filtro");

  const result = await frame.evaluate(async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    function norm(v: any) {
      return String(v || "").replace(/\s+/g, " ").trim().toLowerCase();
    }

    function clickEl(el: Element | null) {
      if (!el) return false;

      const r = (el as HTMLElement).getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;

      for (const type of ["mouseover", "mousedown", "mouseup", "click"]) {
        (el as HTMLElement).dispatchEvent(
          new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
          })
        );
      }

      return true;
    }

    const all = Array.from(document.querySelectorAll("*")) as HTMLElement[];

    const aplicarCandidates = all
      .filter((el) => {
        const txt = norm(el.innerText || el.textContent || "");
        const r = el.getBoundingClientRect();
        return txt === "aplicar" && r.width > 10 && r.height > 8;
      })
      .map((el) => ({ el, rect: el.getBoundingClientRect() }))
      .sort((a, b) => b.rect.top - a.rect.top);

    if (!aplicarCandidates.length) {
      return {
        ok: false,
        step: "no_aplicar_button",
        sample: document.body.innerText.slice(0, 1200),
      };
    }

    clickEl(aplicarCandidates[0].el);
    await sleep(2500);

    return { ok: true, step: "aplicar_clicked" };
  });

  debug.push(`Resultado aplicar filtro: ${JSON.stringify(result)}`);

  if (!result?.ok) {
    throw new Error(`No pude hacer click en Aplicar. Paso: ${result?.step}`);
  }

  await wait(3500);
  await saveDebug(page, "pcct_08_filtro_aplicado", debug);
}

async function extractVisiblePts(frame: Frame, debug: string[]): Promise<PtRow[]> {
  debug.push("Paso 10: extraer PTs visibles filtrados");

  const rows = await frame.evaluate(() => {
    const allRows = Array.from(document.querySelectorAll(".x-grid3-row")) as HTMLElement[];

    return allRows
      .map((row) => {
        const text = (row.innerText || "").replace(/\s+/g, " ").trim();
        const idMatch = text.match(/\b20\d{2}-\d{5}\b/);
        if (!idMatch) return null;

        return {
          id: idMatch[0],
          raw: text,
        };
      })
      .filter(Boolean);
  });

  const parsed: PtRow[] = rows.map((r: any) => {
    const raw = String(r.raw || "");

    const id = r.id || "";
    const fechaMatch = raw.match(/\b\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}\b/);
    const fechaInicio = fechaMatch?.[0] || "";

    const estado = raw.includes("Revisión y Autorización PCCT")
      ? "Revisión y Autorización PCCT"
      : "";

    const tipoMatch = raw.match(
      /(DESCONEXIONES.*?\)|INTERVENCIONES.*?\)|SIN CONDICIONES.*?\)|PROTECCIONES.*?\)|SODI TERCEROS|SODI Dx|SODI Gx)/
    );

    const tipo = tipoMatch?.[0] || "";

    let descripcion = raw;
    if (tipo) {
      const idx = raw.indexOf(tipo);
      descripcion = raw.slice(idx + tipo.length).trim();
    }

    return {
      id,
      fechaInicio,
      estado,
      tipo,
      descripcion,
    };
  });

  const unique = Array.from(new Map(parsed.map((pt) => [pt.id, pt])).values());

  debug.push(`PTs visibles detectados: ${unique.map((p) => p.id).join(", ") || "ninguno"}`);
  debug.push(`Total PTs visibles PCCT: ${unique.length}`);

  return unique;
}

async function approveFirstVisiblePt(frame: Frame, page: Page, debug: string[]) {
  debug.push("Paso 11: aprobar primer PT visible de prueba");

  const result = await frame.evaluate(async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    function norm(v: any) {
      return String(v || "").replace(/\s+/g, " ").trim().toLowerCase();
    }

    function clickEl(el: Element | null) {
      if (!el) return false;

      const rect = (el as HTMLElement).getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;

      for (const type of ["mouseover", "mousedown", "mouseup", "click"]) {
        (el as HTMLElement).dispatchEvent(
          new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
          })
        );
      }

      return true;
    }

    const rows = Array.from(document.querySelectorAll(".x-grid3-row")) as HTMLElement[];
    const firstRow = rows.find((row) => /\b20\d{2}-\d{5}\b/.test(row.innerText || ""));

    if (!firstRow) return { ok: false, step: "no_visible_pt_row" };

    const ptId = (firstRow.innerText || "").match(/\b20\d{2}-\d{5}\b/)?.[0] || "";

    clickEl(firstRow);
    await sleep(1200);

    const all = Array.from(document.querySelectorAll("*")) as HTMLElement[];

    const aprobarCandidates = all
      .map((el) => ({
        el,
        txt: norm(el.innerText || el.textContent || ""),
        rect: el.getBoundingClientRect(),
        cls: el.className?.toString() || "",
      }))
      .filter((x) => {
        return (
          x.txt === "aprobar" &&
          x.rect.width > 20 &&
          x.rect.height > 10 &&
          x.rect.top < 120
        );
      })
      .sort((a, b) => b.rect.left - a.rect.left);

    if (!aprobarCandidates.length) {
      return { ok: false, step: "no_aprobar_button", ptId };
    }

    clickEl(aprobarCandidates[0].el);
    await sleep(1800);

    const afterApprove = Array.from(document.querySelectorAll("*")) as HTMLElement[];

    const aceptarCandidates = afterApprove
      .map((el) => ({
        el,
        txt: norm(el.innerText || el.textContent || ""),
        rect: el.getBoundingClientRect(),
      }))
      .filter((x) => x.txt === "aceptar" && x.rect.width > 20 && x.rect.height > 10)
      .sort((a, b) => b.rect.top - a.rect.top);

    if (!aceptarCandidates.length) {
      return {
        ok: false,
        step: "no_aceptar_popup",
        ptId,
        bodySample: document.body.innerText.slice(0, 1500),
      };
    }

    clickEl(aceptarCandidates[0].el);
    await sleep(2500);

    return { ok: true, step: "approved", ptId };
  });

  debug.push(`Resultado aprobar PT prueba: ${JSON.stringify(result)}`);

  if (!result?.ok) {
    throw new Error(`No pude aprobar PT de prueba. Paso: ${result?.step}`);
  }

  await saveDebug(page, "pcct_10_pt_aprobado", debug);

  return result;
}

async function setAreaTipoZonales(frame: Frame, debug: string[]) {
  debug.push("Paso Área 1: seleccionar tipo de área = Zonales");

  const result = await frame.evaluate(async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    function norm(v: any) {
      return String(v || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
    }

    function clickAt(x: number, y: number) {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      if (!el) return false;
      for (const type of ["mouseover", "mousedown", "mouseup", "click"]) {
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }));
      }
      return true;
    }

    function clickEl(el: Element | null) {
      if (!el) return false;
      const r = (el as HTMLElement).getBoundingClientRect();
      return clickAt(r.left + r.width / 2, r.top + r.height / 2);
    }

    function textOf(el: Element | null) {
      return (((el as HTMLElement | null)?.innerText || (el as HTMLInputElement | null)?.value || "") + "").trim();
    }

    const all = Array.from(document.querySelectorAll("*")) as HTMLElement[];
    const areaLabel = all
      .filter((el) => norm(textOf(el)) === "areas:")
      .map((el) => ({ el, rect: el.getBoundingClientRect() }))
      .filter((x) => x.rect.width > 10 && x.rect.height > 8)
      .sort((a, b) => b.rect.top - a.rect.top)[0];

    if (!areaLabel) return { ok: false, step: "no_area_label" };

    const rowY = areaLabel.rect.top + areaLabel.rect.height / 2;

    const triggers = Array.from(
      document.querySelectorAll(".x-form-trigger, .x-form-arrow-trigger, img")
    ) as HTMLElement[];

    const rowTriggers = triggers
      .map((el) => ({ el, rect: el.getBoundingClientRect(), cls: el.className?.toString() || "" }))
      .filter((x) => {
        const cy = x.rect.top + x.rect.height / 2;
        return Math.abs(cy - rowY) < 22 && x.rect.width > 5 && x.rect.height > 5;
      })
      .sort((a, b) => a.rect.left - b.rect.left);

    if (!rowTriggers.length) return { ok: false, step: "no_area_tipo_trigger" };

    clickEl(rowTriggers[0].el);
    await sleep(900);

    const nodes = Array.from(document.querySelectorAll("*")) as HTMLElement[];

    const zonales = nodes
      .filter((el) => norm(textOf(el)) === "zonales")
      .map((el) => ({ el, rect: el.getBoundingClientRect() }))
      .filter((x) => x.rect.width > 10 && x.rect.height > 8)
      .sort((a, b) => a.rect.top - b.rect.top)[0];

    if (!zonales) {
      return {
        ok: false,
        step: "no_zonales_option",
        sample: document.body.innerText.slice(0, 1500),
      };
    }

    clickEl(zonales.el);
    await sleep(900);

    const values = Array.from(document.querySelectorAll("input"))
      .map((i) => (i as HTMLInputElement).value)
      .join(" | ");

    return {
      ok: norm(values).includes("zonales"),
      step: norm(values).includes("zonales") ? "done" : "zonales_not_confirmed",
      values,
    };
  });

  debug.push(`Resultado tipo área Zonales: ${JSON.stringify(result)}`);

  if (!result?.ok) {
    throw new Error(`No pude seleccionar tipo de área Zonales. Paso: ${result?.step}`);
  }
}

async function openAreaSelectorPopup(frame: Frame, debug: string[]) {
  debug.push("Paso Área 2: abrir botón cuadrado derecho de Áreas");

  const result = await frame.evaluate(async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    function norm(v: any) {
      return String(v || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
    }

    function clickAt(x: number, y: number) {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      if (!el) return false;
      for (const type of ["mouseover", "mousedown", "mouseup", "click"]) {
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }));
      }
      return true;
    }

    function textOf(el: Element | null) {
      return (((el as HTMLElement | null)?.innerText || (el as HTMLInputElement | null)?.value || "") + "").trim();
    }

    const all = Array.from(document.querySelectorAll("*")) as HTMLElement[];
    const areaLabel = all
      .filter((el) => norm(textOf(el)) === "areas:")
      .map((el) => ({ el, rect: el.getBoundingClientRect() }))
      .filter((x) => x.rect.width > 10 && x.rect.height > 8)
      .sort((a, b) => b.rect.top - a.rect.top)[0];

    if (!areaLabel) return { ok: false, step: "no_area_label" };

    const rowY = areaLabel.rect.top + areaLabel.rect.height / 2;

    const clickable = Array.from(
      document.querySelectorAll(".x-form-trigger, .x-form-arrow-trigger, img, button, input")
    ) as HTMLElement[];

    const rowCandidates = clickable
      .map((el) => ({ el, rect: el.getBoundingClientRect(), txt: textOf(el), cls: el.className?.toString() || "" }))
      .filter((x) => {
        const cy = x.rect.top + x.rect.height / 2;
        return Math.abs(cy - rowY) < 25 && x.rect.width > 5 && x.rect.height > 5;
      })
      .sort((a, b) => b.rect.left - a.rect.left);

    if (!rowCandidates.length) {
      return { ok: false, step: "no_area_square_candidates" };
    }

    // El cuadrado derecho es el elemento más a la derecha de la fila Áreas.
    const target = rowCandidates[0];
    clickAt(target.rect.left + target.rect.width / 2, target.rect.top + target.rect.height / 2);
    await sleep(1200);

    const opened =
      norm(document.body.innerText).includes("editar lista") ||
      norm(document.body.innerText).includes("area zonal metropolitana");

    return {
      ok: opened,
      step: opened ? "done" : "popup_not_opened",
      clicked: {
        left: Math.round(target.rect.left),
        top: Math.round(target.rect.top),
        width: Math.round(target.rect.width),
        height: Math.round(target.rect.height),
        txt: target.txt,
        cls: target.cls,
      },
      sample: document.body.innerText.slice(0, 1200),
    };
  });

  debug.push(`Resultado abrir selector área: ${JSON.stringify(result)}`);

  if (!result?.ok) {
    throw new Error(`No pude abrir selector de Área Zonal Metropolitana. Paso: ${result?.step}`);
  }
}

async function selectAreaZonalMetropolitanaAndAccept(frame: Frame, debug: string[]) {
  debug.push("Paso Área 3: marcar Área Zonal Metropolitana y aceptar");

  const result = await frame.evaluate(async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    function norm(v: any) {
      return String(v || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
    }

    function clickAt(x: number, y: number) {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      if (!el) return false;
      for (const type of ["mouseover", "mousedown", "mouseup", "click"]) {
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }));
      }
      return true;
    }

    function clickEl(el: Element | null) {
      if (!el) return false;
      const r = (el as HTMLElement).getBoundingClientRect();
      return clickAt(r.left + r.width / 2, r.top + r.height / 2);
    }

    function textOf(el: Element | null) {
      return (((el as HTMLElement | null)?.innerText || (el as HTMLInputElement | null)?.value || "") + "").trim();
    }

    let all = Array.from(document.querySelectorAll("*")) as HTMLElement[];

    const metro = all
      .filter((el) => norm(textOf(el)).includes("area zonal metropolitana"))
      .map((el) => ({ el, rect: el.getBoundingClientRect(), txt: textOf(el) }))
      .filter((x) => x.rect.width > 10 && x.rect.height > 8)
      .sort((a, b) => {
        const aw = a.rect.width * a.rect.height;
        const bw = b.rect.width * b.rect.height;
        return aw - bw;
      })[0];

    if (!metro) {
      return {
        ok: false,
        step: "no_metro_option",
        sample: document.body.innerText.slice(0, 1600),
      };
    }

    // Primero click al checkbox a la izquierda del texto.
    clickAt(metro.rect.left - 18, metro.rect.top + metro.rect.height / 2);
    await sleep(500);

    // Respaldo: click en texto.
    clickEl(metro.el);
    await sleep(500);

    all = Array.from(document.querySelectorAll("*")) as HTMLElement[];

    const aceptar = all
      .filter((el) => norm(textOf(el)) === "aceptar")
      .map((el) => ({ el, rect: el.getBoundingClientRect() }))
      .filter((x) => x.rect.width > 20 && x.rect.height > 10)
      .sort((a, b) => b.rect.top - a.rect.top)[0];

    if (!aceptar) {
      return {
        ok: false,
        step: "no_aceptar_popup",
        sample: document.body.innerText.slice(0, 1600),
      };
    }

    clickEl(aceptar.el);
    await sleep(1200);

    const values = Array.from(document.querySelectorAll("input"))
      .map((i) => (i as HTMLInputElement).value)
      .join(" | ");

    const ok = norm(values).includes("area zonal metropolitana") || norm(document.body.innerText).includes("area zonal metropolitana");

    return {
      ok,
      step: ok ? "done" : "metro_not_confirmed",
      values,
    };
  });

  debug.push(`Resultado seleccionar Metropolitana: ${JSON.stringify(result)}`);

  if (!result?.ok) {
    throw new Error(`No pude marcar Área Zonal Metropolitana. Paso: ${result?.step}`);
  }
}

async function setAreaZonalMetropolitana(frame: Frame, debug: string[]) {
  debug.push("Paso Área Completo: configurar Áreas = Zonales / Área Zonal Metropolitana");

  await setAreaTipoZonales(frame, debug);
  await openAreaSelectorPopup(frame, debug);
  await selectAreaZonalMetropolitanaAndAccept(frame, debug);

  debug.push("Área Zonal Metropolitana configurada correctamente.");
}

async function aprobarTodosLosPT(page: Page, debug: string[]) {
  debug.push("🚀 Inicio aprobación masiva de PTs");

  let totalAprobados = 0;
  const aprobados: string[] = [];
  const fallidos: any[] = [];

  for (let intento = 1; intento <= 30; intento++) {
    const frame = await getPermisosFrame(page, debug);
    const pts = await extractVisiblePts(frame, debug);

    if (!pts.length) {
      debug.push("✅ No quedan PTs visibles por aprobar.");
      break;
    }

    debug.push(`Intento ${intento}: quedan ${pts.length} PT(s). Primero: ${pts[0].id}`);

    try {
      const result = await approveFirstVisiblePt(frame, page, debug);

      if (result?.ok) {
        totalAprobados++;

        const approvedPtId = result.ptId || pts[0]?.id || "PT_DESCONOCIDO";

        aprobados.push(approvedPtId);
        debug.push(`✅ PT aprobado masivo: ${approvedPtId}`);
      }

      await wait(3500);
    } catch (e: any) {
      fallidos.push({
        ptId: pts[0]?.id,
        error: e?.message || String(e),
      });

      debug.push(`❌ Falló aprobación masiva PT ${pts[0]?.id}: ${e?.message || e}`);
      break;
    }
  }

  return {
    ok: true,
    totalAprobados,
    aprobados,
    fallidos,
  };
}

export async function POST(req: NextRequest) {
  let browser: Browser | null = null;
  const debug: string[] = [];

  try {
    const body = await req.json().catch(() => ({}));
    const username = body?.username;
    const password = body?.password;

    if (!username || !password) {
      return NextResponse.json(
        {
          ok: false,
          error: "Falta username o password.",
          debug,
        },
        { status: 400 }
      );
    }

    ensureTmp();

    browser = await chromium.launch({
       headless: true,
       args: [
        "--ignore-certificate-errors",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        ],
    });

    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: {
        width: 1920,
        height: 1080,
        },
    });

    const page = await context.newPage();

    await login(page, username, password, debug);
    const permisosFrame = await goToPermisosTrabajo(page, debug);

    await openFiltro(permisosFrame, page, debug);

    const filtroFrame = await getFiltroFrame(page, debug);

    await setAreaZonalMetropolitana(filtroFrame, debug);
    await saveDebug(page, "pcct_07b_area_metropolitana_set", debug);

    await setEstadoRevisionPCCT(filtroFrame, debug);
    await saveDebug(page, "pcct_07c_estado_set", debug);

    await applyFiltro(filtroFrame, page, debug);

    const refreshedPermisosFrame = await getPermisosFrame(page, debug);
    const pts = await extractVisiblePts(refreshedPermisosFrame, debug);

    await saveDebug(page, "pcct_09_resultado", debug);

    const approveAllResult = await aprobarTodosLosPT(page, debug);

    return NextResponse.json({
      ok: true,
      message: `Aprobación masiva finalizada. PTs aprobados: ${approveAllResult.totalAprobados}`,
      countInicial: pts.length,
      ptsIniciales: pts,
      approveAllResult,
      debug,
    });
  } catch (error: any) {
    debug.push(`ERROR: ${error?.message || error}`);

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Error desconocido.",
        debug,
      },
      { status: 500 }
    );
  } finally {
    await browser?.close();
  }
}