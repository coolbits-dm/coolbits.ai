import dotenv from 'dotenv';

dotenv.config({ path: new URL('../../../.env', import.meta.url) });

process.env.ENABLE_OPENAI = 'false';
if (!process.env.CHAT_PROVIDER) {
  process.env.CHAT_PROVIDER = 'vertex';
}

const { normalizeProviderKey } = await import('../utils/providerUtils.js');
const { activateContext } = await import('../services/activeContextService.js');
const { call } = await import('../services/llmService.js');

const expectedProvider = normalizeProviderKey(process.env.CHAT_PROVIDER || 'vertex');

const context = await activateContext('test-user', {
  provider: 'openai',
  model: 'auto',
  billingSource: 'byok',
  byokKeyPresent: true,
});

let pass = true;
if (context.resolutionReason === 'provider_not_allowed') {
  console.log('PASS provider override reason');
} else {
  console.log(`FAIL provider override reason: ${context.resolutionReason}`);
  pass = false;
}

if (context.provider === expectedProvider) {
  console.log('PASS provider override resolved');
} else {
  console.log(`FAIL provider override resolved: ${context.provider}`);
  pass = false;
}

try {
  await call('openai-gpt-4.1', { system: 'test', user: 'ping' });
  console.log('FAIL provider dispatch allowed');
  pass = false;
} catch (err) {
  if (err?.code === 'PROVIDER_NOT_ALLOWED') {
    console.log('PASS provider dispatch blocked');
  } else {
    console.log(`FAIL provider dispatch blocked: ${err?.message || err}`);
    pass = false;
  }
}

if (!pass) {
  process.exit(1);
}
