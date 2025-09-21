import { fetchWithIdToken } from "../../../../lib/idtoken";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const base = process.env.GATEWAY_URL || "http://localhost:8787";
  const url  = `${base}/api/v1/task-hook`;
  const body = await req.text().catch(() => "");

  try {
    const r = await fetchWithIdToken(url, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
      audience: base, // în prod dă token IAP; în dev no-op
    });
    const text = await r.text().catch(() => "");
    return new Response(text || JSON.stringify({ ok: r.ok, status: r.status }), {
      status: r.status,
      headers: { "Content-Type": r.headers.get("content-type") ?? "application/json" },
    });
  } catch (e: any) {
    return Response.json(
      { ok: false, error: "gateway_unreachable", detail: e?.message ?? String(e) },
      { status: 502 }
    );
  }
}