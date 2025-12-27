import path from 'node:path';

export const MAX_ARTIFACT_BYTES = Number(process.env.MAX_ARTIFACT_BYTES) || 25 * 1024 * 1024;
export const MAX_ARTIFACT_NAME_LENGTH = Number(process.env.MAX_ARTIFACT_NAME_LENGTH) || 200;
export const ARTIFACT_STORAGE_PROVIDER = process.env.ARTIFACT_STORAGE_PROVIDER || 'fs';
export const ARTIFACTS_FS_ROOT =
  process.env.ARTIFACTS_FS_ROOT || path.resolve(process.cwd(), 'uploads', 'artifacts');

const DEFAULT_CONTENT_TYPES = [
  'text/plain',
  'text/markdown',
  'application/pdf',
  'application/json',
  'image/png',
  'image/jpeg',
  'image/webp',
];

export const ALLOWED_ARTIFACT_CONTENT_TYPES = new Set(
  (process.env.ALLOWED_ARTIFACT_CONTENT_TYPES || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .concat(DEFAULT_CONTENT_TYPES),
);
