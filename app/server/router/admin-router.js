import express from 'express';
import { query } from '../db.js';
import { verifyToken } from '../jwtService.js';
import { getUserByEmail } from '../userStore.js';
import { getCapabilities, getPlanConfig } from '../config/plans.js';

const router = express.Router();

function extractToken(req) {
  const authHeader = req.headers.authorization || '';
  const bearer = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (bearer) return bearer;
  const cookieHeader = req.headers.cookie || '';
  const cookieMatch = cookieHeader.match(/cb_token=([^;]+)/);
  if (cookieMatch && cookieMatch[1]) return cookieMatch[1];
  if (req.cookies && req.cookies.cb_token) return req.cookies.cb_token;
  return '';
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function parseAdminAllowlist() {
  return String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function isAdminEmail(email) {
  const list = parseAdminAllowlist();
  if (!list.length) return false;
  return list.includes(normalizeEmail(email));
}

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

async function requireAdmin(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const decoded = verifyToken(token);
  if (!decoded?.email) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const user = await getUserByEmail(decoded.email);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (!isAdminEmail(user.email)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const requestedWorkspace = normalizeWorkspace(req.headers['x-workspace-id']);
    const workspaceId = resolveWorkspaceForUser(user, requestedWorkspace);
    req.adminEmail = user.email;
    req.adminUser = user;
    req.adminWorkspaceId = workspaceId;
    req.userEmail = user.email;
    if (workspaceId) req.workspaceId = workspaceId;
    return next();
  } catch (err) {
    console.error('[ADMIN_AUTH_ERROR]', err?.message || err);
    return res.status(500).json({ error: 'admin_auth_failed' });
  }
}

router.use(requireAdmin);

router.get('/me', (req, res) => {
  res.json({
    isAdmin: true,
    userEmail: req.adminEmail || null,
    workspaceId: req.adminWorkspaceId || null,
  });
});

router.get('/users', async (req, res) => {
  const rawLimit = parseInt(req.query.limit || '50', 10);
  const rawOffset = parseInt(req.query.offset || '0', 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;
  const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;
  const q = String(req.query.q || '').trim();

  const values = [];
  let whereSql = '';
  if (q) {
    values.push(`%${q}%`);
    whereSql = `WHERE (u.email ILIKE $${values.length} OR u.id::text ILIKE $${values.length})`;
  }
  values.push(limit);
  const limitIdx = values.length;
  values.push(offset);
  const offsetIdx = values.length;

  try {
    const listSql = `
      SELECT
        u.id,
        u.email,
        u.plan_id AS "planId",
        u.plan_label AS "planLabel",
        u.tokens_remaining AS "tokensRemaining",
        u.total_used AS "totalUsed",
        u.email_verified AS "emailVerified",
        u.created_at AS "createdAt",
        u.updated_at AS "updatedAt",
        u.subscription_status AS "subscriptionStatus",
        u.included_cbt_per_month AS "includedCbtPerMonth",
        u.included_cbt_remaining AS "includedCbtRemaining",
        u.workspaces_allowed AS "workspacesAllowed",
        u.workspaces_selected AS "workspacesSelected",
        COALESCE(ws.workspace_count, 0) AS "workspaceCount",
        COALESCE(runs.run_count, 0) AS "runsCount",
        COALESCE(artifacts.artifact_count, 0) AS "artifactsCount",
        COALESCE(artifacts.artifact_bytes, 0) AS "artifactsBytes"
      FROM users u
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS workspace_count
        FROM workspaces w
        WHERE w.owner_id = u.id::text
      ) ws ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS run_count
        FROM runs r
        JOIN workspaces w ON w.id = r.workspace_id
        WHERE w.owner_id = u.id::text
      ) runs ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS artifact_count,
               COALESCE(SUM(a.bytes), 0) AS artifact_bytes
        FROM artifacts a
        JOIN workspaces w ON w.id = a.workspace_id
        WHERE w.owner_id = u.id::text
      ) artifacts ON true
      ${whereSql}
      ORDER BY u.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`;

    const { rows } = await query(listSql, values);

    let total = null;
    if (q) {
      const { rows: countRows } = await query(
        `SELECT COUNT(*)::int AS total FROM users u ${whereSql}`,
        [values[0]],
      );
      total = countRows[0]?.total ?? 0;
    }

    res.json({
      limit,
      offset,
      total,
      users: rows,
    });
  } catch (err) {
    console.error('[ADMIN_USERS_ERROR]', err?.message || err);
    res.status(500).json({ error: 'admin_users_failed' });
  }
});

router.get('/users/:userId', async (req, res) => {
  const key = String(req.params.userId || '').trim();
  if (!key) {
    return res.status(400).json({ error: 'user_id_required' });
  }

  const runsLimitRaw = parseInt(req.query.runsLimit || '20', 10);
  const runsLimit = Number.isFinite(runsLimitRaw) ? Math.min(Math.max(runsLimitRaw, 1), 200) : 20;

  try {
    const { rows: userRows } = await query(
      `SELECT
         id,
         email,
         plan_id AS "planId",
         plan_label AS "planLabel",
         tokens_remaining AS "tokensRemaining",
         total_used AS "totalUsed",
         email_verified AS "emailVerified",
         created_at AS "createdAt",
         updated_at AS "updatedAt",
         subscription_status AS "subscriptionStatus",
         included_cbt_per_month AS "includedCbtPerMonth",
         included_cbt_remaining AS "includedCbtRemaining",
         workspaces_allowed AS "workspacesAllowed",
         workspaces_selected AS "workspacesSelected"
       FROM users
       WHERE id::text = $1 OR email = $1
       LIMIT 1`,
      [key],
    );

    const user = userRows[0];
    if (!user) {
      return res.status(404).json({ error: 'user_not_found' });
    }

    const ownerId = user.id;
    const { rows: workspaceRows } = await query(
      `SELECT
         id,
         slug,
         name,
         workspace_type AS "workspaceType",
         system_kind AS "systemKind",
         created_at AS "createdAt",
         updated_at AS "updatedAt"
       FROM workspaces
       WHERE owner_id = $1
       ORDER BY created_at DESC`,
      [ownerId],
    );

    const { rows: runRows } = await query(
      `SELECT
         id,
         workspace_id AS "workspaceId",
         client_id AS "clientId",
         title,
         status,
         created_at AS "createdAt",
         updated_at AS "updatedAt"
       FROM runs
       WHERE workspace_id IN (
         SELECT id FROM workspaces WHERE owner_id = $1
       )
       ORDER BY created_at DESC
       LIMIT $2`,
      [ownerId, runsLimit],
    );

    const { rows: statsRows } = await query(
      `SELECT
         (SELECT COUNT(*)::int FROM workspaces w WHERE w.owner_id = $1) AS "workspaceCount",
         (SELECT COUNT(*)::int FROM runs r JOIN workspaces w ON w.id = r.workspace_id WHERE w.owner_id = $1) AS "runsCount",
         (SELECT COUNT(*)::int FROM artifacts a JOIN workspaces w ON w.id = a.workspace_id WHERE w.owner_id = $1) AS "artifactsCount",
         (SELECT COALESCE(SUM(a.bytes), 0) FROM artifacts a JOIN workspaces w ON w.id = a.workspace_id WHERE w.owner_id = $1) AS "artifactsBytes"`,
      [ownerId],
    );

    const stats = statsRows[0] || {};

    return res.json({
      user,
      workspaces: workspaceRows,
      latestRuns: runRows,
      stats,
    });
  } catch (err) {
    console.error('[ADMIN_USER_DETAIL_ERROR]', err?.message || err);
    return res.status(500).json({ error: 'admin_user_detail_failed' });
  }
});

router.get('/usage/daily', async (req, res) => {
  const rawFrom = String(req.query.from || '').trim();
  const rawTo = String(req.query.to || '').trim();

  function toDate(value) {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
  }

  const fromDate = toDate(rawFrom);
  const toDateValue = toDate(rawTo);

  try {
    const { rows } = await query(
      `WITH bounds AS (
          SELECT
            COALESCE($1::date, (now() - interval '7 days')::date) AS from_date,
            COALESCE($2::date, now()::date) AS to_date
        ),
        days AS (
          SELECT generate_series(from_date, to_date, interval '1 day')::date AS day
          FROM bounds
        ),
        run_agg AS (
          SELECT date_trunc('day', ts)::date AS day, COUNT(*)::int AS run_events
          FROM run_events, bounds
          WHERE ts >= bounds.from_date
            AND ts < bounds.to_date + interval '1 day'
          GROUP BY 1
        ),
        artifact_agg AS (
          SELECT date_trunc('day', created_at)::date AS day,
                 COUNT(*)::int AS artifacts,
                 COALESCE(SUM(bytes), 0) AS artifact_bytes
          FROM artifacts, bounds
          WHERE created_at >= bounds.from_date
            AND created_at < bounds.to_date + interval '1 day'
          GROUP BY 1
        ),
        token_agg AS (
          SELECT date_trunc('day', created_at)::date AS day,
                 COALESCE(SUM(total_tokens), 0) AS total_tokens,
                 COALESCE(SUM(total_cost), 0) AS total_cost
          FROM token_usage, bounds
          WHERE created_at >= bounds.from_date
            AND created_at < bounds.to_date + interval '1 day'
          GROUP BY 1
        )
        SELECT
          d.day,
          COALESCE(r.run_events, 0) AS "runEvents",
          COALESCE(a.artifacts, 0) AS "artifacts",
          COALESCE(a.artifact_bytes, 0) AS "artifactBytes",
          COALESCE(t.total_tokens, 0) AS "totalTokens",
          COALESCE(t.total_cost, 0) AS "totalCost"
        FROM days d
        LEFT JOIN run_agg r ON r.day = d.day
        LEFT JOIN artifact_agg a ON a.day = d.day
        LEFT JOIN token_agg t ON t.day = d.day
        ORDER BY d.day ASC`,
      [fromDate, toDateValue],
    );

    res.json({
      from: fromDate,
      to: toDateValue,
      days: rows,
    });
  } catch (err) {
    console.error('[ADMIN_USAGE_DAILY_ERROR]', err?.message || err);
    res.status(500).json({ error: 'admin_usage_daily_failed' });
  }
});

router.get('/token-usage', async (req, res) => {
  const rawDays = parseInt(req.query.days || '7', 10);
  const windowDays = Number.isFinite(rawDays) ? Math.min(Math.max(rawDays, 1), 90) : 7;

  try {
    const { rows } = await query(
      `SELECT
          workspace_id,
          scenario_id,
          agent_id,
          provider,
          model,
          provider_model_id,
          COUNT(*) AS calls,
          COALESCE(SUM(total_tokens), 0) AS total_tokens,
          COALESCE(SUM(total_cost), 0) AS total_cost
        FROM token_usage
       WHERE created_at >= now() - ($1::int || ' days')::interval
       GROUP BY workspace_id, scenario_id, agent_id, provider, model, provider_model_id
       ORDER BY total_tokens DESC NULLS LAST, calls DESC`,
      [windowDays],
    );

    return res.json({ windowDays, records: rows });
  } catch (err) {
    console.error('[ADMIN_USAGE_ERROR]', err?.message);
    return res.status(500).json({ error: 'admin_token_usage_failed' });
  }
});

export default router;
