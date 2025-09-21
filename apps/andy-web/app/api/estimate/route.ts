import { NextResponse } from "next/server";
import { rateLimitHit } from "../../lib/rateLimit";

type Price = { in: number; out: number };            // USD per 1M tokens
type ModelInfo = {
  name: "gpt-5" | "gpt-5-mini" | "gpt-4.1-mini";
  maxIn: number;    // max input tokens model-side
  maxOut: number;   // max output tokens model-side
  price: Price;
};

const MODELS: ModelInfo[] = [
  { name: "gpt-5-mini",  maxIn: 400_000, maxOut: 128_000, price: { in: 0.25, out: 2.00 } },
  { name: "gpt-4.1-mini",maxIn: 1_000_000, maxOut: 1_000_000, price: { in: 0.40, out: 1.60 } },
  { name: "gpt-5",       maxIn: 400_000, maxOut: 128_000, price: { in: 1.25, out: 10.00 } },
];

const HARD_CAP_OUT = 5_000;                 // cap defensiv pt. estimator
const DEFAULT_WANT_OUT = 300;
const MAX_INPUT_CHARS = 200_000;            // hard guard pt. endpoint

// helpers moved to app/lib/estimateHelpers.ts to avoid Next.js route export typing issues
import { _internals } from "../../lib/estimateHelpers";

// === route ===
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // rate limit
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const hit = rateLimitHit(`est:${ip}`);
  if (!hit.ok) {
    return new Response(
      JSON.stringify({ ok: false, error: "rate_limited" }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "X-RateLimit-Remaining": String(hit.remaining)
        }
      }
    );
  }
  try {
    const body = await req.json().catch(() => ({}));

    const rawInput = (body?.input ?? "").toString();
    if (rawInput.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: "input empty" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-RateLimit-Remaining": String(hit.remaining) }
      });
    }
    if (rawInput.length > MAX_INPUT_CHARS) {
      return new Response(JSON.stringify({ ok: false, error: "input too large" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-RateLimit-Remaining": String(hit.remaining) }
      });
    }

    const wantRaw = Number.parseInt(String(body?.want_out ?? DEFAULT_WANT_OUT), 10);
    const want_out = _internals.clamp(
      Number.isFinite(wantRaw) ? wantRaw : DEFAULT_WANT_OUT,
      1,
      HARD_CAP_OUT
    );

    const est_in = _internals.estTokensFromChars(rawInput.length);
    const est_out = want_out;

    const { candidates, recommend } = _internals.pick(MODELS, est_in, est_out);

    const payload = {
      ok: true,
      input_chars: rawInput.length,
      est_in,
      want_out: est_out,
      candidates,             // each item: {model, limits_ok, est_in, est_out, est_usd, max_in, max_out}
      recommend               // cheapest model that satisfies limits, or null
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-RateLimit-Remaining": String(hit.remaining)
      }
    });
  } catch (e: any) {
    return new Response(
      JSON.stringify({ ok: false, error: e?.message ?? "bad request" }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "X-RateLimit-Remaining": "0"
        }
      }
    );
  }
}
