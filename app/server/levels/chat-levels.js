const CHAT_LEVEL_MANIFEST = {
  'level-0': {
    label: 'Guest tier',
    tier: 'guest',
    mode: 'mock',
    historyLimit: 0,
    allowsSuggestions: true,
  },
  'level-1': {
    label: 'Guided chat',
    tier: 'guest',
    mode: 'mock-extended',
    historyLimit: 3,
    allowsSuggestions: true,
  },
  'level-2': {
    label: 'Onboarding ready',
    tier: 'member',
    mode: 'low-cost-llm',
    historyLimit: 10,
    allowsSuggestions: true,
  },
  'level-3': {
    label: 'Portal enabled',
    tier: 'member',
    mode: 'workspace-llm',
    historyLimit: 20,
    allowsSuggestions: true,
  },
  'level-4': {
    label: 'Reasoning unlocked',
    tier: 'pro',
    mode: 'full-llm',
    historyLimit: 40,
    allowsSuggestions: true,
  },
};

export function getChatCapabilities(level) {
  const normalized = String(level || 'level-0').toLowerCase();
  if (CHAT_LEVEL_MANIFEST[normalized]) {
    return { level: normalized, ...CHAT_LEVEL_MANIFEST[normalized] };
  }
  return { level: 'level-0', ...CHAT_LEVEL_MANIFEST['level-0'] };
}

export function listChatLevels() {
  return Object.entries(CHAT_LEVEL_MANIFEST).map(([key, value]) => ({ key, ...value }));
}
