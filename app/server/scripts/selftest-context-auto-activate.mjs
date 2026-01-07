import dotenv from 'dotenv';

dotenv.config({ path: new URL('../../../.env', import.meta.url) });

const { ensureActiveContext, getActiveContext } = await import('../services/activeContextService.js');

const userId = 'selftest_context_auto_activate';
const desired = {
  workspaceId: 'cbB',
  provider: 'auto',
  model: 'auto',
  billingSource: 'byok',
  byokKeyPresent: true,
};

let pass = true;

try {
  const first = await ensureActiveContext(userId, desired, { reason: 'selftest' });
  if (!first?.contextId) {
    console.log('FAIL context auto-activate: missing contextId');
    pass = false;
  }

  const second = await ensureActiveContext(userId, desired, { reason: 'selftest' });
  if (first?.contextId !== second?.contextId) {
    console.log('FAIL context auto-activate: context changed on second call');
    pass = false;
  }

  const stored = getActiveContext(userId);
  if (!stored || stored.contextId !== first?.contextId) {
    console.log('FAIL context auto-activate: context not stored');
    pass = false;
  }
} catch (err) {
  console.log(`FAIL context auto-activate: ${err?.message || err}`);
  pass = false;
}

if (pass) {
  console.log('PASS context auto-activate');
  process.exit(0);
}

process.exit(1);
