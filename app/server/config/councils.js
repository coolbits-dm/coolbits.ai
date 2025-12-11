import fs from 'node:fs';
import path from 'node:path';

const CONFIG_PATH = path.resolve(process.cwd(), 'app', 'server', 'config', 'councils.config.json');
let _cache = null;

function loadConfig() {
  if (_cache) return _cache;
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    _cache = JSON.parse(raw) || {};
  } catch (err) {
    console.warn('[COUNCILS_CONFIG_LOAD_ERROR]', err?.message);
    _cache = {};
  }
  return _cache;
}

export function listCouncils() {
  return Object.values(loadConfig());
}

export function getCouncil(slug) {
  const cfg = loadConfig()[slug];
  if (!cfg) return null;
  return cfg;
}

export default { listCouncils, getCouncil };
