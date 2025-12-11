import fs from 'node:fs';
import path from 'node:path';

const CONFIG_PATH = path.resolve(process.cwd(), 'app', 'server', 'config', 'scenarios.config.json');
let _cache = null;

function loadConfig() {
  if (_cache) return _cache;
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const json = JSON.parse(raw);
    _cache = json || {};
  } catch (err) {
    console.warn('[SCENARIOS_CONFIG_LOAD_ERROR]', err?.message);
    _cache = {};
  }
  return _cache;
}

export function getScenarioConfig(id) {
  const cfg = loadConfig()[id];
  if (!cfg) return null;
  return { id, ...cfg };
}

export default { getScenarioConfig };
