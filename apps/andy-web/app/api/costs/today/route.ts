import { NextResponse } from "next/server";
import { estimateUSD } from "../../../lib/cost";

async function getAccessToken(): Promise<string> {
  const r = await fetch("http://metadata/computeMetadata/v1/instance/service-accounts/default/token", {
    headers: { "Metadata-Flavor": "Google" },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`metadata token failed: ${r.status}`);
  const { access_token } = await r.json();
  return access_token;
}

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    const project =
      process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || "";
    if (!project) throw new Error("no GCP project in env");

    // start-of-day UTC
    const now = new Date();
    const sod = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    const since = sod.toISOString();

    const token = await getAccessToken();
    let nextPageToken: string | undefined = undefined;
    let count = 0;
    let total = 0;
    const byModel: Record<string, number> = {};

    for (let page = 0; page < 20; page++) {
      const body = {
        resourceNames: [`projects/${project}`],
        filter:
          `timestamp >= "${since}" AND resource.type="cloud_run_revision" AND jsonPayload.t="openai_usage"`,
        orderBy: "timestamp desc",
        pageSize: 200,
        pageToken: nextPageToken,
      };

      const r = await fetch("https://logging.googleapis.com/v2/entries:list", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`logging read failed: ${r.status}`);
      const j = await r.json();

      const entries = Array.isArray(j.entries) ? j.entries : [];
      for (const e of entries) {
        const p = e?.jsonPayload || {};
        const model = (p.model || p.model_sent || "unknown") as string;
        let est = Number(p.est_cost);
        if (!Number.isFinite(est) && p.usage) {
          // fallback: calc pe baza usage, folosind estimateUSD din lib
          try { est = estimateUSD(p.usage, model) || 0; } catch { est = 0; }
        }
        if (!Number.isFinite(est)) est = 0;
        total += est;
        count += 1;
        byModel[model] = (byModel[model] || 0) + est;
      }

      nextPageToken = j.nextPageToken;
      if (!nextPageToken) break;
    }

    return NextResponse.json(
      {
        ok: true,
        project,
        since,
        count,
        total_usd_est: Number(total.toFixed(6)),
        by_model: Object.fromEntries(Object.entries(byModel).map(([m, v]) => [m, Number((v as number).toFixed(6))])),
        ms: Date.now() - started,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "internal", ms: Date.now() - started },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}


