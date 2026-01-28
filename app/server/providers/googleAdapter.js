import crypto from 'node:crypto';
import { generateVertexReply } from '../services/vertexClient.js';

function stableStringify(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const body = keys
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',');
    return `{${body}}`;
  }
  return JSON.stringify(String(value));
}

export function hashJson(value) {
  const payload = stableStringify(value);
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function normalizeText(value) {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object') {
    const candidate = value.text || value.message || value.prompt;
    if (typeof candidate === 'string') return candidate.trim();
    return stableStringify(value);
  }
  return '';
}

export function actorHello(profile, { runId = null, traceId = null } = {}) {
  return {
    runId,
    provider: profile.provider,
    model: profile.default_model,
    profile: profile.name,
    traceId,
  };
}

export async function runOnce({
  runId = null,
  promptEnvelope = null,
  profile,
  input = null,
  traceId = null,
}) {
  const message =
    normalizeText(input) ||
    normalizeText(promptEnvelope?.objective) ||
    normalizeText(promptEnvelope?.input) ||
    normalizeText(promptEnvelope) ||
    'probe';
  const useRealVertex = String(process.env.USE_REAL_VERTEX || '').toLowerCase() === 'true';

  if (useRealVertex) {
    const maxTokens = Number(profile?.limits?.maxOutputTokens || 512);
    const result = await generateVertexReply({
      systemPrompt: '',
      message,
      temperature: 0.2,
      maxTokens,
      modelId: profile.default_model,
    });
    return {
      text: result.text,
      meta: {
        runId,
        provider: profile.provider,
        model: profile.default_model,
        profile: profile.name,
        traceId,
        mode: 'vertex',
        usage: result.usage || null,
      },
    };
  }

  const trimmed = message.slice(0, 800);
  return {
    text: trimmed ? `mock:${trimmed}` : 'mock:ok',
    meta: {
      runId,
      provider: profile.provider,
      model: profile.default_model,
      profile: profile.name,
      traceId,
      mode: 'mock',
    },
  };
}

export default {
  actorHello,
  runOnce,
  hashJson,
};
