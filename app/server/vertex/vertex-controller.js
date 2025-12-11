import { getLevelEngine, buildLevelContext } from '../levels/index.js';
import { validateUltimateInput } from './validator.js';
import { planUltimateCampaign } from './planner.js';
import { renderUltimatePlan } from './renderer.js';
import { getVertexConfig, isRealVertexEnabled } from './vertex-config.js';
import { logError } from '../logger.js';

const levelEngine = getLevelEngine();
const LEVEL_MAP = {
  'level-0': 0,
  'level-1': 1,
  'level-2': 2,
  'level-3': 3,
  'level-4': 4,
};

const allowUltimateWithoutReasoning = String(process.env.DEV_ALLOW_ULTIMATE_WITHOUT_REASONING || '').toLowerCase() === 'true';

function parseLevelValue(level) {
  return LEVEL_MAP[String(level || 'level-0').toLowerCase()] ?? 0;
}

function reasoningSatisfied(reasoning = {}) {
  if (reasoning.active) {
    return true;
  }
  if (reasoning.pending) {
    return true;
  }
  return false;
}

export async function handleUltimateCampaignPlan(req) {
  try {
    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
      return { status: 400, body: { error: 'invalid_payload' } };
    }

    const context = buildLevelContext(req, { visitorId: payload.visitorId });
    const profile = levelEngine.buildProfile(context);
    const levelValue = parseLevelValue(profile.level);

    if (levelValue < 1) {
      return { status: 403, body: { error: 'level_too_low', requiredLevel: 1 } };
    }

    if (!reasoningSatisfied(profile.reasoning) && !allowUltimateWithoutReasoning) {
      return {
        status: 403,
        body: {
          error: 'reasoning_required',
          reason: 'Ultimate planning requires a reasoning boost or a higher level account.',
        },
      };
    }

    const validation = validateUltimateInput(payload);
    if (!validation.valid) {
      return { status: 422, body: { error: 'validation_failed', details: validation.errors } };
    }

    const config = getVertexConfig();
    const useRealVertex = isRealVertexEnabled();
    const planResult = await planUltimateCampaign(payload, {
      mock: !useRealVertex,
      model: config.model,
      config,
      logger: console,
    });
    const renderedPlan = renderUltimatePlan({ input: payload, plan: planResult.plan, engine: planResult.engine });

    return {
      status: 200,
      body: {
        visitorId: profile.visitorId,
        level: { label: profile.level, value: levelValue },
        reasoning: profile.reasoning,
        engine: planResult.engine,
        plan: renderedPlan,
      },
    };
  } catch (error) {
    logError(error);
    return { status: 500, body: { error: 'ultimate_failed' } };
  }
}
