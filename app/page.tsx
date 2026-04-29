"use client";

import React, { useEffect, useMemo, useState } from "react";
import { getCenAlertItems, toLocalDateInputValue } from "./lib/cenEssential";

type PtRow = {
  id: string;
  tipo: string;
  desde: string;
  hasta: string;
  area: string;
  descripcion: string;
  status?: string;
  source?: "centrality" | "manual";
  subestacion?: string;
};

type ReadPtsResponse = {
  ok?: boolean;
  rows?: any[];
  pts?: any[];
  data?: any[];
  debug?: string[];
  error?: string;
};

type CopyPtResponse = {
  ok?: boolean;
  message?: string;
  ptBase?: string;
  newPtId?: string | null;
  debug?: string[];
  error?: string;
};

type DayInfo = {
  key: string;
  date: Date;
  items: PtRow[];
  isCurrentMonth: boolean;
};

type TrabajoUI = {
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

const PT_BASE_SODI = "2026-06560";

function normalizeText(value: any) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeUpper(value: any) {
  return normalizeText(value).toUpperCase();
}

function extractSubestacion(text: string) {
  const source = normalizeText(text);
  if (!source) return "";

  const patterns = [
    /S\/E\s+([A-ZÁÉÍÓÚÑ0-9\-\s\/]+)/i,
    /SSEE\s+([A-ZÁÉÍÓÚÑ0-9\-\s\/]+)/i,
    /SE\s+([A-ZÁÉÍÓÚÑ0-9\-\s\/]+)/i,
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[1]) return normalizeText(match[1]).slice(0, 80);
  }

  const beforeSlash = source.split("/")[0];
  return normalizeText(beforeSlash).slice(0, 80);
}

function parseResponseRows(payload: ReadPtsResponse): PtRow[] {
  const rawRows = Array.isArray(payload?.rows)
    ? payload.rows
    : Array.isArray(payload?.pts)
    ? payload.pts
    : Array.isArray(payload?.data)
    ? payload.data
    : [];

  return rawRows
    .map((row: any) => {
      const descripcion = normalizeText(
        row?.descripcion ??
          row?.descripcionGeneral ??
          row?.trabajo ??
          row?.detalle ??
          ""
      );

      return {
        id: normalizeText(row?.id ?? row?.pt ?? row?.numeroPt ?? row?.numero ?? ""),
        tipo: normalizeText(row?.tipo ?? row?.tipoPermiso ?? row?.tipo_permiso ?? ""),
        desde: normalizeText(
          row?.desde ?? row?.inicio ?? row?.fechaInicio ?? row?.fecha_inicio ?? ""
        ),
        hasta: normalizeText(
          row?.hasta ?? row?.termino ?? row?.fechaFin ?? row?.fecha_fin ?? ""
        ),
        area: normalizeText(row?.area ?? row?.grupo ?? row?.zona ?? ""),
        descripcion,
        status: normalizeText(row?.status ?? row?.estado ?? ""),
        source: "centrality" as const,
        subestacion: extractSubestacion(descripcion),
      };
    })
    .filter((row) => row.id && row.desde);
}

function parseCentralityDate(value: string): Date | null {
  const text = normalizeText(value);
  if (!text) return null;

  const isoMatch = text.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (isoMatch) {
    const [, y, m, d, hh = "00", mm = "00", ss = "00"] = isoMatch;
    return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss));
  }

  const latamMatch = text.match(
    /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (latamMatch) {
    const [, d, m, y, hh = "00", mm = "00", ss = "00"] = latamMatch;
    return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss));
  }

  const fallback = new Date(text);
  if (!Number.isNaN(fallback.getTime())) return fallback;
  return null;
}

function formatDateKey(date: Date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateLabel(date: Date) {
  return date.toLocaleDateString("es-CL", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatShortHour(text: string) {
  const date = parseCentralityDate(text);
  if (!date) return "";
  return date.toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDateForInput(date: Date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildLocalDateTime(dateInput: string, hourInput: string) {
  const [y, m, d] = dateInput.split("-").map(Number);
  const [hh, mm] = hourInput.split(":").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0);
}

function monthName(date: Date) {
  return date.toLocaleDateString("es-CL", {
    month: "long",
    year: "numeric",
  });
}

function getPtAccent(pt: PtRow) {
  const tipo = normalizeUpper(pt.tipo);

  if (tipo.includes("SODI")) {
    return {
      bg: "#eef6ff",
      border: "#93c5fd",
      badgeBg: "#dbeafe",
      badgeText: "#1d4ed8",
      title: "#1d4ed8",
    };
  }

  if (tipo.includes("DESCONEX")) {
    return {
      bg: "#fff7ed",
      border: "#fdba74",
      badgeBg: "#fed7aa",
      badgeText: "#c2410c",
      title: "#c2410c",
    };
  }

  if (tipo.includes("INTERVEN")) {
    return {
      bg: "#effdf4",
      border: "#86efac",
      badgeBg: "#dcfce7",
      badgeText: "#15803d",
      title: "#15803d",
    };
  }

  return {
    bg: "#f8fafc",
    border: "#cbd5e1",
    badgeBg: "#e2e8f0",
    badgeText: "#334155",
    title: "#0f172a",
  };
}

function getMonthMatrix(baseDate: Date, items: PtRow[]): DayInfo[] {
  const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const end = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);

  const firstDay = new Date(start);
  const startWeekDay = (firstDay.getDay() + 6) % 7;
  firstDay.setDate(firstDay.getDate() - startWeekDay);

  const lastDay = new Date(end);
  const endWeekDay = (lastDay.getDay() + 6) % 7;
  lastDay.setDate(lastDay.getDate() + (6 - endWeekDay));

  const byDay = new Map<string, PtRow[]>();

  for (const item of items) {
    const date = parseCentralityDate(item.desde);
    if (!date) continue;
    const key = formatDateKey(date);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(item);
  }

  const result: DayInfo[] = [];
  const cursor = new Date(firstDay);

  while (cursor <= lastDay) {
    const key = formatDateKey(cursor);
    const dayItems = (byDay.get(key) || []).sort((a, b) => {
      const da = parseCentralityDate(a.desde)?.getTime() || 0;
      const db = parseCentralityDate(b.desde)?.getTime() || 0;
      return da - db;
    });

    result.push({
      key,
      date: new Date(cursor),
      items: dayItems,
      isCurrentMonth: cursor.getMonth() === baseDate.getMonth(),
    });

    cursor.setDate(cursor.getDate() + 1);
  }

  return result;
}

function toTrabajoUI(pt: PtRow): TrabajoUI {
  const fechaDate = parseCentralityDate(pt.desde);
  return {
    id: pt.id,
    fecha: fechaDate ? formatDateKey(fechaDate) : "",
    pt: pt.id,
    horaInicio: formatShortHour(pt.desde),
    horaFin: formatShortHour(pt.hasta),
    subestacion: pt.subestacion || extractSubestacion(pt.descripcion || ""),
    componente: pt.descripcion || "",
    actividad: pt.descripcion || "",
    estado: pt.status || "",
    tipo: pt.tipo || "",
    observacion: "",
    programador: "",
    area: pt.area || "",
    aviso: "",
    sodi: normalizeUpper(pt.tipo).includes("SODI") ? pt.id : "",
  };
}

function compareByStart(a: PtRow, b: PtRow) {
  const da = parseCentralityDate(a.desde)?.getTime() || 0;
  const db = parseCentralityDate(b.desde)?.getTime() || 0;
  return da - db;
}

function getDayVisualSummary(items: PtRow[]) {
  const sodi = items.filter((pt) => normalizeUpper(pt.tipo).includes("SODI")).length;
  const esenciales = items.filter((pt) => {
    const sub = normalizeUpper(pt.subestacion || extractSubestacion(pt.descripcion || ""));
    return [
      "SAN CRISTOBAL",
      "BRASIL",
      "LORD COCHRANE",
      "VITACURA",
      "ALONSO DE CORDOVA",
      "APOQUINDO",
    ].some((name) => sub.includes(name));
  }).length;

  return {
    total: items.length,
    sodi,
    esenciales,
  };
}

function MiniStat({ title, value }: { title: string; value: string }) {
  return (
    <div style={miniStatStyle}>
      <div style={{ color: "#64748b", fontSize: 12 }}>{title}</div>
      <div style={{ marginTop: 8, fontWeight: 800, fontSize: 32 }}>{value}</div>
    </div>
  );
}

function AlertCounter({ value, color }: { value: number; color: string }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        right: 14,
        width: 36,
        height: 36,
        borderRadius: 999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 800,
        fontSize: 26,
        color,
        background: `${color}22`,
      }}
    >
      {value}
    </div>
  );
}

function AlertRow({ alert }: { alert: any }) {
  return (
    <div
      style={{
        border: "1px solid #dbe5f1",
        borderRadius: 14,
        padding: 12,
        background: "#fff",
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 16 }}>{alert.pt || alert.id}</div>
      <div style={{ marginTop: 6, fontSize: 13, color: "#475569" }}>
        {alert.fecha || alert.desde} · {alert.subestacion || "Sin subestación"}
      </div>
      <div style={{ marginTop: 8, fontSize: 13, color: "#0f172a" }}>
        {alert.componente || alert.actividad || alert.descripcion || "-"}
      </div>
    </div>
  );
}

function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.42)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: 20,
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(980px, 100%)",
          maxHeight: "90vh",
          overflow: "auto",
          background: "white",
          borderRadius: 22,
          padding: 22,
          boxShadow: "0 24px 60px rgba(15, 23, 42, 0.22)",
          border: "1px solid #dbe5f1",
        }}
      >
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              border: "1px solid #cbd5e1",
              background: "#fff",
              borderRadius: 10,
              padding: "8px 14px",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Cerrar
          </button>
        </div>
        <div style={{ marginTop: 8 }}>{children}</div>
      </div>
    </div>
  );
}

export default function Page() {
  const [username, setUsername] = useState("Nicolás.Lorenzen");
  const [password, setPassword] = useState("");
  const [pts, setPts] = useState<PtRow[]>([]);
  const [debug, setDebug] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date(2026, 3, 1));
  const [selectedDay, setSelectedDay] = useState<DayInfo | null>(null);
  const [creatingPt, setCreatingPt] = useState(false);
  const [manualModalOpen, setManualModalOpen] = useState(false);

  const [manualForm, setManualForm] = useState({
    date: formatDateForInput(new Date(2026, 3, 20)),
    startTime: "08:00",
    endTime: "18:00",
    descripcion: "Trabajos por parte de tercero",
    subestacion: "LORD COCHRANE",
  });

  const monthDays = useMemo(() => getMonthMatrix(selectedMonth, pts), [selectedMonth, pts]);
  const trabajosUI = useMemo<TrabajoUI[]>(() => pts.map(toTrabajoUI), [pts]);
  const cenInfo = useMemo(() => getCenAlertItems(trabajosUI, new Date()), [trabajosUI]);

  const monthStats = useMemo(() => {
    const inMonth = pts.filter((pt) => {
      const d = parseCentralityDate(pt.desde);
      return (
        d &&
        d.getFullYear() === selectedMonth.getFullYear() &&
        d.getMonth() === selectedMonth.getMonth()
      );
    });

    const uniqueDays = new Set(
      inMonth
        .map((pt) => parseCentralityDate(pt.desde))
        .filter(Boolean)
        .map((d) => formatDateKey(d as Date))
    );

    return {
      totalPts: pts.length,
      visibles: pts.length,
      totalMes: inMonth.length,
      totalDiasConCarga: uniqueDays.size,
      totalSodi: inMonth.filter((pt) => normalizeUpper(pt.tipo).includes("SODI")).length,
      maxDia: monthDays.reduce((acc, day) => Math.max(acc, day.items.length), 0) || 0,
    };
  }, [pts, selectedMonth, monthDays]);

  useEffect(() => {
    if (!selectedDay) return;
    const refreshed = monthDays.find((d) => d.key === selectedDay.key);
    if (refreshed) setSelectedDay(refreshed);
  }, [pts, monthDays, selectedDay]);

  async function handleReadPts() {
    setLoading(true);
    setError("");
    setDebug([]);

    try {
      const res = await fetch("/api/centrality/pts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data: ReadPtsResponse = await res.json();

      if (!res.ok || data?.error) {
        setError(data?.error || "No pude leer los PTs.");
        setDebug(data?.debug || []);
        return;
      }

      const parsedRows = parseResponseRows(data).sort(compareByStart);
      setPts(parsedRows);
      setDebug(data?.debug || []);

      const firstDate = parsedRows
        .map((pt) => parseCentralityDate(pt.desde))
        .filter(Boolean)[0];

      if (firstDate) {
        setSelectedMonth(new Date(firstDate.getFullYear(), firstDate.getMonth(), 1));
      }
    } catch (err: any) {
      setError(err?.message || "Error inesperado leyendo PTs.");
    } finally {
      setLoading(false);
    }
  }

  function openManualModalFromDay(day: DayInfo) {
    setSelectedDay(day);
    setManualForm({
      date: formatDateForInput(day.date),
      startTime: "08:00",
      endTime: "18:00",
      descripcion: "Trabajos por parte de tercero",
      subestacion: "LORD COCHRANE",
    });
    setManualModalOpen(true);
  }

  async function handleCreateSodiTerceros() {
    if (!username || !password) {
      setError("Debes ingresar usuario y contraseña.");
      return;
    }

    if (!manualForm.date || !manualForm.startTime || !manualForm.endTime) {
      setError("Debes completar fecha y horario.");
      return;
    }

    setCreatingPt(true);
    setError("");

    try {
      const res = await fetch("/api/centrality/copy-pt-base", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          ptBase: PT_BASE_SODI,
        }),
      });

      const data: CopyPtResponse = await res.json();
      setDebug(data?.debug || []);

      if (!res.ok || data?.error || !data?.ok) {
        setError(data?.error || data?.message || "No pude crear el PT base en Centrality.");
        return;
      }

      if (!data?.newPtId) {
        setError("Centrality copió el PT, pero no pude detectar automáticamente el nuevo número.");
        return;
      }

      const start = buildLocalDateTime(manualForm.date, manualForm.startTime);
      const end = buildLocalDateTime(manualForm.date, manualForm.endTime);

      const newPt: PtRow = {
        id: data.newPtId,
        tipo: "SODI TERCEROS",
        desde: `${start.getFullYear()}-${`${start.getMonth() + 1}`.padStart(2, "0")}-${`${start.getDate()}`.padStart(2, "0")} ${`${start.getHours()}`.padStart(2, "0")}:${`${start.getMinutes()}`.padStart(2, "0")}:00`,
        hasta: `${end.getFullYear()}-${`${end.getMonth() + 1}`.padStart(2, "0")}-${`${end.getDate()}`.padStart(2, "0")} ${`${end.getHours()}`.padStart(2, "0")}:${`${end.getMinutes()}`.padStart(2, "0")}:00`,
        area: "Área CCT",
        descripcion: manualForm.descripcion,
        status: "Nueva",
        source: "manual",
        subestacion: manualForm.subestacion,
      };

      setPts((prev) => {
        const merged = [newPt, ...prev.filter((pt) => pt.id !== newPt.id)];
        return merged.sort(compareByStart);
      });

      const newMonth = new Date(start.getFullYear(), start.getMonth(), 1);
      setSelectedMonth(newMonth);
      setManualModalOpen(false);
    } catch (err: any) {
      setError(err?.message || "Error inesperado creando PT.");
    } finally {
      setCreatingPt(false);
    }
  }
    return (
    <div
      style={{
        minHeight: "100vh",
        background: "#edf2f8",
        padding: 20,
        color: "#0f172a",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ maxWidth: 1800, margin: "0 auto", display: "grid", gap: 16 }}>
        <section style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>
                Calendario CCT · Agenda OPAT / Centrality
              </h1>
              <p style={{ marginTop: 8, color: "#475569" }}>
                Vista mensual operativa basada en trabajos traídos desde Centrality.
              </p>
            </div>

            <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
              <div>
                <label style={labelStyle}>Usuario</label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  style={{ ...inputStyle, minWidth: 220 }}
                />
              </div>
              <div>
                <label style={labelStyle}>Contraseña</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ ...inputStyle, minWidth: 220 }}
                />
              </div>
              <button
                onClick={handleReadPts}
                disabled={loading}
                style={{ ...blueButton, opacity: loading ? 0.7 : 1 }}
              >
                {loading ? "Cargando..." : "Cargar OPAT"}
              </button>
            </div>
          </div>

          {error ? (
            <div
              style={{
                marginTop: 14,
                padding: 14,
                borderRadius: 12,
                background: "#fff1f2",
                border: "1px solid #fecdd3",
                color: "#b91c1c",
                fontWeight: 700,
              }}
            >
              {error}
            </div>
          ) : null}
        </section>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          <MiniStat title="Total cargados" value={String(monthStats.totalPts)} />
          <MiniStat title="Mostrados" value={String(monthStats.visibles)} />
          <MiniStat title="En mes visible" value={String(monthStats.totalMes)} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <section
            style={{
              ...cardStyle,
              border: "1px solid #f5d46f",
              background: "#fffdfa",
              position: "relative",
            }}
          >
            <AlertCounter color="#b45309" value={cenInfo.normal.length} />

            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
              Avisos CEN por 4 días hábiles
            </h2>
            <p style={{ marginTop: 8, color: "#64748b", fontSize: 13 }}>
              Último día operativo: {toLocalDateInputValue(cenInfo.effectiveToday)}
            </p>

            <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
              {cenInfo.normal.length === 0 ? (
                <div style={emptyAlertStyle}>
                  Hoy no hay trabajos normales que requieran aviso por regla de 4 días hábiles.
                </div>
              ) : (
                cenInfo.normal.map((alert) => <AlertRow key={alert.id} alert={alert} />)
              )}
            </div>
          </section>

          <section
            style={{
              ...cardStyle,
              border: "1px solid #f3b1b1",
              background: "#fffdfd",
              position: "relative",
            }}
          >
            <AlertCounter color="#dc2626" value={cenInfo.essential.length} />

            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
              Avisos CEN instalaciones esenciales
            </h2>
            <p style={{ marginTop: 8, color: "#64748b", fontSize: 13 }}>
              Regla de 12 días corridos · corte 07:00
            </p>

            <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
              {cenInfo.essential.length === 0 ? (
                <div style={emptyAlertStyle}>
                  Hoy no hay trabajos esenciales que venzan por la regla de 12 días.
                </div>
              ) : (
                cenInfo.essential.map((alert) => <AlertRow key={alert.id} alert={alert} />)
              )}
            </div>
          </section>
        </div>

        <section style={cardStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              marginBottom: 16,
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: 32, fontWeight: 800 }}>
                Calendario operativo
              </h2>
              <div style={{ marginTop: 8, color: "#475569", fontWeight: 700 }}>
                {monthName(selectedMonth)}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                style={secondaryButton}
                onClick={() =>
                  setSelectedMonth(
                    new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1, 1)
                  )
                }
              >
                ← Mes anterior
              </button>
              <button
                style={secondaryButton}
                onClick={() =>
                  setSelectedMonth(
                    new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1)
                  )
                }
              >
                Mes siguiente →
              </button>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: 12,
            }}
          >
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((name) => (
              <div
                key={name}
                style={{
                  textAlign: "center",
                  fontWeight: 800,
                  color: "#1e3a8a",
                  paddingBottom: 4,
                }}
              >
                {name}
              </div>
            ))}

            {monthDays.map((day) => {
              const visibleItems = day.items;
              const summary = getDayVisualSummary(day.items);

              return (
                <div
                  key={day.key}
                  onClick={() => setSelectedDay(day)}
                  style={{
                    height: 255,
                    minHeight: 255,
                    maxHeight: 255,
                    borderRadius: 18,
                    border: `1px solid ${day.isCurrentMonth ? "#d6dfec" : "#e5e7eb"}`,
                    background: day.isCurrentMonth ? "#fff" : "#f8fafc",
                    padding: 12,
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    boxShadow: day.items.length > 0 ? "0 8px 20px rgba(15, 23, 42, 0.06)" : "none",
                    opacity: day.isCurrentMonth ? 1 : 0.7,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 800,
                        fontSize: 24,
                        color: day.isCurrentMonth ? "#0f172a" : "#94a3b8",
                      }}
                    >
                      {day.date.getDate()}
                    </span>

                    {day.items.length > 0 ? (
                      <span
                        style={{
                          minWidth: 24,
                          height: 24,
                          borderRadius: 999,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 12,
                          fontWeight: 800,
                          color: "#2563eb",
                          background: "#eff6ff",
                          border: "1px solid #bfdbfe",
                          padding: "0 7px",
                        }}
                      >
                        {day.items.length}
                      </span>
                    ) : null}
                  </div>

                  {day.items.length > 0 ? (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 6,
                      }}
                    >
                      <span style={tinyBadgeBlue}>{summary.total} PT</span>
                      {summary.sodi > 0 ? <span style={tinyBadgeSky}>{summary.sodi} SODI</span> : null}
                      {summary.esenciales > 0 ? (
                        <span style={tinyBadgeRed}>{summary.esenciales} esc.</span>
                      ) : null}
                    </div>
                  ) : null}

                  <div
                    style={{
                      display: "grid",
                      gap: 6,
                      flex: 1,
                      overflowY: "auto",
                      maxHeight: 150,
                      minHeight: 150,
                      paddingRight: day.items.length > 0 ? 4 : 0,
                    }}
                  >
                    {visibleItems.map((item) => {
                      const accent = getPtAccent(item);

                      return (
                        <div
                          key={`${day.key}-${item.id}-${item.desde}`}
                          style={{
                            borderRadius: 12,
                            border: `1px solid ${accent.border}`,
                            background: accent.bg,
                            padding: "6px 8px",
                            display: "grid",
                            gap: 3,
                          }}
                        >
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "44px 1fr",
                              gap: 8,
                              alignItems: "start",
                            }}
                          >
                            <div
                              style={{
                                fontSize: 10,
                                fontWeight: 800,
                                color: "#334155",
                                lineHeight: 1.15,
                              }}
                            >
                              {formatShortHour(item.desde) || "--:--"}
                            </div>

                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  fontWeight: 800,
                                  fontSize: 10,
                                  color: accent.title,
                                  lineHeight: 1.2,
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {item.id}
                              </div>

                              <div
                                style={{
                                  marginTop: 2,
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: "#0f172a",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {item.subestacion || item.area || "Sin área"}
                              </div>
                            </div>
                          </div>

                          <div
                            style={{
                              fontSize: 10,
                              color: "#475569",
                              lineHeight: 1.25,
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                            }}
                          >
                            {item.descripcion}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {day.items.length > 0 ? (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 8,
                        marginTop: "auto",
                        paddingTop: 4,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          color: "#64748b",
                        }}
                      >
                        {day.items.length > 0 ? `${day.items.length} trabajo(s)` : ""}
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDay(day);
                        }}
                        style={{
                          border: "none",
                          background: "#eff6ff",
                          color: "#1d4ed8",
                          borderRadius: 10,
                          padding: "6px 10px",
                          fontSize: 11,
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        Abrir día
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      </div>
            {selectedDay ? (
        <Modal onClose={() => setSelectedDay(null)}>
          <div style={{ display: "grid", gap: 16 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "start",
                flexWrap: "wrap",
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>
                  {formatDateLabel(selectedDay.date)}
                </h3>
                <p style={{ marginTop: 8, color: "#475569" }}>
                  {selectedDay.items.length} PT(s) programado(s) en este día.
                </p>
              </div>

              <button
                style={primaryButton}
                onClick={() => openManualModalFromDay(selectedDay)}
              >
                + Crear SODI TERCEROS
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gap: 10,
                maxHeight: 430,
                overflow: "auto",
                paddingRight: 4,
              }}
            >
              {selectedDay.items.map((item) => {
                const accent = getPtAccent(item);

                return (
                  <div
                    key={`${item.id}-${item.desde}`}
                    style={{
                      border: `1px solid ${accent.border}`,
                      borderRadius: 16,
                      padding: 14,
                      background: accent.bg,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 20,
                            fontWeight: 800,
                            color: accent.title,
                          }}
                        >
                          {item.id}
                        </div>

                        <div
                          style={{
                            marginTop: 6,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            background: accent.badgeBg,
                            color: accent.badgeText,
                            borderRadius: 999,
                            padding: "6px 10px",
                            fontSize: 12,
                            fontWeight: 800,
                          }}
                        >
                          {item.tipo}
                        </div>
                      </div>

                      <div style={{ color: "#0f172a", fontWeight: 800 }}>
                        {formatShortHour(item.desde)}
                        {item.hasta ? ` - ${formatShortHour(item.hasta)}` : ""}
                      </div>
                    </div>

                    <div style={{ marginTop: 12, color: "#334155", fontWeight: 800 }}>
                      {item.subestacion || item.area || "Sin área"}
                    </div>

                    <div style={{ marginTop: 8, color: "#475569", lineHeight: 1.5 }}>
                      {item.descripcion}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Modal>
      ) : null}

      {manualModalOpen ? (
        <Modal onClose={() => setManualModalOpen(false)}>
          <div style={{ display: "grid", gap: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>
                Crear PT manual SODI TERCEROS
              </h3>
              <p style={{ marginTop: 8, color: "#475569" }}>
                Se copiará el PT base en Centrality y luego se agregará automáticamente a la agenda.
              </p>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <div>
                <label style={labelStyle}>Fecha</label>
                <input
                  type="date"
                  value={manualForm.date}
                  onChange={(e) => setManualForm((prev) => ({ ...prev, date: e.target.value }))}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>PT base</label>
                <input value={PT_BASE_SODI} disabled style={{ ...inputStyle, background: "#f8fafc" }} />
              </div>

              <div>
                <label style={labelStyle}>Hora inicio</label>
                <input
                  type="time"
                  value={manualForm.startTime}
                  onChange={(e) => setManualForm((prev) => ({ ...prev, startTime: e.target.value }))}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Hora término</label>
                <input
                  type="time"
                  value={manualForm.endTime}
                  onChange={(e) => setManualForm((prev) => ({ ...prev, endTime: e.target.value }))}
                  style={inputStyle}
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Subestación</label>
                <input
                  value={manualForm.subestacion}
                  onChange={(e) => setManualForm((prev) => ({ ...prev, subestacion: e.target.value }))}
                  style={inputStyle}
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Descripción</label>
                <textarea
                  value={manualForm.descripcion}
                  onChange={(e) => setManualForm((prev) => ({ ...prev, descripcion: e.target.value }))}
                  style={{ ...inputStyle, minHeight: 100, resize: "vertical" }}
                />
              </div>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <button
                style={secondaryButton}
                onClick={() => setManualModalOpen(false)}
                disabled={creatingPt}
              >
                Cancelar
              </button>

              <button
                style={{
                  ...primaryButton,
                  minWidth: 230,
                  opacity: creatingPt ? 0.7 : 1,
                }}
                onClick={handleCreateSodiTerceros}
                disabled={creatingPt}
              >
                {creatingPt ? "Creando PT..." : "Crear PT en Centrality"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "white",
  borderRadius: 18,
  padding: 16,
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.06)",
  border: "1px solid #dbe5f1",
};

const miniStatStyle: React.CSSProperties = {
  background: "white",
  borderRadius: 14,
  padding: 14,
  border: "1px solid #dbe5f1",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  padding: "12px 14px",
  fontSize: 15,
  outline: "none",
  background: "white",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 6,
  fontWeight: 800,
  color: "#0f172a",
};

const primaryButton: React.CSSProperties = {
  border: "none",
  background: "#0f172a",
  color: "white",
  borderRadius: 12,
  padding: "13px 18px",
  fontWeight: 800,
  cursor: "pointer",
};

const blueButton: React.CSSProperties = {
  border: "none",
  background: "#2563eb",
  color: "white",
  borderRadius: 12,
  padding: "13px 18px",
  fontWeight: 800,
  cursor: "pointer",
  minWidth: 140,
};

const secondaryButton: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  background: "white",
  color: "#0f172a",
  borderRadius: 12,
  padding: "13px 18px",
  fontWeight: 800,
  cursor: "pointer",
};

const emptyAlertStyle: React.CSSProperties = {
  border: "1px dashed #cbd5e1",
  borderRadius: 14,
  padding: 18,
  color: "#64748b",
  background: "#f8fafc",
};

const tinyBadgeBlue: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 999,
  padding: "3px 8px",
  fontSize: 10,
  fontWeight: 800,
  color: "#1d4ed8",
  background: "#dbeafe",
  border: "1px solid #bfdbfe",
};

const tinyBadgeSky: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 999,
  padding: "3px 8px",
  fontSize: 10,
  fontWeight: 800,
  color: "#0369a1",
  background: "#e0f2fe",
  border: "1px solid #bae6fd",
};

const tinyBadgeRed: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 999,
  padding: "3px 8px",
  fontSize: 10,
  fontWeight: 800,
  color: "#b91c1c",
  background: "#fee2e2",
  border: "1px solid #fecaca",
};