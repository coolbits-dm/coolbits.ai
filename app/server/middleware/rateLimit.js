import { rateLimitConfig } from '../config/rateLimit.js';

const ipCounters = {};
const userCounters = {};
let globalWindow = { tokens: 0, expiresAt: 0 };
let globalBlocked = false;

const workspaceCounters = {
  chat: new Map(),
  agents: new Map(),
};

function now() {
  return Date.now();
}

function resetIfExpired(bucket, windowMs) {
  const ts = now();
  if (!bucket.expiresAt || bucket.expiresAt <= ts) {
    bucket.count = 0;
    bucket.expiresAt = ts + windowMs;
  }
}

function getIp(req) {
  const xfwd = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xfwd || req.ip || req.connection?.remoteAddress || 'unknown';
}

// Legacy chat limiter (IP/user based)
export function rateLimitChat(req, res, next) {
  const { windowMs, guestMaxRequestsPerWindow, userMaxRequestsPerWindow } = rateLimitConfig;
  const ip = getIp(req);
  const email = req.userEmail || null;
  const isGuest = !email;
  const key = isGuest ? `guest:${ip}` : `user:${email}`;

  const bucket = isGuest ? (ipCounters[ip] = ipCounters[ip] || {}) : (userCounters[key] = userCounters[key] || {});
  resetIfExpired(bucket, windowMs);
  bucket.count = (bucket.count || 0) + 1;

  if (globalBlocked) {
    console.warn('[RATE_LIMIT]', { ip, email, scope: 'global' });
    return res.status(429).json({ error: 'rate_limited', scope: 'global', retryAfterSeconds: 3600 });
  }

  if (isGuest && bucket.count > guestMaxRequestsPerWindow) {
    console.warn('[RATE_LIMIT]', { ip, email, scope: 'guest' });
    return res.status(429).json({ error: 'rate_limited', scope: 'guest', retryAfterSeconds: Math.ceil(windowMs / 1000) });
  }

  if (!isGuest && bucket.count > userMaxRequestsPerWindow) {
    console.warn('[RATE_LIMIT]', { ip, email, scope: 'user' });
    return res.status(429).json({ error: 'rate_limited', scope: 'user', retryAfterSeconds: Math.ceil(windowMs / 1000) });
  }

  return next();
}

function buildWorkspaceKey(scope, req) {
  const workspace = typeof req.body?.workspaceId === 'string' && req.body.workspaceId.trim()
    ? req.body.workspaceId.trim()
    : typeof req.body?.workspace === 'string' && req.body.workspace.trim()
      ? req.body.workspace.trim()
      : 'business';
  const principal = req.userEmail || req.authEmail || `ip:${getIp(req)}`;
  return `${scope}:${principal}:${workspace}`;
}

function applyLimiter(map, scope, maxPerWindow, req, res, next) {
  const windowMs = rateLimitConfig.windowMs;
  const key = buildWorkspaceKey(scope, req);
  const bucket = map.get(key) || { count: 0, expiresAt: 0 };
  resetIfExpired(bucket, windowMs);
  bucket.count += 1;
  map.set(key, bucket);

  if (bucket.count > maxPerWindow) {
    console.warn('[RATE_LIMIT]', { scope, key });
    return res.status(429).json({
      errorCode: 'RATE_LIMITED',
      message: 'Too many requests, please try again soon.',
      retryAfterSeconds: Math.ceil(windowMs / 1000),
    });
  }

  return next();
}

export function rateLimitChatUserWorkspace(req, res, next) {
  const max = rateLimitConfig.chatMaxPerUserWorkspace || 30;
  return applyLimiter(workspaceCounters.chat, 'chat', max, req, res, next);
}

export function rateLimitAgentsUserWorkspace(req, res, next) {
  const max = rateLimitConfig.agentsMaxPerUserWorkspace || 12;
  return applyLimiter(workspaceCounters.agents, 'agents', max, req, res, next);
}

export function recordTokenUsage(amount) {
  const { globalMaxTokensPerHour } = rateLimitConfig;
  const ts = now();
  if (!globalWindow.expiresAt || globalWindow.expiresAt <= ts) {
    globalWindow = { tokens: 0, expiresAt: ts + 60 * 60 * 1000 };
    globalBlocked = false;
  }
  globalWindow.tokens += Math.abs(amount || 0);
  if (globalWindow.tokens > globalMaxTokensPerHour) {
    globalBlocked = true;
    console.warn('[RATE_LIMIT_GLOBAL]', globalWindow);
  }
}
