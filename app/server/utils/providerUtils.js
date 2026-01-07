const PROVIDER_ALIASES = {
  auto: 'auto',
  openai: 'openai',
  anthropic: 'anthropic',
  google: 'vertex',
  vertex: 'vertex',
  xai: 'xai',
  deepseek: 'deepseek',
  chatgpt: 'openai',
  claude: 'anthropic',
  gemini: 'vertex',
  grok: 'xai',
  copilot: 'openai',
};

export function normalizeProviderKey(value) {
  if (!value) return 'auto';
  const key = String(value).trim().toLowerCase();
  return PROVIDER_ALIASES[key] || 'auto';
}

export function normalizeProviderFromModel(provider) {
  const key = String(provider || '').trim().toLowerCase();
  if (!key) return 'auto';
  return PROVIDER_ALIASES[key] || key;
}

export default { normalizeProviderKey, normalizeProviderFromModel };
