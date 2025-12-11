import { runAgent as runAgentWithTools, listAgents as listCbAgents, listEnabledAgents } from './llmService.js';
import { getAgentProfile as getCbAgentProfile } from '../config/cbAgents.js';
import { getScenarioConfig } from '../config/scenarios.js';
import { insertAgentRun } from '../repositories/agentRunsRepo.js';

const googleAdsAuditScenario = {
  id: 'googleAdsAudit',
  autonomyLevel: 'L1',
  steps: [
    { step: 1, agentId: 'cbAgent-A-002-analytics', intent: 'build_snapshot' },
    { step: 2, agentId: 'cbAgent-A-001-ppc', intent: 'propose_changes' },
    { step: 3, agentId: 'cbAgent-A-003-creative', intent: 'propose_assets' },
    { step: 4, agentId: 'cbAgent-B-001-ceo', intent: 'summarize_and_prioritize' },
    { step: 5, agentId: 'cbAgent-D-001-devops', intent: 'check_risks' },
  ],
};

const MOCK_ACCOUNT = {
  accountName: 'Cool Coffee Co. EU',
  currency: 'EUR',
  timeframe: 'last 30 days',
  spend: 18450,
  conversions: 136,
  costPerConv: 135.8,
  campaigns: [
    { name: 'Search | Brand', spend: 2450, conv: 72, cpa: 34.1, notes: 'No sitelinks, missing branded negatives' },
    { name: 'Search | Generic', spend: 7800, conv: 28, cpa: 278.5, notes: 'Broad match everywhere; weak RSA scores' },
    { name: 'PMax | EMEA', spend: 8200, conv: 36, cpa: 227.7, notes: 'Asset group overlap; low-quality feeds' },
  ],
  searchTerms: ['best coffee subscription', 'coffee', 'cheap coffee beans', 'coolbits', 'cool bits agency'],
  tracking: {
    conversionsTracked: ['purchase', 'newsletter_signup'],
    issues: ['No enhanced conversions', 'GA4 and Ads conversions misaligned by 12%'],
  },
};

function buildAuditInput(goals = {}, extras = {}) {
  const goalLine = goals?.primary || 'Increase profitable conversions at stable CPA.';
  return {
    goals: goalLine,
    region: extras.region || 'EU',
    budget: extras.budget || 'keep spend flat for now',
    mockAccount: MOCK_ACCOUNT,
    notes: extras.notes || null,
  };
}

function buildActions(steps) {
  return steps.map((s) => ({ title: s.label, owner: s.label, detail: s.output }));
}

export async function runAgent(agentId, input, context = {}) {
  const profile = getCbAgentProfile(agentId);
  if (!profile) {
    const err = new Error('agent_not_found');
    err.status = 404;
    throw err;
  }
  const message = { role: 'user', content: typeof input === 'string' ? input : JSON.stringify(input) };
  const result = await runAgentWithTools({ agentId, messages: [message], scenario: context.scenario, extraContext: context });
  return {
    agentId: profile.id,
    label: profile.label,
    output: result.text,
    usage: result.usage,
    raw: result.raw,
    model: result.model,
    tools: result.tools,
    canApplyChanges: result.canApplyChanges,
    usedTools: result.usedTools || [],
    autonomy: result.autonomy,
    durationMs: result.durationMs,
  };
}

function buildStepPayload(intent, preparedInput) {
  switch (intent) {
    case 'build_snapshot':
      return {
        goals: preparedInput.goals,
        tracking: preparedInput.mockAccount.tracking,
        ask: 'Produce KPI snapshot and 3-5 insights using available data.',
      };
    case 'propose_changes':
      return {
        goals: preparedInput.goals,
        account: preparedInput.mockAccount,
        ask: 'Draft PPC change proposals: structure, budgets, negatives, creatives.',
      };
    case 'propose_assets':
      return {
        goals: preparedInput.goals,
        campaignContext: preparedInput.mockAccount,
        ask: 'Propose copy angles and asset prompts for weak asset groups.',
      };
    case 'summarize_and_prioritize':
      return {
        goals: preparedInput.goals,
        ask: 'Summarize audit findings and prioritize next actions.',
      };
    case 'check_risks':
      return {
        goals: preparedInput.goals,
        infraSignals: ['LLM usage steady', 'Ads API quota at 60%', 'No recent incident'],
        ask: 'List risks and rollout safeguards for the proposed batch.',
      };
    default:
      return { goals: preparedInput.goals, ask: 'Provide a concise update.' };
  }
}

async function logAgentRun({
  workspaceId,
  scenario,
  stepIndex,
  agentResult,
  error,
}) {
  const status = error
    ? (error.message?.startsWith('tool_not_allowed') || error.message?.startsWith('autonomy_violation') || error.message?.startsWith('apply_blocked') || error.message?.startsWith('validation_error') || error.message?.startsWith('tool_not_implemented'))
      ? 'tool_error'
      : 'llm_error'
    : 'success';
  const errorCode = error?.message || null;
  const usage = agentResult?.usage || {};
  try {
    await insertAgentRun({
      workspaceId,
      scenarioId: scenario?.id || scenario,
      stepIndex,
      agentId: agentResult?.agentId || 'unknown',
      autonomyLevel: agentResult?.autonomy || 'L0',
      toolsUsed: agentResult?.usedTools || [],
      status,
      errorCode,
      costTokensInput: usage.inputTokens || usage.promptTokens || null,
      costTokensOutput: usage.outputTokens || usage.completionTokens || null,
      durationMs: agentResult?.durationMs || null,
    });
  } catch (err) {
    console.warn('[AGENT_RUN_LOG_FAIL]', err?.message);
  }
}

export async function runScenario(scenarioId, input = {}, context = {}) {
  const scenarioConfig = getScenarioConfig(scenarioId) || googleAdsAuditScenario;
  if (scenarioId !== 'googleAdsAudit' && !scenarioConfig) {
    const err = new Error('scenario_not_supported');
    err.status = 400;
    throw err;
  }

  const scenario = { ...scenarioConfig, steps: googleAdsAuditScenario.steps };
  const scenarioContext = { ...context, scenario };
  const preparedInput = buildAuditInput(input.goals || {}, input);

  const steps = [];
  for (const step of scenario.steps) {
    const payload = buildStepPayload(step.intent, preparedInput);
    let result = null;
    let caughtError = null;
    try {
      result = await runAgent(step.agentId, payload, scenarioContext);
      steps.push({
        agentId: result.agentId,
        label: result.label,
        output: result.output,
        usage: result.usage,
        tools: result.tools,
        canApplyChanges: result.canApplyChanges,
        autonomy: result.autonomy,
      });
    } catch (err) {
      caughtError = err;
      steps.push({
        agentId: step.agentId,
        label: step.agentId,
        output: '',
        usage: null,
        tools: [],
        canApplyChanges: false,
        autonomy: 'L0',
        error: err?.message,
      });
      // Stop the flow on error
    }

    await logAgentRun({
      workspaceId: context.workspaceId || null,
      scenario,
      stepIndex: step.step,
      agentResult: result || { agentId: step.agentId, autonomy: 'L0', usedTools: [] },
      error: caughtError,
    });

    if (caughtError) {
      break;
    }
  }

  const combined = steps
    .map((s) => `--- ${s.label} ---\n${s.output || s.error || ''}`)
    .join('\n\n');

  const status = steps.some((s) => s.error) ? 'error' : 'ok';

  return {
    scenario: scenario.id,
    status,
    summary: combined,
    actions: buildActions(steps),
    steps,
    mockAccount: preparedInput.mockAccount,
  };
}

export function listAgents() {
  const enabled = listEnabledAgents();
  const disabled = listCbAgents().filter((a) => !a.enabled);
  return { agents: enabled, comingSoon: disabled };
}

export default { runAgent, runScenario, listAgents };
