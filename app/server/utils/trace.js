import crypto from 'node:crypto';

export function resolveTraceId(req, fallback = null) {
  const headerId = req?.headers?.['x-trace-id'] || req?.headers?.['x-traceid'];
  const bodyId = req?.body?.traceId || req?.body?.trace_id;
  const raw = typeof bodyId === 'string' && bodyId.trim()
    ? bodyId.trim()
    : (typeof headerId === 'string' && headerId.trim() ? headerId.trim() : '');
  if (raw) return raw;
  if (fallback) return fallback;
  return `tr_${crypto.randomUUID()}`;
}

export default { resolveTraceId };
