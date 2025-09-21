import { describe, it, expect } from "vitest";
import { _internals } from "@/app/api/estimate/route";

describe("estimate helpers", () => {
  it("estimates tokens from chars ~1/4", () => {
    expect(_internals.estTokensFromChars(0)).toBe(0);
    expect(_internals.estTokensFromChars(8)).toBe(2);
  });

  it("cost calc works", () => {
    const usd = _internals.costUSD(1000, 500, { in: 0.25, out: 2.0 });
    // 1000 * 0.25 + 500 * 2.0 = 1250; /1e6 => $0.00125 total
    expect(usd).toBeCloseTo(0.00125, 6);
  });

  it("picks cheapest model that fits limits", () => {
    const models = [
      { name: "gpt-5-mini", maxIn: 400_000, maxOut: 128_000, price: { in: 0.25, out: 2.0 } },
      { name: "gpt-5",      maxIn: 400_000, maxOut: 128_000, price: { in: 1.25, out: 10.0 } },
    ] as any;
    const { recommend } = _internals.pick(models, 10_000, 1_000);
    expect(recommend?.model).toBe("gpt-5-mini");
  });
});


