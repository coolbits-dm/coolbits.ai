/**
 * Normalize council payload coming from the frontend.
 * Always returns { agents: string[], armed: boolean } where armed is derived from agents.length.
 */
export function normalizeCouncil(raw) {
  const src = raw || {};
  const council = src.council || {};

  const candidates = [
    src.agents,
    src.chatAgents,
    council.agents,
    council.members,
  ];

  const seen = new Set();
  const agents = [];

  for (const source of candidates) {
    if (!source) continue;
    const list = Array.isArray(source)
      ? source
      : (typeof source === 'string' ? [source] : []);
    for (const item of list) {
      const key = typeof item === 'string' ? item.trim() : '';
      if (!key || seen.has(key)) continue;
      seen.add(key);
      agents.push(key);
    }
  }

  return { agents, armed: agents.length > 0 };
}

/**
 * Decide if a user message is asking *about* council selection/armed state.
 * Fires for prompts like:
 * - "which agents are selected in the council pill?"
 * - "what agents are selected and are they armed?"
 * - "now we have 2 agents selected, can you see which ones?"
 */
export function isCouncilIntrospection(input) {
  const text = typeof input === 'string' ? input : input?.text;
  const t = (text || '').toLowerCase().trim();

  if (!t) return false;
  // ignore very long messages – introspection questions are short
  if (t.length > 400) return false;

  const hasAgentsWord =
    t.includes(' agents') ||
    t.startsWith('agents') ||
    t.includes(' which agents') ||
    t.includes(' what agents');

  if (!hasAgentsWord) return false;

  const mentionsSelected = t.includes('selected');
  const mentionsArmed = t.includes('armed');
  const mentionsCouncil = t.includes('council');
  const mentionsPill = t.includes('pill');

  // require "agents" plus at least one of selected/armed/council/pill
  if (!(mentionsSelected || mentionsArmed || mentionsCouncil || mentionsPill)) {
    return false;
  }

  return true;
}

/**
 * Build the deterministic answer based on normalized council state.
 */
export function buildCouncilIntrospectionAnswer(council) {
  const { agents, armed } = normalizeCouncil(council);

  if (!agents.length) {
    return "I don't know which agents are selected or if they are armed.";
  }

  const labelMap = {
    ceo: 'CEO',
    cto: 'CTO',
    cfo: 'CFO',
    cmo: 'CMO',
    coo: 'COO',
  };

  const readableAgents = agents
    .map((key) => labelMap[key] || key.toUpperCase())
    .join(', ');

  if (!armed) {
    return `The selected agents are: ${readableAgents}, but the council pill is not armed, so I respond as the default CoolBits.ai assistant.`;
  }

  return `The selected and armed agents are: ${readableAgents}.`;
}
