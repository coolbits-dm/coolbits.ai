import { generateVertexReply } from './vertexClient.js';

const PROVIDER = (process.env.CHAT_PROVIDER || process.env.OPENAI_PROVIDER || 'vertex').toLowerCase();

export async function generateChatReply({ systemPrompt, message, history = [], model, temperature = 0.3, maxTokens = 1024 }) {
  const provider = PROVIDER === 'vertex' ? 'vertex' : `${PROVIDER}-forced-to-vertex`;
  console.log('[MODEL_PROVIDER]', JSON.stringify({ provider, messages: (history?.length || 0) + 1, model }));
  const result = await generateVertexReply({ systemPrompt, message, history, temperature, maxTokens });
  const enriched = {
    text: result.text,
    raw: result.raw,
    usage: result.usage || null,
    modelId: result.usage?.modelId || model,
  };
  return enriched;
}

export default { generateChatReply };
