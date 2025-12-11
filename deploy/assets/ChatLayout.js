import { ChatBox } from './ChatBox.js';

const API_BASE = 'https://coolbits.ai/api';
const API_ENDPOINT = `${API_BASE}/chat`;
const PROFILE_ENDPOINT = `${API_BASE}/profile`;
const VISITOR_KEY = 'coolbits:visitor-id';
const SEED_STORE_KEY = 'coolbits:last-seed';

async function safeJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function generateVisitorId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `visitor-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function resolveVisitorId() {
  try {
    const existing = localStorage.getItem(VISITOR_KEY);
    if (existing) {
      return existing;
    }
    const fresh = generateVisitorId();
    localStorage.setItem(VISITOR_KEY, fresh);
    return fresh;
  } catch {
    return generateVisitorId();
  }
}

function consumeSeedMessage() {
  try {
    const params = new URLSearchParams(window.location.search);
    const first = params.get('first');
    const trimmed = (first || '').trim();
    if (!trimmed) {
      return '';
    }
    const fingerprint = `${window.location.pathname}?first=${trimmed}`;
    const previous = sessionStorage.getItem(SEED_STORE_KEY);
    if (previous === fingerprint) {
      return '';
    }
    sessionStorage.setItem(SEED_STORE_KEY, fingerprint);
    return trimmed;
  } catch {
    return '';
  }
}

export class ChatLayout {
  constructor(root) {
    this.root = root;
    this.sending = false;
    this.history = [];
    this.visitorId = resolveVisitorId();
    window.coolbitsVisitorId = this.visitorId;
    this.defaultProfile = {
      level: 'level-0',
      capabilities: { tier: 'guest', label: 'Guest tier' },
      reasoning: { active: false, expiresAt: null },
      flags: {},
    };
    this.profile = this.defaultProfile;
    this.profileLoaded = false;
    this.profilePromise = null;
    this.seedMessage = consumeSeedMessage();
    this.seedHandled = false;
    this.chatBox = new ChatBox({
      onSend: (text) => this.handleSend(text),
    });
    this.root.innerHTML = '';
    this.root.appendChild(this.chatBox.element);
    this.chatBox.setProfile(this.profile);
    this.history = this.chatBox.getHistory();
    this.ensureProfile();
    this.maybeHandleSeedMessage();
  }

  async handleSend(rawText) {
    const text = String(rawText || '').trim();
    if (!text || this.sending) return;
    this.chatBox.setError('');
    this.history.push({ role: 'user', content: text });
    this.chatBox.addMessage('user', text);
    this.chatBox.setSending(true);
    this.sending = true;
    try {
      const { reply } = await this.sendChatMessage(text);
      if (reply) {
        this.history.push({ role: 'assistant', content: reply });
        this.chatBox.addMessage('assistant', reply);
      }
    } catch (error) {
      console.error(error);
      const fallback = error instanceof Error ? error.message : null;
      const message = fallback || 'We could not reach the CoolBits backend. Please try again.';
      this.chatBox.setError(message);
      this.chatBox.addMessage('system', message);
    } finally {
      this.chatBox.setSending(false);
      this.sending = false;
    }
  }

  async sendChatMessage(message) {
    await this.ensureProfile();
    const payload = {
      message,
      history: this.history.map((entry) => ({ ...entry })),
      tier: this.profile?.capabilities?.tier || 'guest',
      visitorId: this.visitorId,
    };
    let response;
    try {
      response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
    } catch (networkError) {
      console.error(networkError);
      throw new Error('Unable to reach the CoolBits backend.');
    }

    const body = await safeJson(response);
    if (!response.ok) {
      const reason = typeof body?.error === 'string' && body.error.trim()
        ? body.error.trim()
        : 'Chat service temporarily unavailable.';
      throw new Error(reason);
    }

    const reply = this.extractReply(body);
    if (!reply) {
      throw new Error('Chat service returned an empty reply.');
    }

    if (body.profile) {
      this.setProfile(body.profile);
    }
    this.chatBox.setStatusMeta({
      level: (body.profile?.level || this.profile.level || 'level-0').toUpperCase(),
      flags: body.profile?.flags,
    });

    return { reply };
  }

  normalizeProfile(data = {}) {
    return {
      ...this.defaultProfile,
      ...data,
      capabilities: {
        ...this.defaultProfile.capabilities,
        ...(data.capabilities || {}),
      },
      flags: {
        ...(this.defaultProfile.flags || {}),
        ...(data.flags || {}),
      },
    };
  }

  setProfile(nextProfile) {
    this.profile = this.normalizeProfile({
      ...this.profile,
      ...nextProfile,
    });
    this.profile.tier = this.profile.capabilities?.tier || 'guest';
    this.profile.visitorId = this.visitorId;
    this.chatBox.setProfile(this.profile);
    this.chatBox.setStatusMeta({
      level: (this.profile.level || 'level-0').toUpperCase(),
      flags: this.profile.flags,
    });
    window.coolbitsProfile = this.profile;
  }

  async fetchProfileFromApi() {
    try {
      const response = await fetch(`${PROFILE_ENDPOINT}?visitor=${encodeURIComponent(this.visitorId)}`);
      const profile = response.ok ? await safeJson(response) : null;
      if (profile) {
        this.setProfile(profile);
      } else {
        this.setProfile(this.defaultProfile);
      }
    } catch (error) {
      console.warn('Profile load failed', error);
      this.setProfile(this.defaultProfile);
    } finally {
      this.profileLoaded = true;
      this.profilePromise = null;
    }
    return this.profile;
  }

  async ensureProfile() {
    if (this.profileLoaded) {
      return this.profile;
    }
    if (window.coolbitsProfile && !this.profilePromise) {
      this.setProfile(window.coolbitsProfile);
      this.profileLoaded = true;
      return this.profile;
    }
    if (this.profilePromise) {
      return this.profilePromise;
    }
    this.profilePromise = this.fetchProfileFromApi();
    return this.profilePromise;
  }

  extractReply(payload) {
    if (!payload || typeof payload !== 'object') {
      return '';
    }
    if (typeof payload.reply === 'string' && payload.reply.trim()) {
      return payload.reply.trim();
    }
    if (typeof payload.message === 'string' && payload.message.trim()) {
      return payload.message.trim();
    }
    return '';
  }

  maybeHandleSeedMessage() {
    if (!this.seedMessage || this.seedHandled) {
      return;
    }
    this.seedHandled = true;
    this.chatBox.setDraft(this.seedMessage);
    requestAnimationFrame(() => {
      this.chatBox.setDraft('');
      this.handleSend(this.seedMessage);
    });
  }
}
