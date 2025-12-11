import fs from 'node:fs/promises';
import path from 'node:path';

const PROMPT_ROOT = path.join(process.cwd(), 'app', 'server', 'prompts', 'cbAgents');
const cache = new Map();

export async function loadAgentSystemPrompt(agentId) {
  if (cache.has(agentId)) return cache.get(agentId);
  const filePath = path.join(PROMPT_ROOT, `${agentId}.md`);
  try {
    const content = await fs.readFile(filePath, 'utf8');
    cache.set(agentId, content);
    return content;
  } catch (err) {
    const fallback = `You are ${agentId}, an internal cbAgent. Follow the provided tools and constraints.`;
    cache.set(agentId, fallback);
    return fallback;
  }
}

export default { loadAgentSystemPrompt };
