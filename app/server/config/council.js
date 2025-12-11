// Council definitions per workspace. Keep ids aligned with frontend.
export const COUNCIL_DEFS = {
  business: {
    id: 'business',
    label: 'Business Council',
    baseIntro:
      'You are part of the Business council. This council combines strategy, tech, finance, growth, and ops to support CoolBits.ai conversations.',
    roles: [
      { id: 'ceo', label: 'CEO', domain: 'Strategy', description: 'High-level decisions, priorities, and business trade-offs.' },
      { id: 'cto', label: 'CTO', domain: 'Tech', description: 'Architecture, technical decisions, and integration trade-offs.' },
      { id: 'cfo', label: 'CFO', domain: 'Finance', description: 'Costs, ROI, pricing structure, and financial risk.' },
      { id: 'cmo', label: 'CMO', domain: 'Growth', description: 'Marketing strategy, channels, and messaging.' },
      { id: 'coo', label: 'COO', domain: 'Ops', description: 'Processes, automation, and operational efficiency.' },
    ],
  },
  agency: {
    id: 'agency',
    label: 'Agency Council',
    baseIntro:
      'You are part of the Agency council. This council focuses on performance, analytics, conversion, creative, and client direction for campaigns.',
    roles: [
      { id: 'ppc_lead', label: 'PPC Lead', domain: 'Performance', description: 'Google/Meta Ads strategy, bids, budgets, and ROAS.' },
      { id: 'analytics', label: 'Analytics Lead', domain: 'Analytics', description: 'Tracking, attribution, data quality, and reporting.' },
      { id: 'cro', label: 'CRO Specialist', domain: 'Conversion', description: 'Landing pages, A/B tests, funnels, and onsite UX.' },
      { id: 'creative', label: 'Creative Director', domain: 'Creatives', description: 'Messaging, angles, copy, and asset direction.' },
      { id: 'account', label: 'Account Director', domain: 'Client', description: 'Client goals, expectations, and communication.' },
    ],
  },
  developer: {
    id: 'developer',
    label: 'Developer Council',
    baseIntro:
      'You are part of the Developer council. This council covers backend, infra, security, frontend, and product concerns for technical delivery.',
    roles: [
      { id: 'lead_dev', label: 'Lead Dev', domain: 'Backend', description: 'Services, APIs, data flows, and code quality.' },
      { id: 'devops', label: 'DevOps', domain: 'Infra', description: 'Deployments, CI/CD, observability, scaling, and reliability.' },
      { id: 'security', label: 'Security', domain: 'Security', description: 'Threat modeling, auth, secrets, and compliance.' },
      { id: 'frontend', label: 'Frontend Lead', domain: 'UI/UX', description: 'Client-side architecture, performance, and accessibility.' },
      { id: 'product', label: 'Product Manager', domain: 'Product', description: 'Requirements, roadmap, and user outcomes.' },
    ],
  },
};

export function getCouncilForWorkspace(workspaceId = 'business') {
  return COUNCIL_DEFS[workspaceId] || COUNCIL_DEFS.business;
}

export function buildCouncilSystemPrompt({ workspaceId = 'business', councilMembers = [] } = {}) {
  const council = getCouncilForWorkspace(workspaceId);
  const baseIntro =
    council.baseIntro ||
    `You are part of the ${council.label}. This council consists of specialized roles that can provide different perspectives for the user. Each role focuses on a specific domain (e.g., strategy, tech, finance, growth, ops).`;

  const memberIds = Array.isArray(councilMembers) ? councilMembers.filter(Boolean) : [];
  const selected = council.roles.filter((r) => memberIds.includes(r.id));

  // No explicit selection: generic guidance so the model can react when user names roles in the message.
  if (!selected.length) {
    return [
      baseIntro,
      '',
      'Guidelines:',
      '- The user may explicitly ask for advice from specific council roles (e.g. "answer as CEO and CTO").',
      '- When they name one or more roles, clearly separate your answer per role (e.g. "CEO:" ... "CTO:").',
      '- If they do not reference any role, answer normally as a general assistant for this workspace.',
    ].join('\n');
  }

  const activeList = selected.map((r) => `${r.label} (${r.domain})`).join(', ');

  const rolesBlock = [
    `Active council members for this conversation: ${activeList}.`,
    '',
    'Guidelines:',
    '- Always answer from these active members’ perspectives, even if the user does not mention them explicitly.',
    '- If more than one member is active, structure your answer with clear sections, one per role (e.g. "CEO:" / "CTO:" / "CMO:"), and keep each section aligned to that role’s domain.',
    '- If the user asks which council members are active, tell them the list above.',
    '- If the user says to "also send this to" another council role, include that role’s perspective in your response in addition to the currently active members.',
  ].join('\n');

  return `${baseIntro}\n\n${rolesBlock}`;
}

export default { COUNCIL_DEFS, getCouncilForWorkspace, buildCouncilSystemPrompt };
