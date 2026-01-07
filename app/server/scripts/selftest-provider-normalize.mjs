import { normalizeProviderKey, getProviderAliases } from '../utils/providerUtils.js';

const aliasMap = getProviderAliases();
const aliasValues = Object.values(aliasMap);
const aliases = [...new Set([...Object.keys(aliasMap), ...aliasValues, 'unknown-provider'])];

let pass = true;

for (const value of aliases) {
  const normalized = normalizeProviderKey(value);
  const normalizedAgain = normalizeProviderKey(normalized);
  if (normalizedAgain !== normalized) {
    console.log(`FAIL provider normalize idempotent: ${value} -> ${normalized} -> ${normalizedAgain}`);
    pass = false;
  }
}

for (const start of Object.keys(aliasMap)) {
  const visited = new Set([start]);
  let current = start;
  while (aliasMap[current] && aliasMap[current] !== current) {
    current = aliasMap[current];
    if (visited.has(current)) {
      console.log(`FAIL provider alias cycle: ${start} -> ${current}`);
      pass = false;
      break;
    }
    visited.add(current);
  }
}

if (pass) {
  console.log('PASS provider normalize idempotent');
  console.log('PASS provider alias cycles');
  process.exit(0);
}

process.exit(1);
