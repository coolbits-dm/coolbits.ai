import { normalizeProviderKey } from '../utils/providerUtils.js';

const aliases = [
  'auto',
  'openai',
  'anthropic',
  'google',
  'vertex',
  'gemini',
  'xai',
  'grok',
  'deepseek',
  'chatgpt',
  'claude',
  'copilot',
  'unknown-provider',
];

let pass = true;
for (const value of aliases) {
  const normalized = normalizeProviderKey(value);
  const normalizedAgain = normalizeProviderKey(normalized);
  if (normalizedAgain !== normalized) {
    console.log(`FAIL provider normalize idempotent: ${value} -> ${normalized} -> ${normalizedAgain}`);
    pass = false;
  }
}

if (pass) {
  console.log('PASS provider normalize idempotent');
  process.exit(0);
}

process.exit(1);
