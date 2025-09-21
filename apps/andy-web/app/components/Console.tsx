"use client";
import React, { useEffect, useMemo, useState } from "react";

type Info = {
  ok: boolean; health: number; ms: number;
  service?: string | null; revision?: string | null;
  project?: string | null; gateway_url?: string | null;
  error?: string | null;
};

const card: React.CSSProperties = {
  border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, background: "#fff"
};
const col: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 8 };

function Code({ children }: { children: any }) {
  return (
    <pre style={{
      background: "#0b1020", color: "#d2e0ff", padding: 12, borderRadius: 10,
      overflowX: "auto", fontSize: 13, lineHeight: 1.35, maxHeight: 420
    }}>
      {typeof children === "string" ? children : JSON.stringify(children, null, 2)}
    </pre>
  );
}

export default function ConsolePanel() {
  const [info, setInfo] = useState<Info | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);

  const [model, setModel] = useState("gpt-5-mini");
  const [maxToks, setMaxToks] = useState(200);
  const [text, setText] = useState("hello from console");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<any>(null);

  const routes = useMemo(() => [
    "/", "/health", "/api/complete", "/api/estimate", "/api/proxy/*"
  ], []);

  useEffect(() => {
    (async () => {
      setLoadingInfo(true);
      try {
        const r = await fetch("/api/info", { cache: "no-store" });
        const j = await r.json().catch(() => null);
        if (j) setInfo(j);
      } finally { setLoadingInfo(false); }
    })();
  }, []);

  async function run() {
    setBusy(true); setOut(null);
    try {
      const r = await fetch("/api/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt: text, max_output_tokens: maxToks })
      });
      const t = await r.text();
      setOut(t ? JSON.parse(t) : { ok: r.ok, status: r.status });
    } catch (e:any) {
      setOut({ ok:false, error: e?.message ?? String(e) });
    } finally { setBusy(false); }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Status */}
      <div style={{ ...card }}>
        <h2 style={{ marginTop: 0 }}>Status</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
          <div style={col}>
            <div><b>{info?.ok ? "OK" : "ERR"}</b></div>
            <div>Health: {info?.health ?? 0}</div>
          </div>
          <div style={col}>
            <div>Latency: {info?.ms ?? 0}ms</div>
          </div>
          <div style={col}>
            <div>Service: {info?.service ?? "-"}</div>
          </div>
          <div style={col}>
            <div>Revision: {info?.revision ?? "-"}</div>
          </div>
          <div style={col}>
            <div>Gateway: {info?.gateway_url ?? "http://127.0.0.1:8787"}</div>
          </div>
        </div>
        {loadingInfo && <div style={{ opacity: .7, marginTop: 6 }}>refreshing…</div>}
      </div>

      {/* Service metadata + routes */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Service metadata</h3>
          <ul style={{ marginTop: 6 }}>
            <li>Ingress: internal-and-cloud-load-balancing (prod)</li>
            <li>Proxy: IAP OAuth (org allow-list)</li>
            <li>Auth to gateway: OIDC ID token (metadata)</li>
          </ul>
          <small>Logs: Cloud Logging pentru andy-web și andy-gateway.</small>
        </div>
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Routes</h3>
          <ul style={{ marginTop: 6 }}>
            {routes.map(r => <li key={r}><code>{r}</code></li>)}
          </ul>
        </div>
      </div>

      {/* Console */}
      <div style={{ ...card }}>
        <h3 style={{ marginTop: 0 }}>Andy Console</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 3fr auto", gap: 8, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, opacity: .8 }}>Model</div>
            <select value={model} onChange={e=>setModel(e.target.value)} style={{ width: "100%", padding: 6 }}>
              <option>gpt-5-mini</option>
              <option>gpt-5</option>
              <option>gpt-4.1-mini</option>
            </select>
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: .8 }}>Max tokens</div>
            <input type="number" min={1} max={4000} value={maxToks}
              onChange={e=>setMaxToks(Number(e.target.value)||200)}
              style={{ width: 120, padding: 6 }} />
          </div>
          <div />
        </div>

        <div style={{ marginTop: 8 }}>
          <textarea value={text} onChange={e=>setText(e.target.value)}
            style={{ width: "100%", minHeight: 140, padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }} />
        </div>

        <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={run} disabled={busy}
            style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid #111827", background: "#111827", color: "white" }}>
            {busy ? "Running…" : "Run"}
          </button>
          <small>Vezi și <a href="/api/models" target="_blank">/api/models</a> și <a href="/api/estimate" target="_blank">/api/estimate</a>.</small>
        </div>

        <div style={{ marginTop: 10 }}>
          <Code>{out ?? `{ /* output apare aici */ }`}</Code>
        </div>
      </div>
    </div>
  );
}
