// app/api/complete/route.ts
import { estimateUSD } from "../../lib/cost";
import { rateLimitHit } from "../../lib/rateLimit";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({ ok: true, probe: "complete" });
}

type Msg = { role: string; content: string };
type Body =
  | { model?: string; prompt?: string; max_output_tokens?: number; max_tokens?: number }
  | { model?: string; messages?: Msg[]; max_output_tokens?: number; max_tokens?: number };

// --- helpers ---
function getOpenAIKey(): string | null {
  const k = process.env.OPENAI_SECRET;
  if (k && k !== "REVOKED_PLACEHOLDER" && k.trim() !== "") return k.trim();
  return null;
}

function textFromBody(b: any): string {
  if (typeof b?.prompt === "string") return b.prompt;
  if (Array.isArray(b?.messages)) return b.messages.map((m: any) => m?.content || "").join("\n");
  return "";
}

// compat cu ambele semnături posibile ale estimateUSD
function estimateCompat(model: string, pt: number, ot: number): number {
  const fn: any = estimateUSD as any;
  try {
    return fn(model, pt, ot);
  } catch {
    return fn(model, { prompt_tokens: pt, output_tokens: ot });
  }
}

export async function POST(req: Request) {
  const CT = { "Content-Type": "application/json" };
  const requestId = (globalThis as any).crypto?.randomUUID?.() ?? String(Date.now());
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  try {
    // best-effort rate-limit (compat cu semnătura veche)
    try {
      const rl = await (rateLimitHit as any)(`complete:${ip}`, 1, 60_000);
      if (rl && rl.ok === false) {
        return new Response(JSON.stringify({ ok: false, error: "rate_limited" }), { status: 429, headers: CT });
      }
    } catch {}

    // 1) payload
    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body) return new Response(JSON.stringify({ ok: false, error: "bad_json" }), { status: 400, headers: CT });

    const model = (body as any).model ?? "gpt-5-mini";
    const text = textFromBody(body);
    const pt = Math.ceil((text ?? "").length / 4) || 0;
    const ot = Math.min(Number((body as any).max_output_tokens ?? (body as any).max_tokens ?? 200) || 200, 4000);

    // 2) estimează costul și aplică CAP-ul ÎNAINTE de a atinge secretul
    const est_cost = estimateCompat(model, pt, ot);
    const cap = Number(process.env.COMPLETE_MAX_USD ?? "0.05");

    if (cap > 0 && est_cost > cap) {
      const logPayload = {
        t: "openai_usage",
        request_id: requestId,
        client_ip: ip,
        model_sent: model,
        usage: { prompt_tokens: pt, output_tokens: ot },
        est_cost,
        error: "cost_cap",
      };
      console.log(JSON.stringify(logPayload));
      return new Response(JSON.stringify({ ok: false, status: 402, error: "cost_cap", est_cost, cap }), {
        status: 402,
        headers: CT,
      });
    }

    // 3) abia acum verifică cheia (în dev din env; în prod folosești Secret Manager)
    const apiKey = getOpenAIKey(); // în prod: await getSecret()
    if (!apiKey) {
      return new Response(JSON.stringify({ ok: false, status: 500, error: "OPENAI_SECRET missing" }), {
        status: 500,
        headers: CT,
      });
    }

    // 4) stub local (nu apelăm OpenAI aici ca să evităm costuri)
    const usageLog = {
      t: "openai_usage",
      request_id: requestId,
      client_ip: ip,
      model_sent: model,
      model_used: model,
      usage: { prompt_tokens: pt, output_tokens: ot },
      est_cost,
    };
    console.log(JSON.stringify(usageLog));

    return new Response(JSON.stringify({ ok: true, stub: true, model, pt, ot, est_cost }), {
      status: 200,
      headers: CT,
    });
  } catch (e: any) {
    console.error("complete error", e?.stack || e?.message || String(e));
    return new Response(JSON.stringify({ ok: false, status: 500, error: "server_error" }), { status: 500, headers: CT });
  }
}
