import dotenv from 'dotenv';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pkg from 'pg';

dotenv.config({ path: new URL('../../../.env', import.meta.url) });

const connectionString = process.env.COOLBITS_DATABASE_URL;
if (!connectionString) {
  console.log('FAIL token_usage db check: COOLBITS_DATABASE_URL missing');
  process.exit(1);
}

await import('../repositories/tokenUsageRepo.js');

const { Client } = pkg;
const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

let dbOk = true;
try {
  await client.connect();
  const res = await client.query(
    "SELECT indexname, indexdef FROM pg_indexes WHERE tablename='token_usage' AND indexname='token_usage_trace_id_idx'",
  );
  if (!res.rows.length) {
    console.log('FAIL token_usage trace_id index: missing');
    dbOk = false;
  } else {
    const indexdef = res.rows[0].indexdef || '';
    const hasUnique = indexdef.toUpperCase().includes('UNIQUE');
    const hasTrace = indexdef.includes('(trace_id)');
    if (hasUnique && hasTrace) {
      console.log('PASS token_usage trace_id index');
      console.log(`indexdef=${indexdef}`);
    } else {
      console.log('FAIL token_usage trace_id index');
      console.log(`indexdef=${indexdef}`);
      dbOk = false;
    }
  }
} catch (err) {
  console.log('FAIL token_usage db check');
  console.log(String(err?.message || err));
  dbOk = false;
} finally {
  try {
    await client.end();
  } catch (_err) {}
}

const repoPath = fileURLToPath(new URL('../repositories/tokenUsageRepo.js', import.meta.url));
const text = fs.readFileSync(repoPath, 'utf8');
const insertMatch = text.match(/INSERT INTO token_usage\s*\(([^)]*)\)\s*VALUES\s*\(([^)]*)\)/s);
const columns = insertMatch
  ? insertMatch[1]
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
  : [];
const placeholders = insertMatch ? (insertMatch[2].match(/\$\d+/g) || []).length : 0;
const valuesMatch = text.match(/const values = \[(.*?)\n\s*\];/s);
let valuesCount = 0;
if (valuesMatch) {
  valuesCount = valuesMatch[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('//')).length;
}

console.log(`insert_columns=${columns.length}`);
console.log(`values_placeholders=${placeholders}`);
console.log(`values_array=${valuesCount}`);

const countsOk = columns.length === 29 && placeholders === 29 && valuesCount === 29;
if (countsOk) {
  console.log('PASS token_usage insert counts');
} else {
  console.log('FAIL token_usage insert counts');
}

if (!dbOk || !countsOk) {
  process.exit(1);
}
