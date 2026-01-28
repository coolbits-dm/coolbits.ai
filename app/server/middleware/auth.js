import { verifyToken } from '../jwtService.js';
import { getUserByEmail } from '../userStore.js';
import { getCapabilities, getPlanConfig } from '../config/plans.js';

function normalizeWorkspace(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function resolveWorkspaceForUser(user, requested) {
  if (!user) return null;
  const planConfig = getPlanConfig(user.planId);
  const capabilities = getCapabilities(user.planId);
  const allowed = Array.isArray(user.workspacesAllowed) && user.workspacesAllowed.length
    ? user.workspacesAllowed
    : (capabilities.workspacesAllowed || planConfig.defaultWorkspaces || []);
  const selected = Array.isArray(user.workspacesSelected) && user.workspacesSelected.length
    ? user.workspacesSelected
    : [];

  if (requested && selected.length) {
    return selected.includes(requested) ? requested : selected[0] || null;
  }
  if (requested && allowed.includes(requested)) {
    return requested;
  }
  if (selected.length) return selected[0] || null;
  if (allowed.length) return allowed[0] || null;
  return null;
}

async function attachWorkspace(req, email) {
  const user = await getUserByEmail(email);
  if (!user) return { user: null, workspaceId: null };
  const headerWorkspace = normalizeWorkspace(req.headers['x-workspace-id']);
  const workspaceId = resolveWorkspaceForUser(user, headerWorkspace);
  return { user, workspaceId };
}

function extractToken(req) {
  const authHeader = req.headers.authorization || '';
  const bearer = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (bearer) return bearer;
  // fallback to cb_token cookie
  const cookieHeader = req.headers.cookie || '';
  const cookieMatch = cookieHeader.match(/cb_token=([^;]+)/);
  if (cookieMatch && cookieMatch[1]) return cookieMatch[1];
  if (req.cookies && req.cookies.cb_token) return req.cookies.cb_token;
  return '';
}

export function requireUserOptional(req, _res, next) {
  const token = extractToken(req);
  if (!token) return next();
  const decoded = verifyToken(token);
  if (!decoded?.email) return next();

  req.userEmail = decoded.email;
  req.userPlan = decoded.plan;

  attachWorkspace(req, decoded.email)
    .then(({ user, workspaceId }) => {
      if (user) {
        req.user = { email: user.email, plan: user.planId, workspaceId };
      }
      if (workspaceId) {
        req.workspaceId = workspaceId;
      }
      return next();
    })
    .catch((err) => {
      console.error('[AUTH_WORKSPACE_OPTIONAL]', err?.message || err);
      return next();
    });
}

export function requireUser(req, res, next) {
  const token = extractToken(req);
  const cookieHeader = req.headers.cookie || '';
  const cbCookie = (cookieHeader.match(/cb_token=([^;]+)/) || [])[1] || (req.cookies && req.cookies.cb_token);
  const authPreview = token ? `${token.slice(0, 10)}...` : null;
  const cookiePreview = cbCookie ? `${cbCookie.slice(0, 10)}...` : null;
  console.log('[REQUIRE_USER]', req.method, req.originalUrl, { auth: authPreview, cookie: cookiePreview });

  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const decoded = verifyToken(token);
  if (!decoded?.email) return res.status(401).json({ error: 'Unauthorized' });
  req.userEmail = decoded.email;
  req.userPlan = decoded.plan;

  attachWorkspace(req, decoded.email)
    .then(({ user, workspaceId }) => {
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      if (!workspaceId) {
        return res.status(403).json({ error: 'workspace_not_bound' });
      }
      req.user = { email: user.email, plan: user.planId, workspaceId };
      req.workspaceId = workspaceId;
      return next();
    })
    .catch((err) => {
      console.error('[AUTH_WORKSPACE_REQUIRED]', err?.message || err);
      return res.status(500).json({ error: 'workspace_resolve_failed' });
    });
}
