import crypto from 'node:crypto';
import { MAX_PAYLOAD_IDS } from '../config/payloadConfig.js';

const PREVIEW_TTL_MS = Number(process.env.RUN_PREVIEW_TTL_MS) || 30 * 60 * 1000;
const SWEEP_INTERVAL_MS = Number(process.env.RUN_PREVIEW_SWEEP_MS) || 5 * 60 * 1000;
const MAX_PREVIEWS_PER_WORKSPACE = Number(process.env.MAX_RUN_PREVIEWS_PER_WORKSPACE) || 200;
const MAX_PREVIEWS_PER_USER = Number(process.env.MAX_RUN_PREVIEWS_PER_USER) || 50;

const previews = new Map();
let nowFn = () => Date.now();

function now() {
  return nowFn();
}

function pruneExpired(current = now()) {
  for (const [key, value] of previews.entries()) {
    if (value.expiresAt <= current) {
      previews.delete(key);
    }
  }
}

function evictOldest(entries, maxAllowed) {
  if (entries.length <= maxAllowed) return;
  const sorted = entries.sort((a, b) => a.createdAt - b.createdAt);
  while (sorted.length > maxAllowed) {
    const victim = sorted.shift();
    if (victim) {
      previews.delete(victim.previewId);
    }
  }
}

function enforceCaps() {
  const all = Array.from(previews.values());
  const byWorkspace = new Map();
  const byUser = new Map();
  for (const entry of all) {
    const wsKey = entry.workspaceId;
    const userKey = entry.userId;
    if (!byWorkspace.has(wsKey)) byWorkspace.set(wsKey, []);
    if (!byUser.has(userKey)) byUser.set(userKey, []);
    byWorkspace.get(wsKey).push(entry);
    byUser.get(userKey).push(entry);
  }

  for (const entries of byWorkspace.values()) {
    evictOldest(entries, MAX_PREVIEWS_PER_WORKSPACE);
  }
  for (const entries of byUser.values()) {
    evictOldest(entries, MAX_PREVIEWS_PER_USER);
  }
}

function sweep() {
  pruneExpired();
  enforceCaps();
}

const sweepTimer = setInterval(sweep, SWEEP_INTERVAL_MS);
if (typeof sweepTimer.unref === 'function') sweepTimer.unref();

function buildPreviewError(code, message, status = 400) {
  const err = new Error(message || code);
  err.code = code;
  err.status = status;
  return err;
}

export function createRunPreview({ userId, workspaceId, payloadIds, payloadHashes }) {
  pruneExpired();

  const ids = Array.isArray(payloadIds) ? payloadIds.filter(Boolean) : [];
  if (ids.length > MAX_PAYLOAD_IDS) {
    throw buildPreviewError('payload_ids_too_many', 'Too many payloadIds.', 400);
  }

  const hashes = Array.isArray(payloadHashes) ? payloadHashes.slice(0, ids.length) : [];
  const selectionHash = crypto
    .createHash('sha256')
    .update(`${workspaceId}|${ids.join(',')}|${hashes.join(',')}`)
    .digest('hex');

  const runId = crypto.randomUUID();
  const previewId = crypto.randomUUID();
  const createdAt = now();
  const expiresAt = createdAt + PREVIEW_TTL_MS;
  const entry = {
    previewId,
    runId,
    userId,
    workspaceId,
    payloadIds: ids,
    payloadHashes: hashes,
    selectionHash,
    createdAt,
    expiresAt,
  };
  previews.set(previewId, entry);
  enforceCaps();
  return entry;
}

export function consumeRunPreview(previewId, { userId, workspaceId }) {
  pruneExpired();
  const entry = previews.get(previewId);
  if (!entry) return null;
  if (entry.userId !== userId || entry.workspaceId !== workspaceId) return null;
  if (entry.expiresAt <= now()) {
    previews.delete(previewId);
    return null;
  }
  previews.delete(previewId);
  return entry;
}

export const __test = {
  setNowFn(fn) {
    nowFn = typeof fn === 'function' ? fn : () => Date.now();
  },
  resetStore() {
    previews.clear();
    nowFn = () => Date.now();
  },
  sweep,
  getCount() {
    return previews.size;
  },
  PREVIEW_TTL_MS,
  MAX_PREVIEWS_PER_USER,
  MAX_PREVIEWS_PER_WORKSPACE,
};
