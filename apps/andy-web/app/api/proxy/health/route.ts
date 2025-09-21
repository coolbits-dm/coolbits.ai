import { NextResponse } from "next/server";
import { fetchWithIdToken } from "../../../../lib/idtoken";

export const dynamic = "force-dynamic";

export async function GET() {
  const gw = process.env.GATEWAY_URL!;
  const response = await fetchWithIdToken(`${gw}/health`, gw);
  return new NextResponse(null, { status: response.status });
}
