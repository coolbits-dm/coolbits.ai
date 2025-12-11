import fs from 'node:fs';
import path from 'node:path';

const CONFIG_PATH = path.resolve(process.cwd(), 'app', 'server', 'config', 'cbAgents.config.json');

let _cache = null;

function loadConfig() {
  if (_cache) return _cache;
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const json = JSON.parse(raw);
    _cache = json || {};
  } catch (err) {
    console.warn('[CB_AGENTS_CONFIG_LOAD_ERROR]', err?.message);
    _cache = {};
  }
  return _cache;
}

export function getAgentProfile(agentId) {
  const cfg = loadConfig()[agentId];
  if (!cfg) return null;
  return {
    id: agentId,
    tools: cfg.tools || [],
    canApplyChanges: Boolean(cfg.canApplyChanges),
    enabled: Boolean(cfg.enabled),
    artifacts: Array.isArray(cfg.artifacts) ? cfg.artifacts : [],
    maxAutonomy: cfg.maxAutonomy || 'L1',
    defaultAutonomy: cfg.defaultAutonomy || 'L0',
    ...cfg,
  };
}

export function listAgents() {
  const cfg = loadConfig();
  return Object.entries(cfg).map(([id, data]) => ({
    id,
    tools: data.tools || [],
    canApplyChanges: Boolean(data.canApplyChanges),
    enabled: Boolean(data.enabled),
    artifacts: Array.isArray(data.artifacts) ? data.artifacts : [],
    maxAutonomy: data.maxAutonomy || 'L1',
    defaultAutonomy: data.defaultAutonomy || 'L0',
    ...data,
  }));
}

export function getAllAgentsConfig() {
  return loadConfig();
}

export function listEnabledAgents() {
  return listAgents().filter((a) => a.enabled);
}

export function listDisabledAgents() {
  return listAgents().filter((a) => !a.enabled);
}

export function listAgentsByArtifact(artifactName) {
  if (!artifactName) return [];
  return listAgents().filter((a) => a.enabled && a.artifacts?.includes?.(artifactName));
}

export default { getAgentProfile, listAgents, getAllAgentsConfig, listEnabledAgents, listDisabledAgents, listAgentsByArtifact };
