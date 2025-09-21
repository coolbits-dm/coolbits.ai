import { NextResponse } from "next/server";
import { fetchWithIdToken } from "../../lib/idtoken";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  const gw = process.env.GATEWAY_URL!;
  let health = 0;
  let err: string | null = null;

  try {
    const r = await fetchWithIdToken(`${gw}/health`, gw, { cache: "no-store" });
    health = r.status;
  } catch (e: any) {
    err = e?.message || "fetch_failed";
  }

  const ms = Date.now() - started;
  const payload = {
    ok: health === 200,
    health,
    ms,
    service: process.env.K_SERVICE || null,
    revision: process.env.K_REVISION || null,
    project: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || null,
    gateway_url: gw,
    error: err,
  };

  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" }});
}


