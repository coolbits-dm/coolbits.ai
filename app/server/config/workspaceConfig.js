import crypto from 'node:crypto';
import { getPlanConfig } from './plans.js';

const SYSTEM_WORKSPACES = [
  { id: 'business', systemKind: 'business', slug: 'b', name: 'Business' },
  { id: 'agency', systemKind: 'agency', slug: 'a', name: 'Agency' },
  { id: 'developer', systemKind: 'dev', slug: 'd', name: 'Dev' },
  { id: 'personal', systemKind: 'personal', slug: 'p', name: 'Personal' },
];

const RESERVED_SLUGS = new Set(['p', 'b', 'a', 'd']);
const RESERVED_IDS = new Set(['personal', 'business', 'agency', 'dev', 'developer']);

const PLAN_CUSTOM_CAPS = {
  starter: 1,
  agency: 10,
  dev: 10,
  enterprise: 999,
  guest: 0,
};

function normalizePlanKey(planId) {
  if (!planId) return 'starter';
  const key = String(planId).trim();
  const lower = key.toLowerCase();
  if (PLAN_CUSTOM_CAPS[lower] != null) return lower;
  if (key === 'STARTER_FREE' || key === 'STARTER') return 'starter';
  if (key === 'PRO' || key === 'AGENCY') return 'agency';
  if (key === 'DEV') return 'dev';
  if (key === 'ENTERPRISE') return 'enterprise';
  if (key === 'GUEST') return 'guest';
  return lower;
}

export function getSystemWorkspaceDefinitions() {
  return SYSTEM_WORKSPACES.slice();
}

export function isReservedWorkspaceSlug(value) {
  return RESERVED_SLUGS.has(String(value || '').trim().toLowerCase());
}

export function isReservedWorkspaceId(value) {
  return RESERVED_IDS.has(String(value || '').trim().toLowerCase());
}

export function getCustomWorkspaceCap(planId) {
  const normalized = normalizePlanKey(planId);
  if (PLAN_CUSTOM_CAPS[normalized] != null) return PLAN_CUSTOM_CAPS[normalized];
  const plan = getPlanConfig(planId);
  if (plan?.maxWorkspaces === 'all') return PLAN_CUSTOM_CAPS.enterprise;
  return PLAN_CUSTOM_CAPS.starter;
}

export function buildCustomWorkspaceId() {
  const id = crypto.randomUUID();
  return `ws_${id}`;
}

export function orderSystemWorkspaces(workspaces) {
  const order = ['business', 'agency', 'dev', 'personal'];
  const rank = new Map(order.map((kind, idx) => [kind, idx]));
  return workspaces.slice().sort((a, b) => {
    const ra = rank.get(a.systemKind) ?? 99;
    const rb = rank.get(b.systemKind) ?? 99;
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  });
}

export default {
  getSystemWorkspaceDefinitions,
  isReservedWorkspaceSlug,
  isReservedWorkspaceId,
  getCustomWorkspaceCap,
  buildCustomWorkspaceId,
  orderSystemWorkspaces,
};
