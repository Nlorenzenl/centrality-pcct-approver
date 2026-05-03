"use client";

import { useState } from "react";

export default function PcctApproverPage() {
  const [username, setUsername] = useState("Nicolás.Lorenzen");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  const [totalDetectados, setTotalDetectados] = useState(0);
  const [aprobadosCount, setAprobadosCount] = useState(0);
  const [ultimoAprobado, setUltimoAprobado] = useState("");
  const [etapa, setEtapa] = useState("");

  async function aprobarTodos() {
    setLoading(true);
    setError("");
    setResult(null);
    setTotalDetectados(0);
    setAprobadosCount(0);
    setUltimoAprobado("");
    setEtapa("Detectando PTs por aprobar...");

    try {
      const detectRes = await fetch("/api/centrality/pcct-pending", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          password,
          mode: "detect",
        }),
      });

      const detectData = await detectRes.json();

      if (!detectRes.ok || !detectData.ok) {
        setError(detectData.error || "Error detectando PTs.");
        setResult(detectData);
        setEtapa("Error detectando PTs.");
        return;
      }

      const total = detectData.count || 0;
      setTotalDetectados(total);
      setResult(detectData);

      if (total === 0) {
        setEtapa("No hay PTs por aprobar. Bandeja limpia.");
        return;
      }

      setEtapa(`${total} PT(s) detectados. Iniciando aprobación...`);

      const aprobadosTemp: string[] = [];

      for (let i = 1; i <= total; i++) {
        setEtapa(`Aprobando PT ${i} de ${total}...`);

        const approveRes = await fetch("/api/centrality/pcct-pending", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username,
            password,
            mode: "approveOne",
          }),
        });

        const approveData = await approveRes.json();

        if (!approveRes.ok || !approveData.ok) {
          setError(approveData.error || "Error aprobando PT.");
          setResult(approveData);
          setEtapa(`Error aprobando PT ${i} de ${total}.`);
          break;
        }

        if (!approveData.approved?.ok) {
          setEtapa("No quedan más PTs por aprobar.");
          break;
        }

        const ptId = approveData?.approved?.ptId || `PT ${i}`;
        aprobadosTemp.push(ptId);

        setAprobadosCount(aprobadosTemp.length);
        setUltimoAprobado(ptId);
        setEtapa(`Aprobado ${aprobadosTemp.length} de ${total}. Último PT: ${ptId}`);

        setResult({
          ...approveData,
          approveAllResult: {
            totalAprobados: aprobadosTemp.length,
            aprobados: aprobadosTemp,
            fallidos: [],
          },
        });

        await new Promise((resolve) => setTimeout(resolve, 350));
      }

      setEtapa("Proceso finalizado.");
    } catch (e: any) {
      setError(e?.message || "Error inesperado.");
      setEtapa("Error inesperado.");
    } finally {
      setLoading(false);
    }
  }

  const aprobados =
    result?.approveAllResult?.aprobados ||
    result?.aprobados ||
    [];

  const fallidos =
    result?.approveAllResult?.fallidos ||
    result?.fallidos ||
    [];

  const progreso =
    totalDetectados > 0
      ? Math.min((aprobadosCount / totalDetectados) * 100, 100)
      : 0;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#edf2f8",
        padding: "16px",
        fontFamily: "Arial, sans-serif",
        color: "#0f172a",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: 980,
          background: "white",
          borderRadius: 18,
          padding: 22,
          boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
          border: "1px solid #dbe5f1",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>
          Aprobador automático PCCT
        </h1>

        <p style={{ marginTop: 10, color: "#475569", fontSize: 16 }}>
          Filtra Área Zonal Metropolitana + estado Revisión y Autorización PCCT,
          y aprueba todos los PTs visibles uno por uno.
        </p>

        <div
          style={{
            marginTop: 24,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 14,
          }}
        >
          <div>
            <label style={labelStyle}>Usuario Centrality</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>

        <button
          onClick={aprobarTodos}
          disabled={loading || !username || !password}
          style={{
            ...primaryButton,
            marginTop: 14,
            width: "100%",
            opacity: loading || !username || !password ? 0.65 : 1,
          }}
        >
          {loading ? "Aprobando..." : "Aprobar todos"}
        </button>

        {(loading || totalDetectados > 0 || etapa) && (
          <section style={{ ...boxStyle, marginTop: 20 }}>
            <h2 style={sectionTitle}>
              {totalDetectados} PT(s) por aprobar detectados
            </h2>

            {etapa ? (
              <p style={{ marginTop: 0, color: "#475569", fontWeight: 800 }}>
                {etapa}
              </p>
            ) : null}

            <div
              style={{
                width: "100%",
                height: 20,
                background: "#e2e8f0",
                borderRadius: 999,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${progreso}%`,
                  background: "#2563eb",
                  transition: "width 0.4s ease",
                }}
              />
            </div>

            <p style={{ marginTop: 12, fontWeight: 900 }}>
              {aprobadosCount}/{totalDetectados} PT(s) aprobados
            </p>

            {ultimoAprobado ? (
              <p style={{ color: "#475569", marginBottom: 0 }}>
                Último aprobado: <b>{ultimoAprobado}</b>
              </p>
            ) : null}
          </section>
        )}

        {error ? (
          <div
            style={{
              marginTop: 18,
              padding: 14,
              borderRadius: 14,
              background: "#fff1f2",
              border: "1px solid #fecdd3",
              color: "#b91c1c",
              fontWeight: 800,
            }}
          >
            {error}
          </div>
        ) : null}

        <div style={{ marginTop: 24, display: "grid", gap: 16 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 12,
            }}
          >
            <Stat
              title="PTs detectados inicialmente"
              value={String(totalDetectados || result?.countInicial || result?.count || 0)}
            />
            <Stat
              title="PTs aprobados"
              value={String(aprobadosCount || result?.approveAllResult?.totalAprobados || 0)}
            />
            <Stat title="Fallidos" value={String(fallidos.length)} />
          </div>

          <section style={boxStyle}>
            <h2 style={sectionTitle}>PTs aprobados</h2>

            {aprobados.length ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {aprobados.map((pt: string, index: number) => (
                  <span key={`${pt}-${index}`} style={pillStyle}>
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
              {(result?.debug || []).join("\n")}
            </pre>
          </section>
        </div>
      </section>
    </main>
  );
}

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <div
      style={{
        border: "1px solid #dbe5f1",
        borderRadius: 16,
        padding: 16,
        background: "#f8fafc",
      }}
    >
      <div style={{ color: "#64748b", fontSize: 13, fontWeight: 700 }}>
        {title}
      </div>
      <div style={{ marginTop: 8, fontSize: 34, fontWeight: 900 }}>
        {value}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 6,
  fontWeight: 800,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  padding: "12px 14px",
  fontSize: 15,
  outline: "none",
  boxSizing: "border-box",
};

const primaryButton: React.CSSProperties = {
  border: "none",
  borderRadius: 12,
  padding: "14px 20px",
  background: "#2563eb",
  color: "white",
  fontWeight: 900,
  cursor: "pointer",
  fontSize: 16,
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
  fontSize: 20,
  fontWeight: 900,
};

const pillStyle: React.CSSProperties = {
  display: "inline-flex",
  padding: "7px 11px",
  borderRadius: 999,
  background: "#dcfce7",
  color: "#166534",
  fontWeight: 900,
  fontSize: 13,
};

const preStyle: React.CSSProperties = {
  margin: 0,
  background: "#0f172a",
  color: "#e2e8f0",
  borderRadius: 14,
  padding: 14,
  overflow: "auto",
  maxHeight: 260,
  fontSize: 12,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};