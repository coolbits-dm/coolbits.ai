import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  insertPayload,
  getPayloadById,
  getPayloadsByIds,
  listPayloads as listPayloadsRepo,
  deletePayloadById as deletePayloadByIdRepo,
} from '../repositories/payloadsRepo.js';
import { MAX_CBPL_BYTES, MAX_PAYLOAD_IDS, MAX_PAYLOAD_ID_BYTES } from '../config/payloadConfig.js';

const CBPL_SCHEMA_PATH = path.resolve(process.cwd(), 'docs', 'cbpl.schema.v1.json');

let cbplSchemaCache = null;

async function loadCbplSchema() {
  if (cbplSchemaCache) return cbplSchemaCache;
  const raw = await fs.readFile(CBPL_SCHEMA_PATH, 'utf8');
  cbplSchemaCache = JSON.parse(raw);
  return cbplSchemaCache;
}

function buildPayloadError(code, message, status = 400) {
  const err = new Error(message || code);
  err.code = code;
  err.status = status;
  return err;
}

function stableStringify(value) {
  if (value === null) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  const parts = [];
  for (const key of keys) {
    const v = value[key];
    if (typeof v === 'undefined') continue;
    parts.push(`${JSON.stringify(key)}:${stableStringify(v)}`);
  }
  return `{${parts.join(',')}}`;
}

function sanitizeCbpl(cbpl) {
  return JSON.parse(stableStringify(cbpl));
}

function isYmd(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseAllowedEnums(schema) {
  const allowedKinds = new Set(schema?.properties?.kind?.enum || []);
  const allowedCompareModes = new Set(schema?.$defs?.compareMode?.enum || []);
  const availabilityStatuses = new Set(
    schema?.$defs?.availabilityMap?.additionalProperties?.properties?.status?.enum || [],
  );
  return { allowedKinds, allowedCompareModes, availabilityStatuses };
}

function validateSelectionBlock(selection, allowedCompareModes, label) {
  const errors = [];
  if (!selection || typeof selection !== 'object') {
    errors.push(`${label}_missing`);
    return errors;
  }

  const { from, to, blocks, compareMode, compareFrom, compareTo } = selection;
  if (!isYmd(from) || !isYmd(to)) {
    errors.push(`${label}_invalid_range`);
  }
  if (!Array.isArray(blocks) || !blocks.length) {
    errors.push(`${label}_blocks_required`);
  }
  if (!allowedCompareModes.has(compareMode)) {
    errors.push(`${label}_compare_mode_invalid`);
  }

  if (compareMode === 'custom') {
    if (!isYmd(compareFrom) || !isYmd(compareTo)) {
      errors.push(`${label}_compare_range_invalid`);
    }
  }

  if (compareMode !== 'custom') {
    if (compareFrom != null && compareFrom !== '' && !isYmd(compareFrom)) {
      errors.push(`${label}_compare_from_invalid`);
    }
    if (compareTo != null && compareTo !== '' && !isYmd(compareTo)) {
      errors.push(`${label}_compare_to_invalid`);
    }
  }

  return errors;
}

async function validateCbpl(cbpl) {
  const schema = await loadCbplSchema();
  const { allowedKinds, allowedCompareModes, availabilityStatuses } = parseAllowedEnums(schema);
  const errors = [];

  if (!cbpl || typeof cbpl !== 'object') {
    return { ok: false, errors: ['cbpl_invalid'] };
  }

  if (cbpl.schemaVersion !== 'cbpl.v1') {
    errors.push('schema_version_invalid');
  }

  if (!allowedKinds.has(cbpl.kind)) {
    errors.push('kind_invalid');
  }

  if (!cbpl.selection || typeof cbpl.selection !== 'object') {
    errors.push('selection_missing');
  } else if (!cbpl.selection.workspaceId || typeof cbpl.selection.workspaceId !== 'string') {
    errors.push('selection_workspace_required');
  }

  if (!cbpl.payload || typeof cbpl.payload !== 'object') {
    errors.push('payload_invalid');
  }

  if (!cbpl.availability || typeof cbpl.availability !== 'object') {
    errors.push('availability_invalid');
  } else {
    for (const value of Object.values(cbpl.availability)) {
      if (!value || typeof value !== 'object') {
        errors.push('availability_entry_invalid');
        break;
      }
      if (!availabilityStatuses.has(value.status)) {
        errors.push('availability_status_invalid');
        break;
      }
    }
  }

  if (cbpl.selection?.ga4) {
    errors.push(...validateSelectionBlock(cbpl.selection.ga4, allowedCompareModes, 'ga4'));
  }

  if (cbpl.selection?.googleads) {
    errors.push(...validateSelectionBlock(cbpl.selection.googleads, allowedCompareModes, 'googleads'));
  }

  return { ok: errors.length === 0, errors };
}

function computeCbplHash(cbpl) {
  const sanitized = sanitizeCbpl(cbpl);
  const stripped = { ...sanitized };
  delete stripped.hash;
  delete stripped.signature;
  delete stripped.name;
  delete stripped.description;
  const canonical = stableStringify(stripped);
  const hash = crypto.createHash('sha256').update(canonical).digest('hex');
  return { hash, canonical, stripped };
}

function getCanonicalSize(cbpl) {
  const { canonical } = computeCbplHash(cbpl);
  return Buffer.byteLength(canonical, 'utf8');
}

function assertCbplSize(canonical) {
  if (Buffer.byteLength(canonical, 'utf8') > MAX_CBPL_BYTES) {
    throw buildPayloadError('cbpl_too_large', 'CBPL exceeds maximum size.', 413);
  }
}

function ensureWorkspaceMatch(cbpl, workspaceId) {
  const selectionWorkspace = cbpl?.selection?.workspaceId || null;
  const topWorkspace = cbpl?.workspaceId || null;
  const expected = workspaceId || selectionWorkspace || topWorkspace;
  if (!expected) {
    throw buildPayloadError('workspace_required', 'workspaceId is required.', 400);
  }

  if (selectionWorkspace && selectionWorkspace !== expected) {
    throw buildPayloadError('workspace_mismatch', 'Selection workspaceId mismatch.', 400);
  }
  if (topWorkspace && topWorkspace !== expected) {
    throw buildPayloadError('workspace_mismatch', 'Payload workspaceId mismatch.', 400);
  }

  const next = { ...cbpl };
  next.workspaceId = expected;
  next.selection = { ...(cbpl.selection || {}), workspaceId: expected };
  return next;
}

function ensureKind(cbpl, kind) {
  if (!kind) return cbpl;
  if (cbpl.kind && cbpl.kind !== kind) {
    throw buildPayloadError('kind_mismatch', 'CBPL kind does not match request.', 400);
  }
  return { ...cbpl, kind };
}

function normalizePayloadIds(payloadIds) {
  if (!Array.isArray(payloadIds)) {
    return { ids: [], hasPayloadRequest: false };
  }

  const hasInvalid = payloadIds.some((id) => typeof id !== 'string');
  if (hasInvalid) {
    throw buildPayloadError('payload_ids_invalid', 'payloadIds must be an array of strings.', 400);
  }

  const cleaned = payloadIds.map((id) => id.trim()).filter(Boolean);
  const unique = Array.from(new Set(cleaned));

  if (unique.length > MAX_PAYLOAD_IDS) {
    throw buildPayloadError('payload_ids_too_many', 'Too many payloadIds.', 400);
  }

  let totalBytes = 0;
  for (const id of unique) {
    totalBytes += Buffer.byteLength(id, 'utf8');
    if (totalBytes > MAX_PAYLOAD_ID_BYTES) {
      throw buildPayloadError('payload_ids_too_large', 'payloadIds exceed size limit.', 400);
    }
  }

  return { ids: unique, hasPayloadRequest: true };
}

export async function createPayload({ workspaceId, userId, name, kind, cbpl }) {
  if (!cbpl || typeof cbpl !== 'object') {
    throw buildPayloadError('cbpl_invalid', 'Invalid CBPL payload.', 400);
  }

  let normalized = sanitizeCbpl(cbpl);
  normalized = ensureWorkspaceMatch(normalized, workspaceId);
  normalized = ensureKind(normalized, kind);

  const validation = await validateCbpl(normalized);
  if (!validation.ok) {
    throw buildPayloadError('cbpl_invalid', `CBPL validation failed: ${validation.errors.join(', ')}`, 400);
  }

  const { hash, canonical, stripped } = computeCbplHash(normalized);
  assertCbplSize(canonical);

  const payloadId = crypto.randomUUID();
  const contentJson = { ...stripped, hash };
  const contentBytes = Buffer.from(stableStringify(contentJson), 'utf8');

  const inserted = await insertPayload({
    id: payloadId,
    workspaceId,
    name: name ? String(name).trim() : null,
    kind: normalized.kind,
    schemaVersion: normalized.schemaVersion,
    hash,
    contentJson,
    contentBytes,
    createdBy: userId,
  });

  return { id: inserted.id, hash: inserted.hash, deduped: !inserted.inserted };
}

export async function listPayloads({ workspaceId, kind, q, limit, cursor }) {
  return listPayloadsRepo(workspaceId, { kind, q, limit, cursor });
}

export async function getPayload({ workspaceId, id }) {
  return getPayloadById(workspaceId, id);
}

export async function deletePayload({ workspaceId, id }) {
  return deletePayloadByIdRepo(workspaceId, id);
}

export async function resolvePayloadAttachments({ workspaceId, payloadIds }) {
  const { ids, hasPayloadRequest } = normalizePayloadIds(payloadIds);
  if (!ids.length) {
    return { payloads: [], hasPayloadRequest };
  }

  const rows = await getPayloadsByIds(workspaceId, ids);
  if (rows.length !== ids.length) {
    throw buildPayloadError('payload_not_found', 'One or more payloads not found.', 404);
  }

  for (const row of rows) {
    if (row.schemaVersion !== 'cbpl.v1') {
      throw buildPayloadError('payload_version_invalid', 'Payload schema version unsupported.', 400);
    }
    const validation = await validateCbpl(row.contentJson);
    if (!validation.ok) {
      throw buildPayloadError('payload_invalid', `Stored payload invalid: ${validation.errors.join(', ')}`, 400);
    }
  }

  const byId = new Map(rows.map((row) => [row.id, row]));
  const payloads = ids.map((id) => {
    const row = byId.get(id);
    return { id: row.id, hash: row.hash, kind: row.kind };
  });

  return { payloads, hasPayloadRequest };
}

export function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const raw = Buffer.from(String(cursor), 'base64').toString('utf8');
    const [createdAt, id] = raw.split('|');
    if (!createdAt || !id) return null;
    return { createdAt, id };
  } catch (_err) {
    return null;
  }
}

export function encodeCursor(cursor) {
  if (!cursor?.createdAt || !cursor?.id) return null;
  const raw = `${cursor.createdAt}|${cursor.id}`;
  return Buffer.from(raw, 'utf8').toString('base64');
}

export const __test = {
  stableStringify,
  sanitizeCbpl,
  computeCbplHash,
  getCanonicalSize,
  assertCbplSize,
  validateCbpl,
  normalizePayloadIds,
  MAX_CBPL_BYTES,
  MAX_PAYLOAD_IDS,
  MAX_PAYLOAD_ID_BYTES,
};
