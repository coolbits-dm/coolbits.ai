const PROVIDER_ALIASES = {
  auto: 'auto',
  openai: 'openai',
  anthropic: 'anthropic',
  google: 'google',
  xai: 'xai',
  deepseek: 'deepseek',
  chatgpt: 'openai',
  claude: 'anthropic',
  gemini: 'google',
  grok: 'xai',
  copilot: 'openai',
  vertex: 'google',
};

export function normalizeProviderKey(value) {
  if (!value) return 'auto';
  const key = String(value).trim().toLowerCase();
  return PROVIDER_ALIASES[key] || 'auto';
}

export function normalizeProviderFromModel(provider) {
  const key = String(provider || '').trim().toLowerCase();
  if (!key) return 'auto';
  if (key === 'vertex') return 'google';
  return PROVIDER_ALIASES[key] || key;
}

export default { normalizeProviderKey, normalizeProviderFromModel };
