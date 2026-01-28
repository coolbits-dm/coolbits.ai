import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { query } from '../db.js';

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export async function writeJsonArtifact({ baseDir, workspaceId, runId, filename, jsonObj }) {
  if (!baseDir || !workspaceId || !runId || !filename) {
    throw new Error('invalid_artifact_path');
  }
  const dir = path.join(baseDir, workspaceId, 'runs', runId);
  await fs.mkdir(dir, { recursive: true });

  const fullPath = path.join(dir, filename);
  const data = Buffer.from(JSON.stringify(jsonObj, null, 2), 'utf8');
  await fs.writeFile(fullPath, data);

  return {
    uri: fullPath,
    bytes: data.length,
    sha256: sha256(data),
    contentType: 'application/json',
  };
}

export async function createArtifact({
  workspaceId,
  clientId = null,
  runId = null,
  kind,
  name = null,
  contentType,
  uri,
  sha256Hex,
  bytes,
  storageProvider = 'local',
  storageKey = null,
  createdBy = null,
}) {
  const bytesNumber = Number(bytes);
  const normalizedStorageProvider = String(storageProvider || 'local').trim();
  const normalizedStorageKey = String(storageKey || uri || '').trim();
  const normalizedCreatedBy = String(createdBy || 'system').trim();
  if (!workspaceId || !kind || !contentType || !uri || !sha256Hex || !Number.isFinite(bytesNumber)) {
    throw new Error('invalid_artifact');
  }
  if (!normalizedStorageProvider || !normalizedStorageKey || !normalizedCreatedBy) {
    throw new Error('invalid_artifact');
  }
  const id = crypto.randomUUID();
  await query(
    `
    INSERT INTO artifacts (
      id,
      workspace_id,
      name,
      content_type,
      bytes,
      sha256,
      storage_provider,
      storage_key,
      created_by,
      run_id,
      client_id,
      kind,
      uri
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    `,
    [
      id,
      workspaceId,
      name,
      contentType,
      bytesNumber,
      sha256Hex,
      normalizedStorageProvider,
      normalizedStorageKey,
      normalizedCreatedBy,
      runId,
      clientId,
      kind,
      uri,
    ],
  );
  return id;
}

export default {
  writeJsonArtifact,
  createArtifact,
};
