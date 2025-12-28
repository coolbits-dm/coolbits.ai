import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { MAX_CBPL_BYTES, MAX_PAYLOAD_IDS, MAX_PAYLOAD_ID_BYTES } from '../config/payloadConfig.js';

const CBPL_SCHEMA_PATH = path.resolve(process.cwd(), 'docs', 'cbpl.schema.v1.json');

let cbplSchemaCache = null;
let payloadRepoPromise = null;

async function getPayloadRepo() {
  if (!payloadRepoPromise) {
    payloadRepoPromise = import('../repositories/payloadsRepo.js');
  }
  return payloadRepoPromise;
}

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

function stripCbplForHash(cbpl) {
  const sanitized = sanitizeCbpl(cbpl);
  const stripped = { ...sanitized };
  delete stripped.hash;
  delete stripped.hashAlgo;
  delete stripped.hashHex;
  delete stripped.signature;
  delete stripped.name;
  delete stripped.description;
  delete stripped.payload;
  delete stripped.availability;
  delete stripped.policyHints;
  delete stripped.summary;
  delete stripped.provenance;

  if (Array.isArray(stripped.artifactRefs)) {
    stripped.artifactRefs = stripped.artifactRefs.map((ref) => {
      if (!ref || typeof ref !== 'object') return ref;
      const type = ref.type;
      const base = { type };
      if (type === 'prompt_ref') {
        if (ref.messageId) base.messageId = ref.messageId;
        if (ref.promptSha256) base.promptSha256 = ref.promptSha256;
      } else if (type === 'file_ref' || type === 'image_ref') {
        if (ref.artifactId) base.artifactId = ref.artifactId;
      } else {
        if (ref.artifactId) base.artifactId = ref.artifactId;
        if (ref.messageId) base.messageId = ref.messageId;
      }
      return base;
    });
  }

  return stripped;
}

function isYmd(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseAllowedEnums(schema) {
  const allowedKinds = new Set(schema?.properties?.kind?.enum || []);
  const allowedCompareModes = new Set(schema?.$defs?.compareMode?.enum || []);
  const allowedIntents = new Set(schema?.$defs?.intent?.enum || []);
  return { allowedKinds, allowedCompareModes, allowedIntents };
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
  const { allowedKinds, allowedCompareModes, allowedIntents } = parseAllowedEnums(schema);
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

  const intent = cbpl.intent || 'read_only';
  if (!allowedIntents.has(intent)) {
    errors.push('intent_invalid');
  }

  if (!cbpl.selection || typeof cbpl.selection !== 'object') {
    errors.push('selection_missing');
  } else if (!cbpl.selection.workspaceId || typeof cbpl.selection.workspaceId !== 'string') {
    errors.push('selection_workspace_required');
  }

  if (cbpl.hashAlgo && cbpl.hashAlgo !== 'sha256') {
    errors.push('hash_algo_invalid');
  }

  if (cbpl.hashHex && !/^[a-f0-9]{64}$/.test(cbpl.hashHex)) {
    errors.push('hash_hex_invalid');
  }

  if (cbpl.artifactRefs != null) {
    if (!Array.isArray(cbpl.artifactRefs)) {
      errors.push('artifact_refs_invalid');
    } else {
      for (const ref of cbpl.artifactRefs) {
        if (!ref || typeof ref !== 'object') {
          errors.push('artifact_ref_invalid');
          break;
        }
        const type = ref.type;
        if (!type) {
          errors.push('artifact_ref_type_invalid');
          break;
        }
        if (type === 'prompt_ref') {
          if (!ref.messageId || typeof ref.messageId !== 'string') {
            errors.push('artifact_prompt_ref_invalid');
            break;
          }
          if (ref.promptSha256 && !/^[a-f0-9]{64}$/.test(ref.promptSha256)) {
            errors.push('artifact_prompt_hash_invalid');
            break;
          }
        } else if (type === 'file_ref' || type === 'image_ref') {
          if (!ref.artifactId || typeof ref.artifactId !== 'string') {
            errors.push('artifact_ref_id_invalid');
            break;
          }
        } else if (type != null) {
          errors.push('artifact_ref_type_invalid');
          break;
        }
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
  const stripped = stripCbplForHash(cbpl);
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

function ensureIntent(cbpl) {
  if (!cbpl.intent) {
    return { ...cbpl, intent: 'read_only' };
  }
  return cbpl;
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
  normalized = ensureIntent(normalized);

  const validation = await validateCbpl(normalized);
  if (!validation.ok) {
    throw buildPayloadError('cbpl_invalid', `CBPL validation failed: ${validation.errors.join(', ')}`, 400);
  }

  const { hash, canonical, stripped } = computeCbplHash(normalized);
  assertCbplSize(canonical);

  const payloadId = crypto.randomUUID();
  const contentJson = { ...stripped, hashAlgo: 'sha256', hashHex: hash };
  const contentBytes = Buffer.from(stableStringify(contentJson), 'utf8');

  const { insertPayload } = await getPayloadRepo();
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
  const { listPayloads: listPayloadsRepo } = await getPayloadRepo();
  return listPayloadsRepo(workspaceId, { kind, q, limit, cursor });
}

export async function getPayload({ workspaceId, id }) {
  const { getPayloadById } = await getPayloadRepo();
  return getPayloadById(workspaceId, id);
}

export async function deletePayload({ workspaceId, id }) {
  const { deletePayloadById: deletePayloadByIdRepo } = await getPayloadRepo();
  return deletePayloadByIdRepo(workspaceId, id);
}

export async function renamePayload({ workspaceId, id, name }) {
  if (typeof name !== 'string') {
    throw buildPayloadError('payload_name_invalid', 'Payload name must be a string.', 400);
  }
  const trimmed = name.trim();
  const { updatePayloadName } = await getPayloadRepo();
  const updated = await updatePayloadName(workspaceId, id, trimmed || null);
  return updated;
}

export async function resolvePayloadAttachments({ workspaceId, payloadIds }) {
  const { ids, hasPayloadRequest } = normalizePayloadIds(payloadIds);
  if (!ids.length) {
    return { payloads: [], hasPayloadRequest };
  }

  const { getPayloadsByIds } = await getPayloadRepo();
  const rows = await getPayloadsByIds(workspaceId, ids);
  if (rows.length !== ids.length) {
    throw buildPayloadError(
      'workspace_mismatch',
      'Payloads do not belong to this workspace.',
      403,
    );
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
