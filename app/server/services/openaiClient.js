const DEFAULT_MAX_TOKENS = Number(process.env.OPENAI_MAX_TOKENS) || 4096;

export async function openaiChatCompletion({ messages, model, temperature = 0.3, maxTokens = DEFAULT_MAX_TOKENS }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('openai_not_configured');

  const fetchImpl = globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch_not_available');
  }

  const response = await fetchImpl('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
    }),
  });

  const json = await response.json();
  if (!response.ok) {
    const message = json.error?.message || 'OpenAI request failed';
    throw new Error(message);
  }

  const text = json?.choices?.[0]?.message?.content || '';
  return { text, raw: json, usage: json?.usage || null };
}
