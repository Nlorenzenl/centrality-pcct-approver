"use client";

import { useState } from "react";

type ProgressEvent =
  | { type: "log"; message: string }
  | { type: "step"; message: string; total?: number; current?: number }
  | { type: "detected"; message?: string; total: number; current?: number; pts?: any[]; debug?: string[] }
  | { type: "approving"; message?: string; current: number; total: number; ptId: string; aprobados?: string[]; fallidos?: any[] }
  | { type: "approved"; message?: string; current: number; total: number; ptId: string; aprobados?: string[]; fallidos?: any[] }
  | { type: "finished"; message?: string; total: number; current: number; aprobados: string[]; fallidos: any[]; debug?: string[] }
  | { type: "error"; message?: string; error: string; debug?: string[] };

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

  function aplicarEvento(evento: ProgressEvent) {
    if (evento.type === "log") {
      setDebugLog((prev) => [...prev, evento.message]);
      return;
    }

    if (evento.type === "step") {
      setEtapa(evento.message);
      setDebugLog((prev) => [...prev, evento.message]);
      return;
    }

    if (evento.type === "detected") {
      setTotalDetectados(evento.total || 0);
      setAprobadosCount(evento.current || 0);
      setEtapa(evento.message || `${evento.total || 0} PT(s) detectados.`);
      setDebugLog(evento.debug?.length ? evento.debug : [`PTs detectados: ${evento.total || 0}`]);
      return;
    }

    if (evento.type === "approving") {
      setTotalDetectados(evento.total || 0);
      setAprobadosCount(evento.current || 0);
      setEtapa(evento.message || `Aprobando PT ${evento.ptId}...`);
      setDebugLog((prev) => [...prev, `⏳ Aprobando ${evento.current}/${evento.total}: ${evento.ptId}`]);
      return;
    }

    if (evento.type === "approved") {
      setTotalDetectados(evento.total || 0);
      setAprobadosCount(evento.current || 0);
      setUltimoAprobado(evento.ptId);
      setAprobados(evento.aprobados || []);
      setFallidos(evento.fallidos || []);
      setEtapa(evento.message || `PT aprobado: ${evento.ptId}`);
      setDebugLog((prev) => [...prev, `✅ PT aprobado ${evento.current}/${evento.total}: ${evento.ptId}`]);
      return;
    }

    if (evento.type === "finished") {
      setTotalDetectados(evento.total || 0);
      setAprobadosCount(evento.current || 0);
      setAprobados(evento.aprobados || []);
      setFallidos(evento.fallidos || []);
      setEtapa(evento.message || "Proceso finalizado.");
      if (evento.debug?.length) setDebugLog(evento.debug);
      return;
    }

    if (evento.type === "error") {
      setError(evento.error || evento.message || "Error desconocido.");
      setEtapa("Error");
      if (evento.debug?.length) setDebugLog(evento.debug);
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
        const errorText = await res.clone().text().catch(() => "");
        throw new Error(errorText || "Error iniciando aprobación.");
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

        const eventos = buffer.split("\n\n");
        buffer = eventos.pop() || "";

        for (const eventoTexto of eventos) {
          const linea = eventoTexto
            .split("\n")
            .find((linea) => linea.startsWith("data:"));

          if (!linea) continue;

          const json = linea.replace(/^data:\s*/, "").trim();
          if (!json) continue;

          try {
            const evento = JSON.parse(json) as ProgressEvent;
            aplicarEvento(evento);
          } catch {
            setDebugLog((prev) => [...prev, `Evento no legible: ${json}`]);
          }
        }
      }

      setEtapa("Finalizado");
    } catch (e: any) {
      setError(e?.message || "Error inesperado.");
      setEtapa("Error");
    } finally {
      setLoading(false);
    }
  }

  const progreso =
    totalDetectados > 0
      ? Math.min((aprobadosCount / totalDetectados) * 100, 100)
      : 0;

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
          Filtra Área Zonal Metropolitana + estado Revisión y Autorización PCCT,
          y aprueba todos los PTs visibles uno por uno.
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
          style={{
            ...buttonStyle,
            opacity: loading || !username || !password ? 0.65 : 1,
          }}
          onClick={aprobarTodos}
          disabled={loading || !username || !password}
        >
          {loading ? "Aprobando..." : "Aprobar todos"}
        </button>

        <section style={progressCard}>
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
            <p style={{ margin: 0, color: "#475569", fontWeight: 800 }}>
              Último aprobado: <b>{ultimoAprobado}</b>
            </p>
          ) : null}
        </section>

        {error ? <div style={errorStyle}>{error}</div> : null}

        <div style={statsGrid}>
          <Stat title="PTs detectados inicialmente" value={totalDetectados} />
          <Stat title="PTs aprobados" value={aprobadosCount} />
          <Stat title="Fallidos" value={fallidos.length} />
        </div>

        <section style={boxStyle}>
          <h2 style={sectionTitle}>PTs aprobados</h2>

          {aprobados.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {aprobados.map((pt, index) => (
                <span key={`${pt}-${index}`} style={tagStyle}>
                  {pt}
                </span>
              ))}
            </div>
          ) : (
            <p style={{ color: "#64748b" }}>
              No hay PTs aprobados en esta ejecución.
            </p>
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
          <pre style={preStyle}>
            {debugLog.length ? debugLog.join("\n") : "Sin log aún."}
          </pre>
        </section>
      </section>

      {loading ? (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={spinnerStyle} />

            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>
              Aprobación en proceso
            </h2>

            <p style={{ color: "#475569", fontWeight: 800, textAlign: "center" }}>
              {etapa || "Centrality está procesando los PTs..."}
            </p>

            <div style={{ width: "100%" }}>
              <div style={progressBarBg}>
                <div style={{ ...progressBarFill, width: `${progreso}%` }} />
              </div>
            </div>

            <p style={{ margin: 0, fontWeight: 900 }}>
              {aprobadosCount}/{totalDetectados} PT(s)
            </p>

            {ultimoAprobado ? (
              <p style={{ margin: 0, color: "#475569", fontWeight: 800 }}>
                Último: {ultimoAprobado}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}

function Stat({ title, value }: { title: string; value: number }) {
  return (
    <div style={statStyle}>
      <div style={{ color: "#64748b", fontSize: 13, fontWeight: 800 }}>
        {title}
      </div>
      <div style={{ marginTop: 8, fontSize: 34, fontWeight: 900 }}>
        {value}
      </div>
    </div>
  );
}

const mainStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#edf2f8",
  padding: 20,
  fontFamily: "Arial, sans-serif",
  color: "#0f172a",
  display: "flex",
  justifyContent: "center",
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 980,
  background: "white",
  borderRadius: 18,
  padding: 28,
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
  border: "1px solid #dbe5f1",
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 36,
  fontWeight: 900,
};

const subtitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#475569",
  fontWeight: 700,
};

const formRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 6,
  fontWeight: 900,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
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
  border: "1px solid #e2e8f0",
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
  transition: "width 0.35s ease",
};

const statsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 12,
};

const statStyle: React.CSSProperties = {
  border: "1px solid #dbe5f1",
  borderRadius: 16,
  padding: 16,
  background: "#f8fafc",
};

const boxStyle: React.CSSProperties = {
  border: "1px solid #dbe5f1",
  borderRadius: 16,
  padding: 16,
  background: "white",
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
  padding: "7px 12px",
  borderRadius: 999,
  fontWeight: 900,
};

const errorStyle: React.CSSProperties = {
  background: "#fee2e2",
  color: "#991b1b",
  padding: 14,
  borderRadius: 12,
  fontWeight: 900,
};

const preStyle: React.CSSProperties = {
  margin: 0,
  background: "#0f172a",
  color: "#e2e8f0",
  padding: 14,
  borderRadius: 12,
  fontSize: 12,
  overflow: "auto",
  maxHeight: 280,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.45)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 9999,
};

const modalStyle: React.CSSProperties = {
  width: "min(430px, 90vw)",
  background: "white",
  padding: 28,
  borderRadius: 20,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 14,
  boxShadow: "0 20px 60px rgba(15, 23, 42, 0.3)",
};

const spinnerStyle: React.CSSProperties = {
  width: 58,
  height: 58,
  borderRadius: "50%",
  border: "6px solid #dbeafe",
  borderTopColor: "#2563eb",
  animation: "spin 1s linear infinite",
};