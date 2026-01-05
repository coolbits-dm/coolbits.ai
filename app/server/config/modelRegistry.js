const DEFAULT_MODEL_ID = process.env.CHAT_MODEL_ID || process.env.OPENAI_MODEL_MINI || 'vertex-gemini-2.5-flash-lite';

export const models = {
  'vertex-gemini-2.5-flash-lite': {
    id: 'vertex-gemini-2.5-flash-lite',
    label: 'Fast chat',
    provider: 'vertex',
    family: 'gemini-2.5-flash-lite',
    providerModelId: process.env.VERTEX_MODEL_ID || 'gemini-2.5-flash-lite',
    maxTokens: 8192,
    costPer1kInput: 0.000075,
    costPer1kOutput: 0.0003,
  },
  'vertex-gemini-2.0-pro': {
    id: 'vertex-gemini-2.0-pro',
    label: 'Executive reasoning',
    provider: 'vertex',
    family: 'gemini-2.0-pro',
    providerModelId: 'gemini-2.0-pro-exp',
    maxTokens: 8192,
    costPer1kInput: 0.0015,
    costPer1kOutput: 0.003,
  },
  'vertex-gemini-2.5-pro': {
    id: 'vertex-gemini-2.5-pro',
    label: 'Deep analysis',
    provider: 'vertex',
    family: 'gemini-2.5-pro',
    providerModelId: 'gemini-2.5-pro',
    maxTokens: 8192,
    costPer1kInput: 0.0035,
    costPer1kOutput: 0.007,
  },
  'openai-gpt-4.1-mini': {
    id: 'openai-gpt-4.1-mini',
    label: 'Routing & light tasks',
    provider: 'openai',
    family: 'gpt-4.1-mini',
    providerModelId: process.env.OPENAI_MODEL_MINI || 'gpt-4.1-mini',
    maxTokens: 16384,
    costPer1kInput: 0.00015,
    costPer1kOutput: 0.0006,
  },
  'openai-gpt-4.1': {
    id: 'openai-gpt-4.1',
    label: 'General reasoning',
    provider: 'openai',
    family: 'gpt-4.1',
    providerModelId: process.env.OPENAI_MODEL_STANDARD || 'gpt-4.1',
    maxTokens: 8192,
    costPer1kInput: 0.005,
    costPer1kOutput: 0.015,
  },
};

export function getModelConfig(modelId) {
  const key = modelId || DEFAULT_MODEL_ID;
  if (models[key]) return models[key];
  throw new Error(`model_not_found:${key}`);
}

export function getDefaultModelId() {
  return DEFAULT_MODEL_ID;
}

export default { models, getModelConfig, getDefaultModelId };
