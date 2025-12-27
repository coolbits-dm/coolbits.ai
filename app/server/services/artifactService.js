import crypto from 'node:crypto';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { PassThrough } from 'node:stream';
import {
  ARTIFACT_STORAGE_PROVIDER,
  ARTIFACTS_FS_ROOT,
  MAX_ARTIFACT_BYTES,
  MAX_ARTIFACT_NAME_LENGTH,
  ALLOWED_ARTIFACT_CONTENT_TYPES,
} from '../config/artifactConfig.js';
import {
  insertArtifact,
  getArtifactById,
  updateArtifactStatus,
} from '../repositories/artifactsRepo.js';

function buildArtifactError(code, message, status = 400) {
  const err = new Error(message || code);
  err.code = code;
  err.status = status;
  return err;
}

function normalizeWorkspaceId(workspaceId) {
  const trimmed = String(workspaceId || '').trim();
  return trimmed || 'business';
}

function sanitizePathSegment(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-z0-9_-]/gi, '_')
    .slice(0, 64) || 'workspace';
}

function sanitizeName(name) {
  if (!name || typeof name !== 'string') return null;
  const base = path.basename(name.trim());
  if (!base) return null;
  return base.slice(0, MAX_ARTIFACT_NAME_LENGTH);
}

function assertStorageProvider() {
  if (ARTIFACT_STORAGE_PROVIDER !== 'fs') {
    throw buildArtifactError('storage_provider_invalid', 'Unsupported artifact storage provider.', 500);
  }
}

function buildStorageKey(workspaceId, artifactId) {
  const safeWorkspace = sanitizePathSegment(workspaceId);
  return `${safeWorkspace}/${artifactId}`;
}

function resolveArtifactPath(storageKey) {
  return path.resolve(ARTIFACTS_FS_ROOT, storageKey);
}

async function ensureArtifactDir(filePath) {
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
}

function ensureContentType(contentType) {
  const value = String(contentType || '').trim();
  if (!value) throw buildArtifactError('content_type_required', 'contentType is required.', 400);
  if (!ALLOWED_ARTIFACT_CONTENT_TYPES.has(value)) {
    throw buildArtifactError('content_type_invalid', 'contentType not allowed.', 415);
  }
  return value;
}

function ensureBytes(bytes) {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) {
    throw buildArtifactError('bytes_invalid', 'bytes must be a positive number.', 400);
  }
  if (size > MAX_ARTIFACT_BYTES) {
    throw buildArtifactError('artifact_too_large', 'Artifact exceeds size limit.', 413);
  }
  return Math.trunc(size);
}

function ensureSha256(sha256) {
  const value = String(sha256 || '').trim().toLowerCase();
  if (!value || !/^[a-f0-9]{64}$/.test(value)) {
    throw buildArtifactError('sha256_invalid', 'sha256 must be a 64-char hex string.', 400);
  }
  return value;
}

function ensureReadableArtifact(artifact) {
  if (!artifact) {
    throw buildArtifactError(
      'workspace_mismatch',
      'Artifact does not belong to this workspace.',
      403,
    );
  }
  if (artifact.status !== 'ready') {
    throw buildArtifactError('artifact_not_ready', 'Artifact is not ready for download.', 409);
  }
}

async function computeFileSha256(filePath) {
  const hash = crypto.createHash('sha256');
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function verifyFileMatches(filePath, expectedBytes, expectedSha) {
  const stat = await fsPromises.stat(filePath);
  if (stat.size !== expectedBytes) {
    throw buildArtifactError('artifact_size_mismatch', 'Uploaded artifact size mismatch.', 400);
  }
  const hash = await computeFileSha256(filePath);
  if (hash !== expectedSha) {
    throw buildArtifactError('artifact_hash_mismatch', 'Uploaded artifact hash mismatch.', 400);
  }
  return { size: stat.size, sha256: hash };
}

async function writeStreamWithHash({ stream, filePath, expectedBytes }) {
  await ensureArtifactDir(filePath);
  const hash = crypto.createHash('sha256');
  let byteCount = 0;
  const pass = new PassThrough();

  pass.on('data', (chunk) => {
    byteCount += chunk.length;
    hash.update(chunk);
    if (expectedBytes && byteCount > expectedBytes) {
      pass.destroy(buildArtifactError('artifact_too_large', 'Artifact exceeds declared size.', 413));
    }
  });

  await pipeline(stream, pass, fs.createWriteStream(filePath));
  return { bytes: byteCount, sha256: hash.digest('hex') };
}

export async function initiateArtifact({ workspaceId, userId, name, contentType, bytes, sha256 }) {
  assertStorageProvider();

  const normalizedWorkspace = normalizeWorkspaceId(workspaceId);
  const normalizedName = sanitizeName(name);
  const normalizedContentType = ensureContentType(contentType);
  const normalizedBytes = ensureBytes(bytes);
  const normalizedSha = ensureSha256(sha256);

  const artifactId = crypto.randomUUID();
  const storageKey = buildStorageKey(normalizedWorkspace, artifactId);

  const record = await insertArtifact({
    id: artifactId,
    workspaceId: normalizedWorkspace,
    name: normalizedName,
    contentType: normalizedContentType,
    bytes: normalizedBytes,
    sha256: normalizedSha,
    storageProvider: ARTIFACT_STORAGE_PROVIDER,
    storageKey,
    status: 'pending',
    createdBy: userId,
  });

  return {
    artifactId: record.id,
    uploadPath: `/api/artifacts/${record.id}/upload`,
  };
}

export async function getArtifact({ workspaceId, id }) {
  const artifact = await getArtifactById(workspaceId, id);
  if (!artifact) return null;
  return artifact;
}

export async function uploadArtifactStream({ workspaceId, id, stream, contentLength }) {
  assertStorageProvider();
  const artifact = await getArtifactById(workspaceId, id);
  if (!artifact) throw buildArtifactError('artifact_not_found', 'Artifact not found.', 404);
  if (artifact.status !== 'pending' && artifact.status !== 'uploaded') {
    throw buildArtifactError('artifact_status_invalid', 'Artifact cannot be uploaded in its current state.', 409);
  }

  if (contentLength && Number(contentLength) !== artifact.bytes) {
    throw buildArtifactError('artifact_size_mismatch', 'Content-Length does not match declared bytes.', 400);
  }

  const filePath = resolveArtifactPath(artifact.storageKey);
  let bytes = 0;
  let sha256 = '';
  try {
    const result = await writeStreamWithHash({
      stream,
      filePath,
      expectedBytes: artifact.bytes,
    });
    bytes = result.bytes;
    sha256 = result.sha256;
  } catch (err) {
    await fsPromises.rm(filePath, { force: true });
    throw err;
  }

  if (bytes !== artifact.bytes) {
    await fsPromises.rm(filePath, { force: true });
    throw buildArtifactError('artifact_size_mismatch', 'Uploaded artifact size mismatch.', 400);
  }

  if (sha256 !== artifact.sha256) {
    await fsPromises.rm(filePath, { force: true });
    throw buildArtifactError('artifact_hash_mismatch', 'Uploaded artifact hash mismatch.', 400);
  }

  await updateArtifactStatus({ workspaceId, id, status: 'uploaded' });
  return { bytes, sha256 };
}

export async function completeArtifact({ workspaceId, id }) {
  assertStorageProvider();
  const artifact = await getArtifactById(workspaceId, id);
  if (!artifact) throw buildArtifactError('artifact_not_found', 'Artifact not found.', 404);
  if (artifact.status === 'ready') return artifact;
  if (artifact.status !== 'uploaded') {
    throw buildArtifactError('artifact_not_uploaded', 'Artifact upload is missing or incomplete.', 409);
  }

  const filePath = resolveArtifactPath(artifact.storageKey);
  try {
    await verifyFileMatches(filePath, artifact.bytes, artifact.sha256);
  } catch (err) {
    if (err?.code === 'ENOENT') {
      throw buildArtifactError('artifact_not_uploaded', 'Artifact upload is missing or incomplete.', 409);
    }
    throw err;
  }

  const updated = await updateArtifactStatus({ workspaceId, id, status: 'ready' });
  return updated;
}

export async function getDownloadStream({ workspaceId, id }) {
  assertStorageProvider();
  const artifact = await getArtifactById(workspaceId, id);
  ensureReadableArtifact(artifact);

  const filePath = resolveArtifactPath(artifact.storageKey);
  const stat = await fsPromises.stat(filePath);
  return { artifact, filePath, stat };
}

export const __test = {
  normalizeWorkspaceId,
  sanitizePathSegment,
  sanitizeName,
  ensureContentType,
  ensureBytes,
  ensureSha256,
  buildStorageKey,
  resolveArtifactPath,
};
