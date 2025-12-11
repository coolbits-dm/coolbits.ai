import express from 'express';
import { getLevelEngine, buildLevelContext } from '../levels/index.js';

const router = express.Router();
const engine = getLevelEngine();

function buildProfilePayload(req) {
  const context = buildLevelContext(req);
  const profile = engine.buildProfile(context);
  return {
    visitorId: profile.visitorId,
    level: profile.level,
    trigger: profile.trigger,
    capabilities: profile.capabilities,
    unlocks: profile.unlocks,
    onboarding: profile.onboarding,
    reasoning: profile.reasoning,
    decision: profile.decision,
  };
}

router.get('/', (req, res) => {
  res.json(buildProfilePayload(req));
});

router.get('/level.json', (req, res) => {
  res.json(buildProfilePayload(req));
});

export default router;
