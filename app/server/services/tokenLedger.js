import fs from 'node:fs/promises';
import path from 'node:path';

const LOGS_DIR = path.resolve(process.cwd(), 'logs');

async function ensureLogsDir() {
  try {
    await fs.mkdir(LOGS_DIR, { recursive: true });
  } catch (err) {
    console.error('Failed to create logs directory:', err.message);
  }
}

function getLogFilePath(date = new Date()) {
  const dateStr = date.toISOString().split('T')[0];
  return path.join(LOGS_DIR, `usage-${dateStr}.jsonl`);
}

async function recordUsage(payload) {
  try {
    await ensureLogsDir();
    const logPath = getLogFilePath();
    const line = JSON.stringify(payload) + '\n';
    await fs.appendFile(logPath, line, 'utf8');
  } catch (err) {
    console.error('Failed to record usage:', err.message);
  }
}

export default { recordUsage };
