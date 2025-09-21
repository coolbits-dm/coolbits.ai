import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const models = [
    {
      name: "gpt-5",
      description: "Flagship model, best for complex tasks. Use minimal reasoning by default.",
      max_context: 400000,
      price_per_million: { input: 1.25, output: 10.0 },
      enabled: true,
      default: false,
    },
    {
      name: "gpt-5-mini",
      description: "Cheaper variant with strong quality; default choice.",
      max_context: 400000,
      price_per_million: { input: 0.25, output: 2.0 },
      enabled: true,
      default: true,
    },
    {
      name: "gpt-4.1-mini",
      description: "Previous-gen mini; long context; no deep reasoning.",
      max_context: 1000000,
      price_per_million: { input: 0.4, output: 1.6 },
      enabled: true,
      default: false,
    },
  ];
  return NextResponse.json(models);
}


