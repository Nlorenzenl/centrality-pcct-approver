"use client";

import { useState } from "react";

type ProgressEvent = {
  type?: "step" | "detected" | "approving" | "approved" | "finished" | "error" | "log";
  message?: string;
  total?: number;
  current?: number;
  ptId?: string;
  aprobados?: string[];
  fallidos?: any[];
  debug?: string[];
  error?: string;
};

export default function PcctApproverPage() {
  const [username, setUsername] = useState("Nicolás.Lorenzen");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");
  const [etapa, setEtapa] = useState("");

  const [totalDetectados, setTotalDetectados] = useState(0);
  const [aprobadosCount, setAprobadosCount] = useState(0);
  const [ultimoAprobado, setUltimoAprobado] = useState("");

  const [aprobados, setAprobados] = useState<string[]>([]);
  const [fallidos, setFallidos] = useState<any[]>([]);
  const [debugLog, setDebugLog] = useState<string[]>([]);

  const progreso = totalDetectados > 0 ? Math.min((aprobadosCount / totalDetectados) * 100, 100) : 0;

  function aplicarEvento(evento: ProgressEvent) {
    if (evento.message) {
      setEtapa(evento.message);
      setDebugLog((prev) => [...prev, evento.message!]);
    }

    if (typeof evento.total === "number") {
      setTotalDetectados(evento.total);
    }

    if (typeof evento.current === "number") {
      setAprobadosCount(evento.current);
    }

    if (evento.ptId && evento.type === "approved") {
      setUltimoAprobado(evento.ptId);
    }

    if (Array.isArray(evento.aprobados)) {
      setAprobados([...new Set(evento.aprobados)]);
    }

    if (Array.isArray(evento.fallidos)) {
      setFallidos(evento.fallidos);
    }

    if (Array.isArray(evento.debug)) {
      setDebugLog(evento.debug);
    }

    if (evento.type === "error") {
      setError(evento.error || evento.message || "Error desconocido.");
    }
  }

  async function aprobarTodos() {
    setLoading(true);
    setError("");
    setEtapa("Iniciando proceso...");
    setTotalDetectados(0);
    setAprobadosCount(0);
    setUltimoAprobado("");
    setAprobados([]);
    setFallidos([]);
    setDebugLog([]);

    try {
      const res = await fetch("/api/centrality/pcct-pending", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          password,
          stream: true,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Error iniciando aprobación.");
      }

      if (!res.body) {
        throw new Error("El servidor no devolvió stream de progreso.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const partes = buffer.split("\n\n");
        buffer = partes.pop() || "";

        for (const parte of partes) {
          const lineas = parte.split("\n");
          for (const linea of lineas) {
            if (!linea.startsWith("data:")) continue;
            const json = linea.replace(/^data:\s*/, "").trim();
            if (!json) continue;

            try {
              const evento = JSON.parse(json) as ProgressEvent;
              aplicarEvento(evento);
            } catch {
              setDebugLog((prev) => [...prev, `No pude leer evento: ${json}`]);
            }
          }
        }
      }
    } catch (e: any) {
      setError(e?.message || "Error inesperado.");
      setEtapa("Error inesperado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={mainStyle}>
      <style>
        {`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>

      <section style={cardStyle}>
        <h1 style={titleStyle}>Aprobador automático PCCT</h1>
        <p style={subtitleStyle}>
          Filtra Área Zonal Metropolitana + estado Revisión y Autorización PCCT, y aprueba todos los PTs visibles uno por uno.
        </p>

        <div style={formRow}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Usuario Centrality</label>
            <input
              style={inputStyle}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Contraseña</label>
            <input
              type="password"
              style={inputStyle}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>

        <button
          style={{ ...buttonStyle, opacity: loading || !username || !password ? 0.7 : 1 }}
          onClick={aprobarTodos}
          disabled={loading || !username || !password}
        >
          {loading ? "Aprobando..." : "Aprobar todos"}
        </button>

        <div style={progressCard}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>
            {totalDetectados} PT(s) por aprobar detectados
          </h2>

          <p style={{ margin: 0, color: "#475569", fontWeight: 800 }}>
            {etapa || "Esperando ejecución..."}
          </p>

          <div style={progressBarBg}>
            <div style={{ ...progressBarFill, width: `${progreso}%` }} />
          </div>

          <p style={{ margin: 0, fontWeight: 900 }}>
            {aprobadosCount}/{totalDetectados} PT(s) aprobados
          </p>

          {ultimoAprobado ? (
            <p style={{ margin: 0, color: "#475569", fontWeight: 700 }}>
              Último aprobado: <b>{ultimoAprobado}</b>
            </p>
          ) : null}
        </div>

        {error ? <div style={errorStyle}>{error}</div> : null}

        <div style={statsRow}>
          <Stat title="PTs detectados inicialmente" value={String(totalDetectados)} />
          <Stat title="PTs aprobados" value={String(aprobadosCount)} />
          <Stat title="Fallidos" value={String(fallidos.length)} />
        </div>

        <section style={boxStyle}>
          <h2 style={sectionTitle}>PTs aprobados</h2>
          {aprobados.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {aprobados.map((pt, i) => (
                <span key={`${pt}-${i}`} style={tagStyle}>
                  {pt}
                </span>
              ))}
            </div>
          ) : (
            <p style={{ color: "#64748b", margin: 0 }}>No hay PTs aprobados en esta ejecución.</p>
          )}
        </section>

        {fallidos.length ? (
          <section style={boxStyle}>
            <h2 style={sectionTitle}>Fallidos</h2>
            <pre style={preStyle}>{JSON.stringify(fallidos, null, 2)}</pre>
          </section>
        ) : null}

        <section style={boxStyle}>
          <h2 style={sectionTitle}>Log de ejecución</h2>
          <pre style={preStyle}>{debugLog.join("\n")}</pre>
        </section>
      </section>

      {loading ? (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={spinnerStyle} />
            <h2 style={{ margin: 0, fontWeight: 900 }}>Aprobación en proceso</h2>
            <p style={{ color: "#475569", fontWeight: 800, textAlign: "center" }}>
              {etapa || "Procesando..."}
            </p>
            <p style={{ fontWeight: 900, margin: 0 }}>
              {aprobadosCount}/{totalDetectados} PT(s)
            </p>
            <div style={{ ...progressBarBg, width: "100%" }}>
              <div style={{ ...progressBarFill, width: `${progreso}%` }} />
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <div style={statStyle}>
      <div style={{ color: "#64748b", fontSize: 13, fontWeight: 800 }}>{title}</div>
      <div style={{ marginTop: 8, fontSize: 34, fontWeight: 900 }}>{value}</div>
    </div>
  );
}

const mainStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  justifyContent: "center",
  alignItems: "flex-start",
  background: "#f1f5f9",
  padding: 24,
  color: "#0f172a",
  fontFamily: "Arial, sans-serif",
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 980,
  background: "white",
  borderRadius: 20,
  padding: 28,
  display: "flex",
  flexDirection: "column",
  gap: 18,
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
};

const titleStyle: React.CSSProperties = {
  fontSize: 36,
  fontWeight: 900,
  margin: 0,
};

const subtitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#475569",
  fontWeight: 600,
  lineHeight: 1.5,
};

const formRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontWeight: 900,
  fontSize: 15,
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "13px 14px",
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  fontSize: 16,
  boxSizing: "border-box",
};

const buttonStyle: React.CSSProperties = {
  padding: 16,
  borderRadius: 12,
  background: "#2563eb",
  color: "white",
  fontWeight: 900,
  border: "none",
  cursor: "pointer",
  fontSize: 17,
};

const progressCard: React.CSSProperties = {
  background: "#f8fafc",
  padding: 18,
  borderRadius: 16,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  border: "1px solid #dbe5f1",
};

const progressBarBg: React.CSSProperties = {
  width: "100%",
  height: 14,
  background: "#e2e8f0",
  borderRadius: 999,
  overflow: "hidden",
};

const progressBarFill: React.CSSProperties = {
  height: "100%",
  background: "#2563eb",
  borderRadius: 999,
  transition: "width 0.4s ease",
};

const statsRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 12,
};

const statStyle: React.CSSProperties = {
  background: "#f8fafc",
  padding: 16,
  borderRadius: 16,
  border: "1px solid #dbe5f1",
};

const errorStyle: React.CSSProperties = {
  background: "#fee2e2",
  color: "#991b1b",
  padding: 14,
  borderRadius: 14,
  fontWeight: 900,
  border: "1px solid #fecaca",
};

const boxStyle: React.CSSProperties = {
  background: "#ffffff",
  padding: 16,
  borderRadius: 16,
  border: "1px solid #dbe5f1",
};

const sectionTitle: React.CSSProperties = {
  margin: 0,
  marginBottom: 12,
  fontSize: 22,
  fontWeight: 900,
};

const tagStyle: React.CSSProperties = {
  background: "#dcfce7",
  color: "#166534",
  padding: "7px 11px",
  borderRadius: 999,
  fontWeight: 900,
  fontSize: 13,
};

const preStyle: React.CSSProperties = {
  background: "#0f172a",
  color: "#e2e8f0",
  padding: 14,
  borderRadius: 14,
  fontSize: 12,
  overflow: "auto",
  maxHeight: 280,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  margin: 0,
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.42)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 9999,
};

const modalStyle: React.CSSProperties = {
  width: "min(440px, 90vw)",
  background: "white",
  padding: 28,
  borderRadius: 20,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 14,
  boxShadow: "0 20px 60px rgba(15, 23, 42, 0.32)",
};

const spinnerStyle: React.CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: "50%",
  border: "6px solid #dbeafe",
  borderTopColor: "#2563eb",
  animation: "spin 1s linear infinite",
};