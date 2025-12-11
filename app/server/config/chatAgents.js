import cbAgentsConfig from './cbAgents.config.json' with { type: 'json' };

const SHORT_KEYS = ['ceo', 'cto', 'ppc', 'analytics', 'creative', 'devops'];

const agentsArray = Array.isArray(cbAgentsConfig?.agents) ? cbAgentsConfig.agents : [];

const chatAgentMap = SHORT_KEYS.reduce((acc, shortKey) => {
  const match = agentsArray.find((agent) => {
    const keyCandidates = [agent?.key, agent?.code, agent?.id];
    return keyCandidates.some(
      (candidate) => typeof candidate === 'string' && candidate.toLowerCase() === shortKey,
    );
  });

  if (match) {
    acc[shortKey] = match;
  }

  return acc;
}, {});

export function getChatAgentOrNull(rawKey) {
  if (!rawKey) return null;
  const key = String(rawKey).trim().toLowerCase();
  const agent = chatAgentMap[key];
  if (!agent) return null;

  return {
    id: agent.id ?? agent.key ?? agent.code ?? null,
    modelId: agent.modelId ?? agent.model ?? 'vertex-gemini-2.5-pro',
    promptId: agent.promptId ?? agent.systemPromptId ?? null,
  };
}

export default {
  getChatAgentOrNull,
};
