'use client';
import { useEffect, useState } from "react";

export default function StatusCard() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/info", { cache: "no-store" });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        if (alive) setData(j);
      } catch (e: any) {
        if (alive) setErr(e?.message || "failed");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="border rounded p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Status</h2>
        <span className={`text-xs px-2 py-1 rounded ${data?.ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
          {data?.ok ? "OK" : "ERR"}
        </span>
      </div>
      <div className="mt-2 text-sm grid grid-cols-2 gap-2">
        <div><span className="text-gray-500">Health:</span> {data?.health ?? "-"}</div>
        <div><span className="text-gray-500">Latency:</span> {data?.ms ? `${data.ms}ms` : "-"}</div>
        <div><span className="text-gray-500">Service:</span> {data?.service ?? "-"}</div>
        <div><span className="text-gray-500">Revision:</span> {data?.revision ?? "-"}</div>
        <div className="col-span-2"><span className="text-gray-500">Gateway:</span> <code className="break-all">{data?.gateway_url ?? "-"}</code></div>
      </div>
      {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
      <form className="mt-3" action="/api/proxy/task" method="post">
        <button className="border rounded px-3 py-1 text-sm">Enqueue ping task</button>
      </form>
    </div>
  );
}


