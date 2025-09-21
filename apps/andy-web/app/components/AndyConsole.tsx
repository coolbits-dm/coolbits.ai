'use client';
import { useState } from "react";

const MODELS = ["gpt-5-mini","gpt-5","gpt-4.1-mini"]; // no o3*

export default function AndyConsole(){
  const [model,setModel]=useState("gpt-5-mini");
  const [input,setInput]=useState("");
  const [maxTokens,setMaxTokens]=useState(200);
  const [loading,setLoading]=useState(false);
  const [out,setOut]=useState<any>(null);

  async function run(){
    setLoading(true);
    setOut(null);
    const r = await fetch("/api/complete",{ method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ model, input, max_output_tokens: maxTokens }) });
    const j = await r.json().catch(()=> ({}));
    setOut(j);
    setLoading(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center">
        <label>Model</label>
        <select value={model} onChange={e=>setModel(e.target.value)} className="border px-2 py-1 rounded">
          {MODELS.map(m=> <option key={m} value={m}>{m}</option>)}
        </select>
        <label className="ml-4">Max tokens</label>
        <input type="number" min={64} max={2000} value={maxTokens}
          onChange={e=>setMaxTokens(parseInt(e.target.value,10)||200)}
          className="border px-2 py-1 w-24 rounded" />
      </div>
      <textarea value={input} onChange={e=>setInput(e.target.value)}
        placeholder="Prompt…" className="w-full border rounded p-2 h-28" />
      <button onClick={run} disabled={loading}
        className="border rounded px-3 py-2">{loading ? "Running…" : "Run"}</button>
      {out && (
        <pre className="bg-gray-100 p-2 rounded overflow-auto text-sm">{JSON.stringify(out, null, 2)}</pre>
      )}
    </div>
  );
}