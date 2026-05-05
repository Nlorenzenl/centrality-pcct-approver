"use client";

import { useState } from "react";

export default function PcctApproverPage() {
  const [username, setUsername] = useState("Nicolás.Lorenzen");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const [totalDetectados, setTotalDetectados] = useState(0);
  const [aprobadosCount, setAprobadosCount] = useState(0);
  const [etapa, setEtapa] = useState("");

  async function aprobarTodos() {
    setLoading(true);
    setError(null);
    setResult(null);
    setEtapa("Detectando PTs...");
    setTotalDetectados(0);
    setAprobadosCount(0);

    try {
      const res = await fetch("/api/centrality/pcct-pending", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          password,
          mode: "approve",
        }),
      });

      let data: any;

      try {
        data = await res.json();
      } catch {
        const text = await res.text();
        throw new Error("Respuesta no válida del servidor: " + text);
      }

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Error al aprobar PTs.");
      }

      setResult(data);

      const total = data?.totalDetectados || data?.total || 0;
      const aprobados = data?.aprobados?.length || 0;

      setTotalDetectados(total);
      setAprobadosCount(aprobados);
      setEtapa("Finalizado");

    } catch (err: any) {
      setError(err.message || "Error inesperado.");
      setEtapa("Error");
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
          style={buttonStyle}
          onClick={aprobarTodos}
          disabled={loading}
        >
          {loading ? "Aprobando..." : "Aprobar todos"}
        </button>

        <div style={progressCard}>
          <h2 style={{ margin: 0 }}>
            {totalDetectados} PT(s) por aprobar detectados
          </h2>

          <div style={progressBarBg}>
            <div
              style={{
                ...progressBarFill,
                width:
                  totalDetectados > 0
                    ? `${(aprobadosCount / totalDetectados) * 100}%`
                    : "0%",
              }}
            />
          </div>

          <p style={{ margin: 0, fontWeight: 800 }}>
            {aprobadosCount}/{totalDetectados} PT(s) aprobados
          </p>

          <p style={{ margin: 0, color: "#64748b", fontWeight: 700 }}>
            {etapa}
          </p>
        </div>

        {error && <div style={errorStyle}>{error}</div>}

        {result?.aprobados?.length > 0 && (
          <div style={boxStyle}>
            <h3>PTs aprobados</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {result.aprobados.map((pt: string, i: number) => (
                <span key={i} style={tagStyle}>
                  {pt}
                </span>
              ))}
            </div>
          </div>
        )}

        {result?.debug?.length > 0 && (
          <div style={boxStyle}>
            <h3>Log de ejecución</h3>
            <pre style={preStyle}>
              {result.debug.join("\n")}
            </pre>
          </div>
        )}
      </section>

      {/* 🔥 POPUP EN PROCESO */}
      {loading && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={spinnerStyle} />

            <h2 style={{ margin: 0, fontWeight: 900 }}>
              Aprobación en proceso
            </h2>

            <p style={{ color: "#475569", fontWeight: 800 }}>
              {etapa || "Procesando..."}
            </p>

            <p style={{ fontWeight: 900 }}>
              {aprobadosCount}/{totalDetectados} PT(s)
            </p>
          </div>
        </div>
      )}
    </main>
  );
}

/* ====== ESTILOS ====== */

const mainStyle = {
  minHeight: "100vh",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  background: "#f1f5f9",
  padding: 24,
};

const cardStyle = {
  width: "100%",
  maxWidth: 900,
  background: "white",
  borderRadius: 20,
  padding: 28,
  display: "flex",
  flexDirection: "column" as const,
  gap: 16,
};

const titleStyle = {
  fontSize: 36,
  fontWeight: 900,
  margin: 0,
};

const subtitleStyle = {
  margin: 0,
  color: "#475569",
  fontWeight: 600,
};

const formRow = {
  display: "flex",
  gap: 12,
};

const labelStyle = {
  fontWeight: 800,
  fontSize: 14,
};

const inputStyle = {
  width: "100%",
  padding: 10,
  borderRadius: 10,
  border: "1px solid #cbd5f5",
};

const buttonStyle = {
  padding: 14,
  borderRadius: 12,
  background: "#2563eb",
  color: "white",
  fontWeight: 900,
  border: "none",
  cursor: "pointer",
};

const progressCard = {
  background: "#f8fafc",
  padding: 16,
  borderRadius: 12,
  display: "flex",
  flexDirection: "column" as const,
  gap: 8,
};

const progressBarBg = {
  width: "100%",
  height: 10,
  background: "#e2e8f0",
  borderRadius: 6,
};

const progressBarFill = {
  height: "100%",
  background: "#2563eb",
  borderRadius: 6,
};

const errorStyle = {
  background: "#fee2e2",
  color: "#991b1b",
  padding: 12,
  borderRadius: 10,
  fontWeight: 800,
};

const boxStyle = {
  background: "#f8fafc",
  padding: 16,
  borderRadius: 12,
};

const tagStyle = {
  background: "#dcfce7",
  padding: "6px 10px",
  borderRadius: 20,
  fontWeight: 800,
};

const preStyle = {
  background: "#0f172a",
  color: "#e2e8f0",
  padding: 12,
  borderRadius: 10,
  fontSize: 12,
  overflow: "auto" as const,
};

/* 🔥 POPUP */

const overlayStyle = {
  position: "fixed" as const,
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 9999,
};

const modalStyle = {
  background: "white",
  padding: 24,
  borderRadius: 16,
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "center",
  gap: 12,
};

const spinnerStyle = {
  width: 50,
  height: 50,
  borderRadius: "50%",
  border: "6px solid #dbeafe",
  borderTopColor: "#2563eb",
  animation: "spin 1s linear infinite",
};