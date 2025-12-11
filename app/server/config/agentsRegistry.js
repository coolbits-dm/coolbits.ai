import { getAgentProfile, listAgents } from './cbAgents.js';

export { getAgentProfile, listAgents };
export const agents = {}; // kept for backward compatibility; prefer getAgentProfile/listAgents.

export default { agents, getAgentProfile, listAgents };
