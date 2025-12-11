import { createReasoningCheckoutSession } from '../../app/server/billing/reasoning-session.js';
import { simulateWebhookActivation } from '../../app/server/billing/reasoning-webhook.js';
import { getReasoningRecord } from '../../app/server/billing/reasoning-db.js';

async function main() {
  const session = await createReasoningCheckoutSession({ visitorId: 'billing-tool' });
  console.log('Checkout session:', session);
  const activated = simulateWebhookActivation(session.checkoutSessionId, { durationMs: 300000 });
  console.log('Activated token:', activated);
  console.log('Stored record:', getReasoningRecord('billing-tool'));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
