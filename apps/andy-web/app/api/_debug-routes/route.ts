export const runtime = "nodejs";

import { promises as fs } from "node:fs";
import path from "node:path";

async function walk(dir: string, acc: string[] = []) {
  try {
    const items = await fs.readdir(dir, { withFileTypes: true });
    for (const it of items) {
      const p = path.join(dir, it.name);
      if (it.isDirectory()) await walk(p, acc);
      else acc.push(p);
    }
  } catch (e) { /* ignore */ }
  return acc;
}

export async function GET() {
  const root = process.cwd();
  const apiDir = path.join(root, ".next", "server", "app", "api");
  let files: string[] = [];
  try {
    files = await walk(apiDir);
    return Response.json({ ok: true, count: files.length, sample: files.slice(0, 20).map(f => f.replace(root, "")) });
  } catch (e:any) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
