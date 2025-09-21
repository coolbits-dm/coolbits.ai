'use client';
import { useState } from 'react';

export default function EstimatorPanel() {
  const [input, setInput] = useState('');
  const [wantOut, setWantOut] = useState(300);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  async function estimate() {
    setBusy(true); setErr(null); setData(null);
    try {
      const r = await fetch('/api/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, want_out: wantOut }),
      });
      const rem = r.headers.get('x-ratelimit-remaining');
      if (rem !== null) setRemaining(parseInt(rem, 10));
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setData(j);
    } catch (e: any) {
      setErr(e?.message || 'failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <textarea
        className="w-full border rounded p-2 h-28"
        placeholder="Prompt…"
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />
        <div className="flex items-center gap-2">
        <label>Max output tokens</label>
        <input
          type="number"
          min={1}
          max={5000}
          value={wantOut}
          onChange={(e) => setWantOut(parseInt(e.target.value, 10) || 300)}
          className="border rounded px-2 py-1 w-28"
        />
        <button
          onClick={estimate}
          disabled={busy || !input || (remaining !== null && remaining <= 0)}
          className="border rounded px-3 py-2"
        >
          {busy ? 'Estimating…' : 'Estimate'}
        </button>
        {remaining !== null && (
          <span className="text-xs text-gray-600">Remaining: {remaining}/10</span>
        )}
      </div>

      {err && <p className="text-red-600 text-sm">{err}</p>}

      {data && (
        <div className="border rounded p-2 text-sm">
          <div className="mb-2">
            <strong>Recommended:</strong>{' '}
            {data.recommend ? (
              <>
                <code>{data.recommend.model}</code>{' '}
                (≈${data.recommend.est_usd.toFixed(6)})
              </>
            ) : (
              'none fits limits'
            )}
          </div>
          <details>
            <summary className="cursor-pointer">Candidates</summary>
            <pre className="overflow-auto">
              {JSON.stringify(data.candidates, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
