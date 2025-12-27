import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';

const router = express.Router();
const REGISTRY_PATH = path.resolve(process.cwd(), 'app', 'shared', 'connectorsRegistry.v1.json');
let cachedRegistry = null;
let cachedMtime = null;

async function loadRegistry() {
  if (cachedRegistry && cachedMtime) return cachedRegistry;
  const stat = await fs.stat(REGISTRY_PATH);
  const raw = await fs.readFile(REGISTRY_PATH, 'utf8');
  cachedRegistry = JSON.parse(raw);
  cachedMtime = stat.mtimeMs;
  return cachedRegistry;
}

router.get('/registry', async (_req, res) => {
  try {
    const registry = await loadRegistry();
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    if (cachedMtime) {
      res.setHeader('Last-Modified', new Date(cachedMtime).toUTCString());
    }
    return res.json(registry);
  } catch (error) {
    console.error('[CONNECTORS_REGISTRY] load failed', error);
    return res.status(500).json({ error: 'registry_unavailable' });
  }
});

export default router;
