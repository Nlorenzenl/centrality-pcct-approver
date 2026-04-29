export type TrabajoUI = {
  id: string;
  fecha: string;
  pt: string;
  horaInicio: string;
  horaFin: string;
  subestacion: string;
  componente: string;
  actividad: string;
  estado: string;
  tipo: string;
  observacion: string;
  programador: string;
  area: string;
  aviso: string;
  sodi: string;
};

export type CenAlertItem = {
  id: string;
  pt: string;
  fecha: string;
  subestacion: string;
  componente: string;
  actividad: string;
  aviso: string;
  motivo: "4_dias_habiles" | "12_dias_corridos";
};

type EssentialPattern = {
  source: string;
  category: "barra" | "lltt" | "transformador";
  tokens: string[];
};

export const CHILE_HOLIDAYS_2026 = [
  "2026-01-01",
  "2026-04-03",
  "2026-04-04",
  "2026-05-01",
  "2026-05-21",
  "2026-06-21",
  "2026-06-29",
  "2026-07-16",
  "2026-08-15",
  "2026-09-18",
  "2026-09-19",
  "2026-10-12",
  "2026-10-31",
  "2026-11-01",
  "2026-12-08",
  "2026-12-25",
];

export const ESSENTIAL_BARRAS = [
  "BA S/E KAPATUR 220KV BP1",
  "BA S/E KAPATUR 220KV BP2",
  "BA S/E BUIN (ENEL TRANSMISION) 110KV BP1",
  "BA S/E CHENA 110KV BP1",
  "BA S/E EL SALTO 110KV BP1-1",
  "BA S/E EL SALTO 110KV BP1-2",
  "BA S/E FLORIDA 110KV BP1",
  "BA S/E LOS ALMENDROS 110KV BP1",
  "BA S/E OCHAGAVIA 110KV BP1",
  "BA S/E OCHAGAVIA 110KV BP2",
  "BA S/E EL SALTO 110KV BP2-1",
  "BA S/E EL SALTO 110KV BP2-2",
  "BA S/E ANTILLANCA 110KV BP1",
  "BA S/E VALDIVIA (STS) 66KV BP1-S1",
  "BA S/E PILAUCO 66KV BP1",
  "BA S/E CHILOE 110KV BP1",
  "BA S/E CHENA 110KV BP2",
  "BA S/E CERRO NAVIA (STM II) 110KV B1",
  "BA S/E CERRO NAVIA (STM II) 110KV B2",
  "BA S/E EL SALTO 220KV BP1",
  "BA S/E LOS ALMENDROS 220KV BP2",
  "BA S/E ANTILLANCA 220KV BP1",
  "BA S/E PILAUCO 220KV BA1",
  "BA S/E CHENA 220KV BP1",
  "BA S/E CHENA 220KV BP2 (AIS)",
  "BA S/E MONTENEGRO 154KV BP1",
  "BA S/E PARGUA 220KV BP1",
  "BA S/E PARGUA 220KV BP2",
  "BA S/E CHILOE 220KV BP1",
  "BA S/E CHILOE 220KV BP2",
  "BA S/E PUERTO MONTT (STS) 220KV BP3",
  "BA S/E NUEVA LAMPA 220KV BP1",
  "BA S/E NUEVA LAMPA 220KV BP2",
];

export const ESSENTIAL_LLTT = [
  "PUERTO MONTT - MELIPULLI 220KV",
  "ALTO JAHUEL - BUIN (STM) 220KV",
  "SAN BERNARDO - MALLOCO 110KV",
  "ALTO JAHUEL - FLORIDA 110KV",
  "ALTO JAHUEL - LOS ALMENDROS 220KV",
  "CERRO NAVIA (STM) - CHENA 110KV",
  "LOS ALMENDROS - EL SALTO 110KV",
  "FLORIDA - LOS ALMENDROS 110KV",
  "TAP LO ESPEJO - BUIN (STM) 110KV",
  "LO ESPEJO - OCHAGAVIA 110KV",
  "OCHAGAVIA - FLORIDA 110KV",
  "POLPAICO (TRANSELEC) - EL SALTO 220KV",
  "EL SALTO - CERRO NAVIA (STM) 110KV",
  "RAHUE - PILAUCO 220KV",
  "ANTILLANCA - RAHUE 220KV",
  "KAPATUR - O'HIGGINS 220KV",
  "MELIPULLI - PARGUA 220KV",
  "LLANQUIHUE - TAP LLANQUIHUE 220KV",
  "PARGUA - NUEVA ANCUD 220KV",
  "NUEVA ANCUD - CHILOE 220KV",
];

export const ESSENTIAL_TRANSFORMERS = [
  "ANTILLANCA 220/110/23KV 180MVA ATR T1 + UR",
  "ATR N°1 220/110/13.8KV 400MVA",
  "CERRO NAVIA ATR N°2 220/110/13.2KV 400MVA",
  "CHENA 220/110/13.8KV 400MVA 1",
  "CHENA 220/110/13.8KV 400MVA 2",
  "CHILOE 220/110/23KV 90MVA ATR T1 + UR",
  "DEGAÑ 115/24KV 40MVA N°1",
  "EL SALTO 220/110/34.5KV 400MVA 1 + URC",
  "EL SALTO 220/110/34.5KV 400MVA 2 + URC",
  "LLANQUIHUE 230/69/24KV 90MVA T1",
  "LOS ALMENDROS 220/110KV 400MVA 1 + UR",
  "MELIPULLI 230/115/69KV 60MVA 11",
  "MELIPULLI 230/115/69KV 60MVA 22",
  "MONTENEGRO 230-254/69/13.8KV 75MVA T1",
  "NUEVA PICHIRROPULLI 230/69/24KV 90MVA N°1",
  "NUEVA PICHIRROPULLI 230/69/24KV 90MVA N°2",
  "PARGUA 230/115-69 KV 60MVA 1",
  "PILAUCO 220/66/23kV 120MVA ATR T1 + UR",
  "VALDIVIA 230/69/13,8KV 60MVA T1",
  "VALDIVIA 230/69/13,8KV 60MVA T4",
];

const COMMON_STOPWORDS = new Set([
  "s",
  "se",
  "e",
  "de",
  "del",
  "la",
  "el",
  "los",
  "las",
  "y",
  "en",
  "con",
  "para",
  "por",
  "ba",
  "kv",
  "mva",
  "stm",
  "sts",
  "ii",
  "iii",
  "bp",
  "n",
  "no",
  "ur",
  "urc",
  "tap",
  "cto",
]);

export function normalizeText(value: string) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[()]/g, " ")
    .replace(/[\/]/g, " ")
    .replace(/-/g, " ")
    .replace(/,/g, " ")
    .replace(/\./g, " ")
    .toLowerCase()
    .trim();
}

export function toLocalDateInputValue(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseISODateLocal(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function containsCenCorrelativo(value: string) {
  return /\d{8,}/.test(value || "");
}

export function requiresCenReview(trabajo: TrabajoUI) {
  if (normalizeText(trabajo.estado) === "suspendido") return false;

  const aviso = normalizeText(trabajo.aviso);

  if (!aviso) return true;
  if (aviso === "pendiente") return true;
  if (aviso === "no requiere") return false;
  if (containsCenCorrelativo(trabajo.aviso)) return false;

  return true;
}

function isHoliday(date: Date) {
  return CHILE_HOLIDAYS_2026.includes(toLocalDateInputValue(date));
}

function isBusinessDay(date: Date) {
  const day = date.getDay();
  const isWeekend = day === 0 || day === 6;
  return !isWeekend && !isHoliday(date);
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function subtractBusinessDays(date: Date, businessDays: number) {
  let d = new Date(date);
  let remaining = businessDays;

  while (remaining > 0) {
    d = addDays(d, -1);
    if (isBusinessDay(d)) remaining -= 1;
  }

  return d;
}

export function subtractCalendarDays(date: Date, days: number) {
  return addDays(date, -days);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function getEffectiveOperationalDate(now: Date) {
  const base = startOfDay(now);
  if (now.getHours() < 7) {
    return addDays(base, -1);
  }
  return base;
}

function sameDate(a: Date, b: Date) {
  return toLocalDateInputValue(a) === toLocalDateInputValue(b);
}

function tokenizeForEssential(value: string) {
  const normalized = normalizeText(value)
    .replace(/\bs\/e\b/g, " se ")
    .replace(/\bcto\b/g, " circuito ")
    .replace(/\bctos\b/g, " circuito ")
    .replace(/\bint\b/g, " interruptor ")
    .replace(/\btr\b/g, " transformador ")
    .replace(/\batr\b/g, " atr ")
    .replace(/\bn°/g, " n ")
    .replace(/\bnº/g, " n ")
    .replace(/\s+/g, " ")
    .trim();

  const rawTokens = normalized.split(" ").filter(Boolean);

  return rawTokens.filter((token) => {
    if (COMMON_STOPWORDS.has(token)) return false;
    if (/^\d+$/.test(token)) return true;
    if (token.length <= 1) return false;
    return true;
  });
}

function buildEssentialPatterns(): EssentialPattern[] {
  const barras = ESSENTIAL_BARRAS.map((source) => ({
    source,
    category: "barra" as const,
    tokens: tokenizeForEssential(source),
  }));

  const lltt = ESSENTIAL_LLTT.map((source) => ({
    source,
    category: "lltt" as const,
    tokens: tokenizeForEssential(source),
  }));

  const transformadores = ESSENTIAL_TRANSFORMERS.map((source) => ({
    source,
    category: "transformador" as const,
    tokens: tokenizeForEssential(source),
  }));

  return [...barras, ...lltt, ...transformadores];
}

const ESSENTIAL_PATTERNS = buildEssentialPatterns();

function countMatches(tokens: string[], haystack: string) {
  let matches = 0;
  for (const token of tokens) {
    if (haystack.includes(` ${token} `)) {
      matches += 1;
    }
  }
  return matches;
}

function detectFlexibleEssentialByRules(trabajo: TrabajoUI) {
  const haystack = ` ${tokenizeForEssential(
    [
      trabajo.subestacion,
      trabajo.componente,
      trabajo.actividad,
      trabajo.tipo,
      trabajo.observacion,
    ].join(" ")
  ).join(" ")} `;

  const hasVoltage =
    haystack.includes(" 110 ") ||
    haystack.includes(" 220 ") ||
    haystack.includes(" 154 ") ||
    haystack.includes(" 66 ");

  const hasLineWord =
    haystack.includes(" circuito ") ||
    haystack.includes(" linea ") ||
    haystack.includes(" interruptor ");

  const hasTransformerWord =
    haystack.includes(" atr ") ||
    haystack.includes(" transformador ") ||
    haystack.includes(" t1 ") ||
    haystack.includes(" t2 ") ||
    haystack.includes(" n1 ") ||
    haystack.includes(" n2 ");

  if (hasVoltage && hasLineWord) {
    const matchedSubstations = [
      "chena",
      "navia",
      "cerro",
      "salto",
      "florida",
      "almendros",
      "buin",
      "malloco",
      "san",
      "bernardo",
      "ochagavia",
      "polpaico",
      "kapatur",
      "ohiggins",
      "pilauco",
      "antillanca",
      "pichirropulli",
      "pargua",
      "chiloe",
      "puerto",
      "montt",
      "llanquihue",
      "nueva",
      "ancud",
      "alto",
      "jahuel",
      "melipulli",
    ].filter((name) => haystack.includes(` ${name} `));

    if (matchedSubstations.length >= 2) return true;
  }

  if (hasTransformerWord && hasVoltage) return true;

  return false;
}

export function isEssentialInstallation(trabajo: TrabajoUI) {
  const haystack = ` ${tokenizeForEssential(
    [
      trabajo.subestacion,
      trabajo.componente,
      trabajo.actividad,
      trabajo.tipo,
      trabajo.observacion,
    ].join(" ")
  ).join(" ")} `;

  const hasLineHint =
    haystack.includes(" linea ") ||
    haystack.includes(" circuito ") ||
    haystack.includes(" interruptor ") ||
    haystack.includes(" 110 ") ||
    haystack.includes(" 220 ") ||
    haystack.includes(" 154 ");

  const hasTransformerHint =
    haystack.includes(" atr ") ||
    haystack.includes(" transformador ") ||
    haystack.includes(" t1 ") ||
    haystack.includes(" t2 ") ||
    haystack.includes(" n1 ") ||
    haystack.includes(" n2 ");

  const hasBarraHint =
    haystack.includes(" barra ") ||
    haystack.includes(" bp1 ") ||
    haystack.includes(" bp2 ") ||
    haystack.includes(" b1 ") ||
    haystack.includes(" b2 ");

  for (const pattern of ESSENTIAL_PATTERNS) {
    const matches = countMatches(pattern.tokens, haystack);

    if (pattern.category === "lltt" && hasLineHint && matches >= 2) return true;
    if (pattern.category === "transformador" && hasTransformerHint && matches >= 2) return true;
    if (pattern.category === "barra" && (hasBarraHint || hasLineHint) && matches >= 2) return true;
  }

  return detectFlexibleEssentialByRules(trabajo);
}

export function getCenAlertItems(trabajos: TrabajoUI[], now: Date) {
  const effectiveToday = getEffectiveOperationalDate(now);

  const normal: CenAlertItem[] = [];
  const essential: CenAlertItem[] = [];

  for (const trabajo of trabajos) {
    if (!trabajo.fecha) continue;
    if (!requiresCenReview(trabajo)) continue;

    const workDate = parseISODateLocal(trabajo.fecha);

    // Igual que tu app antigua:
    // 4 días hábiles => restar 5 hábiles
    // 12 corridos => restar 13 corridos
    const lastDay4Business = subtractBusinessDays(workDate, 5);
    const lastDay12Calendar = subtractCalendarDays(workDate, 13);

    if (sameDate(lastDay4Business, effectiveToday)) {
      normal.push({
        id: `normal-${trabajo.id}`,
        pt: trabajo.pt,
        fecha: trabajo.fecha,
        subestacion: trabajo.subestacion,
        componente: trabajo.componente,
        actividad: trabajo.actividad,
        aviso: trabajo.aviso,
        motivo: "4_dias_habiles",
      });
    }

    if (isEssentialInstallation(trabajo) && sameDate(lastDay12Calendar, effectiveToday)) {
      essential.push({
        id: `essential-${trabajo.id}`,
        pt: trabajo.pt,
        fecha: trabajo.fecha,
        subestacion: trabajo.subestacion,
        componente: trabajo.componente,
        actividad: trabajo.actividad,
        aviso: trabajo.aviso,
        motivo: "12_dias_corridos",
      });
    }
  }

  return { normal, essential, effectiveToday };
}