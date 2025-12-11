const visitorTokens = new Map();
const sessionIndex = new Map();

function cleanup() {
  const now = Date.now();
  for (const [visitorId, record] of visitorTokens.entries()) {
    if (record.expiresAt && new Date(record.expiresAt).getTime() < now) {
      visitorTokens.delete(visitorId);
      if (record.sessionId) {
        sessionIndex.delete(record.sessionId);
      }
    }
  }
}

export function queueReasoningToken({ visitorId, sessionId, durationMs = 15 * 60 * 1000, status = 'pending', source = 'stripe' }) {
  if (!visitorId || !sessionId) {
    return null;
  }
  const record = {
    visitorId,
    sessionId,
    status,
    expectedActivation: new Date(Date.now() + durationMs).toISOString(),
    createdAt: new Date().toISOString(),
    source,
  };
  visitorTokens.set(visitorId, record);
  sessionIndex.set(sessionId, record);
  return record;
}

export function activateReasoningToken(sessionId, options = {}) {
  const record = sessionIndex.get(sessionId);
  if (!record) {
    return null;
  }
  const durationMs = Number(options.durationMs || 15 * 60 * 1000);
  record.status = 'active';
  record.expiresAt = new Date(Date.now() + durationMs).toISOString();
  record.activatedAt = new Date().toISOString();
  visitorTokens.set(record.visitorId, record);
  return record;
}

export function getReasoningRecord(visitorId) {
  cleanup();
  const record = visitorTokens.get(visitorId);
  if (!record) {
    return null;
  }
  if (record.status === 'active' && record.expiresAt && new Date(record.expiresAt).getTime() < Date.now()) {
    visitorTokens.delete(visitorId);
    return null;
  }
  return record;
}

export function clearReasoningRecord(visitorId) {
  if (!visitorTokens.has(visitorId)) {
    return;
  }
  const record = visitorTokens.get(visitorId);
  visitorTokens.delete(visitorId);
  if (record?.sessionId) {
    sessionIndex.delete(record.sessionId);
  }
}
