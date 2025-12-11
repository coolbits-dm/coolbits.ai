import fetch from 'node-fetch';

const { VERTEX_API_KEY, VERTEX_PROJECT_ID, VERTEX_LOCATION, VERTEX_MODEL_ID } = process.env;
console.log('[VERTEX_CONFIG]', {
  model: VERTEX_MODEL_ID,
  project: VERTEX_PROJECT_ID,
  location: VERTEX_LOCATION,
  provider: process.env.CHAT_PROVIDER || process.env.VERTEX_PROVIDER,
});

const buildUrl = (modelId) =>
  `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1beta1/projects/${VERTEX_PROJECT_ID}/locations/${VERTEX_LOCATION}/publishers/google/models/${modelId}:generateContent?key=${encodeURIComponent(
    VERTEX_API_KEY || '',
  )}`;

export async function generateVertexReply({
  systemPrompt = '',
  message = '',
  history = [],
  temperature = 0.3,
  maxTokens = 1024,
  modelId = VERTEX_MODEL_ID,
}) {
  if (!VERTEX_API_KEY) throw new Error('vertex_missing_api_key');
  if (!VERTEX_PROJECT_ID || !VERTEX_LOCATION || !modelId) throw new Error('vertex_missing_config');

  const contents = [];
  if (systemPrompt && systemPrompt.trim()) {
    contents.push({
      role: 'user',
      parts: [{ text: systemPrompt.trim() }],
    });
  }

  (history || []).forEach((m) => {
    if (!m || !m.role || !m.content) return;
    contents.push({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    });
  });

  contents.push({
    role: 'user',
    parts: [{ text: message || '' }],
  });

  const body = {
    contents,
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature,
    },
  };

  console.log('[VERTEX] request', JSON.stringify({ model: modelId, project: VERTEX_PROJECT_ID, location: VERTEX_LOCATION, messages: contents.length }));

  const res = await fetch(buildUrl(modelId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[VERTEX] error', res.status, text);
    throw new Error(`vertex_http_${res.status}`);
  }

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    console.error('[VERTEX] empty response', JSON.stringify(json).slice(0, 300));
    throw new Error('vertex_empty_response');
  }

  const usageMeta = json?.usageMetadata || json?.usage || {};
  const promptTokens =
    usageMeta.promptTokenCount ??
    usageMeta.prompt_tokens ??
    usageMeta.inputTokens ??
    usageMeta.promptTokens ??
    null;
  const completionTokens =
    usageMeta.candidatesTokenCount ??
    usageMeta.completion_tokens ??
    usageMeta.outputTokens ??
    usageMeta.completionTokens ??
    null;

  console.log('[VERTEX] success', { model: modelId, length: text.length, sample: text.slice(0, 80) });
  return {
    text,
    raw: json,
    usage: {
      modelId,
      promptTokens,
      completionTokens,
      totalTokens: (promptTokens || 0) + (completionTokens || 0),
    },
  };
}

export default { generateVertexReply };
