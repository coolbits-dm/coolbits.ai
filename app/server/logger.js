import fs from 'node:fs';
import path from 'node:path';

const LOG_DIR = path.resolve(process.cwd(), 'logs');
const REQUEST_LOG = path.join(LOG_DIR, 'requests.log');
const ERROR_LOG = path.join(LOG_DIR, 'errors.log');

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function append(filePath, entry) {
  try {
    ensureLogDir();
    fs.appendFileSync(filePath, `${entry}\n`);
  } catch (err) {
    console.error('log append failed', err);
  }
}

export function logRequest(req) {
  const entry = `[${new Date().toISOString()}] ${req.method} ${req.originalUrl || req.url} ${req.ip || req.socket.remoteAddress}`;
  append(REQUEST_LOG, entry);
}

export function logError(error) {
  const entry = `[${new Date().toISOString()}] ${error?.stack || error?.message || 'unknown error'}`;
  append(ERROR_LOG, entry);
}
