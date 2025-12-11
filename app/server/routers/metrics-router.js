import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';

const router = express.Router();
const LOGS_DIR = path.resolve(process.cwd(), 'logs');

function parseDate(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const today = new Date();
    return today.toISOString().split('T')[0];
  }
  return dateStr;
}

function getDateRange(from, to) {
  const dates = [];
  const start = new Date(from);
  const end = new Date(to);
  const current = new Date(start);
  
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
}

async function readLogFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());
    const records = [];
    
    for (const line of lines) {
      try {
        const record = JSON.parse(line);
        records.push(record);
      } catch (err) {
        console.error('Failed to parse JSONL line:', err.message);
      }
    }
    
    return records;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('Error reading log file:', err.message);
    }
    return [];
  }
}

function aggregateUsage(records) {
  const summary = {
    totalTokens: 0,
    totalCostUsd: 0,
    byModel: {},
    byLevel: {}
  };
  
  for (const record of records) {
    const tokens = Number(record.totalTokens || 0);
    const cost = Number(record.costUsd || 0);
    const model = String(record.model || 'unknown');
    const level = String(record.level || 'unknown');
    
    summary.totalTokens += tokens;
    summary.totalCostUsd += cost;
    
    if (!summary.byModel[model]) {
      summary.byModel[model] = { tokens: 0, costUsd: 0 };
    }
    summary.byModel[model].tokens += tokens;
    summary.byModel[model].costUsd += cost;
    
    if (!summary.byLevel[level]) {
      summary.byLevel[level] = { tokens: 0, costUsd: 0 };
    }
    summary.byLevel[level].tokens += tokens;
    summary.byLevel[level].costUsd += cost;
  }
  
  summary.totalCostUsd = Number(summary.totalCostUsd.toFixed(6));
  
  for (const model in summary.byModel) {
    summary.byModel[model].costUsd = Number(summary.byModel[model].costUsd.toFixed(6));
  }
  
  for (const level in summary.byLevel) {
    summary.byLevel[level].costUsd = Number(summary.byLevel[level].costUsd.toFixed(6));
  }
  
  return summary;
}

router.get('/costs', async (req, res) => {
  const adminToken = req.headers['x-admin-token'];
  const expectedToken = process.env.ADMIN_TOKEN;
  
  if (!expectedToken || adminToken !== expectedToken) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  
  try {
    const today = new Date().toISOString().split('T')[0];
    const from = parseDate(req.query.from) || today;
    const to = parseDate(req.query.to) || today;
    
    const dates = getDateRange(from, to);
    const allRecords = [];
    
    for (const date of dates) {
      const logPath = path.join(LOGS_DIR, `usage-${date}.jsonl`);
      const records = await readLogFile(logPath);
      allRecords.push(...records);
    }
    
    const summary = aggregateUsage(allRecords);
    
    res.json({
      from,
      to,
      recordCount: allRecords.length,
      ...summary
    });
  } catch (err) {
    console.error('Metrics error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
