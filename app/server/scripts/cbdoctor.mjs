import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scripts = [
  'selftest-provider-override.mjs',
  'selftest-provider-normalize.mjs',
  'selftest-googleads-customers-401.mjs',
  'selftest-db-token-usage.mjs',
];

let ok = true;

for (const script of scripts) {
  const scriptPath = path.join(__dirname, script);
  const result = spawnSync(process.execPath, [scriptPath], { stdio: 'inherit' });
  if (result.status !== 0) {
    ok = false;
  }
}

try {
  const resp = await fetch('http://127.0.0.1:8788/api/canon');
  if (resp.status === 200) {
    console.log('PASS /api/canon 200');
  } else {
    console.log(`FAIL /api/canon status=${resp.status}`);
    ok = false;
  }
} catch (err) {
  console.log(`FAIL /api/canon fetch: ${err?.message || err}`);
  ok = false;
}

process.exit(ok ? 0 : 1);
