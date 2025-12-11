import express from 'express';
import { google } from 'googleapis';
import { URL } from 'node:url';
import { requireUser } from '../middleware/auth.js';
import { getUserByEmail } from '../userStore.js';
import { logError } from '../logger.js';
import {
  getConnectionByWorkspace,
  upsertConnection,
  markDisconnected,
  updateProperty,
} from '../repos/ga4ConnectionsRepo.js';

const router = express.Router();
console.log('[GA4_ROUTER_LOADED]');

const GA4_SCOPES = ['https://www.googleapis.com/auth/analytics.readonly'];

function getUserKey(user) {
  return user && user.id ? String(user.id) : null;
}

function getWorkspaceId(req) {
  return req.query?.workspaceId || req.body?.workspaceId || req.workspaceId || 'business';
}

function createOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const base = process.env.GOOGLE_ADS_OAUTH_REDIRECT_BASE; // reuse the same base as Google Ads

  if (!clientId || !clientSecret || !base) {
    const msg = 'GA4 OAuth env vars missing';
    console.warn('[GA4_CONFIG_MISSING]', { clientId: !!clientId, clientSecret: !!clientSecret, base: !!base });
    throw new Error(msg);
  }

  const redirectUri = `${base.replace(/\/$/, '')}/api/connectors/ga4/oauth/callback`;
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function buildAppRedirect(status, errorCode) {
  const appBase = process.env.APP_BASE_URL || process.env.COOLBITS_PUBLIC_BASE_URL || 'https://coolbits.ai';
  const url = new URL('/chat', appBase);
  url.searchParams.set('connector', 'ga4');
  url.searchParams.set('status', status);
  if (errorCode) url.searchParams.set('error', errorCode);
  return url.toString();
}

router.get('/status', requireUser, async (req, res) => {
  const email = req.userEmail || req.user?.email || null;
  if (!email) return res.status(401).json({ error: 'Unauthorized' });

  try {
    createOAuthClient();
  } catch (err) {
    console.warn('[GA4_STATUS] config missing; returning disconnected');
    return res.json({
      connected: false,
      propertyId: null,
      lastSyncAt: null,
      status: 'disconnected',
      error: 'not_configured',
    });
  }

  const user = await getUserByEmail(email);
  const userKey = getUserKey(user);
  if (!userKey) return res.status(401).json({ error: 'Unauthorized' });
  const workspaceId = getWorkspaceId(req);

  const record = await getConnectionByWorkspace(workspaceId, userKey);
  const connected = Boolean(record && record.status === 'connected' && record.refreshToken);
  console.log('[GA4_STATUS]', { workspaceId, userId: userKey, connected });

  if (!connected) {
    return res.json({
      connected: false,
      propertyId: record?.propertyId || null,
      lastSyncAt: record?.updatedAt || null,
      status: record?.status || 'disconnected',
      error: record?.status === 'error' ? 'connection_error' : null,
    });
  }

  return res.json({
    connected: true,
    propertyId: record.propertyId || null,
    lastSyncAt: record.updatedAt ? record.updatedAt.toISOString() : null,
    status: record.status,
    error: null,
  });
});

router.get('/auth/url', requireUser, async (req, res) => {
  const email = req.userEmail || req.user?.email || null;
  if (!email) return res.status(401).json({ error: 'Unauthorized' });
  const user = await getUserByEmail(email);
  const userKey = getUserKey(user);
  if (!userKey) return res.status(401).json({ error: 'Unauthorized' });

  let oauth2Client;
  try {
    oauth2Client = createOAuthClient();
  } catch (err) {
    logError(err);
    return res.status(500).json({ error: 'not_configured' });
  }

  const statePayload = {
    u: userKey,
    e: user?.email || email,
    ws: getWorkspaceId(req),
    ts: Date.now(),
  };
  const state = Buffer.from(JSON.stringify(statePayload)).toString('base64url');

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GA4_SCOPES,
    state,
  });

  console.log('[GA4_AUTH_URL]', { userId: userKey });

  return res.json({ url });
});

router.get('/oauth/callback', async (req, res) => {
  const logPrefix = '[GA4_OAUTH_CALLBACK]';
  const { code, state } = req.query || {};

  if (!code) {
    console.error(logPrefix, 'missing code', req.query);
    return res.redirect(302, buildAppRedirect('error', 'missing_code'));
  }

  let decoded = null;
  if (state) {
    try {
      decoded = JSON.parse(Buffer.from(String(state), 'base64url').toString('utf8'));
    } catch (err) {
      console.error(logPrefix, 'failed to parse state', err?.message);
    }
  }

  const userKey = decoded?.u || decoded?.userId || null;
  const workspaceId = decoded?.ws || decoded?.workspaceId || 'business';

  let oauth2Client;
  try {
    oauth2Client = createOAuthClient();
  } catch (err) {
    console.error(logPrefix, 'config error', err?.message);
    return res.redirect(302, buildAppRedirect('error', 'not_configured'));
  }

  try {
    const { tokens } = await oauth2Client.getToken(String(code));
    const refreshToken = tokens.refresh_token || null;

    if (userKey) {
      await upsertConnection({
        workspaceId,
        userId: userKey,
        propertyId: null,
        refreshToken,
        status: refreshToken ? 'connected' : 'error',
        connectedAt: new Date(),
      });
    }

    console.log(logPrefix, 'stored connection', {
      userId: userKey,
      workspaceId,
      hasRefresh: Boolean(refreshToken),
    });

    return res.redirect(302, buildAppRedirect(refreshToken ? 'success' : 'error', refreshToken ? null : 'token_exchange_failed'));
  } catch (err) {
    console.error(logPrefix, 'token exchange failed', err?.message);
    return res.redirect(302, buildAppRedirect('error', 'token_exchange_failed'));
  }
});

router.post('/disconnect', requireUser, async (req, res) => {
  const email = req.userEmail || req.user?.email || null;
  if (!email) return res.status(401).json({ error: 'Unauthorized' });
  const user = await getUserByEmail(email);
  const userKey = getUserKey(user);
  if (!userKey) return res.status(401).json({ error: 'Unauthorized' });
  const workspaceId = getWorkspaceId(req);

  await markDisconnected({ workspaceId, userId: userKey });
  console.log('[GA4_DISCONNECT]', { workspaceId, userId: userKey });
  return res.json({ ok: true });
});

router.get('/properties', requireUser, async (req, res) => {
  const email = req.userEmail || req.user?.email || null;
  if (!email) return res.status(401).json({ error: 'Unauthorized' });
  const user = await getUserByEmail(email);
  const userKey = getUserKey(user);
  if (!userKey) return res.status(401).json({ error: 'Unauthorized' });
  const workspaceId = getWorkspaceId(req);

  let oauth2Client;
  try {
    oauth2Client = createOAuthClient();
  } catch (err) {
    logError(err);
    return res.status(500).json({ error: 'not_configured' });
  }

  const conn = await getConnectionByWorkspace(workspaceId, userKey);
  if (!conn || conn.status !== 'connected' || !conn.refreshToken) {
    return res.status(400).json({ error: 'not_connected' });
  }

  try {
    oauth2Client.setCredentials({ refresh_token: conn.refreshToken });
    const analyticsadmin = google.analyticsadmin('v1beta');
    const resp = await analyticsadmin.properties.list({
      auth: oauth2Client,
      pageSize: 50,
      filter: 'ancestor:accounts/-',
    });
    const properties = (resp.data?.properties || []).map((p) => ({
      propertyId: typeof p.name === 'string' ? p.name.replace('properties/', '') : null,
      displayName: p.displayName || p.propertyDisplayName || p.name,
    })).filter((p) => p.propertyId);

    return res.json({ properties });
  } catch (err) {
    console.error('[GA4_PROPERTIES_ERROR]', err?.message);
    return res.status(500).json({ error: 'ga4_api_error' });
  }
});

router.post('/property', requireUser, async (req, res) => {
  const email = req.userEmail || req.user?.email || null;
  if (!email) return res.status(401).json({ error: 'Unauthorized' });
  const user = await getUserByEmail(email);
  const userKey = getUserKey(user);
  if (!userKey) return res.status(401).json({ error: 'Unauthorized' });
  const workspaceId = getWorkspaceId(req);
  const propertyId = (req.body?.propertyId || '').trim();

  if (!propertyId) {
    return res.status(400).json({ error: 'invalid_property' });
  }

  await updateProperty({ workspaceId, userId: userKey, propertyId });
  const record = await getConnectionByWorkspace(workspaceId, userKey);

  return res.json({
    connected: Boolean(record && record.status === 'connected' && record.refreshToken),
    propertyId: propertyId,
    lastSyncAt: record?.updatedAt || null,
    status: record?.status || 'connected',
    error: null,
  });
});

router.get('/summary', requireUser, async (req, res) => {
  const email = req.userEmail || req.user?.email || null;
  if (!email) return res.status(401).json({ error: 'Unauthorized' });
  const user = await getUserByEmail(email);
  const userKey = getUserKey(user);
  if (!userKey) return res.status(401).json({ error: 'Unauthorized' });
  const workspaceId = getWorkspaceId(req);
  const dateRange = req.query?.dateRange || 'last_7_days';

  let oauth2Client;
  try {
    oauth2Client = createOAuthClient();
  } catch (err) {
    logError(err);
    return res.status(500).json({ error: 'not_configured' });
  }

  const conn = await getConnectionByWorkspace(workspaceId, userKey);
  if (!conn || conn.status !== 'connected' || !conn.refreshToken) {
    return res.status(400).json({ error: 'not_connected' });
  }

  if (!conn.propertyId) {
    return res.status(400).json({ error: 'property_not_set' });
  }

  try {
    oauth2Client.setCredentials({ refresh_token: conn.refreshToken });
    const analyticsdata = google.analyticsdata('v1beta');
    const report = await analyticsdata.properties.runReport({
      auth: oauth2Client,
      property: `properties/${conn.propertyId}`,
      requestBody: {
        dateRanges: [{ startDate: '7daysAgo', endDate: 'yesterday' }],
        metrics: [
          { name: 'sessions' },
          { name: 'totalUsers' },
          { name: 'newUsers' },
          { name: 'sessionConversionRate' },
          { name: 'totalRevenue' },
        ],
      },
    });

    const rows = report.data?.rows || [];
    let sessions = 0;
    let totalUsers = 0;
    let newUsers = 0;
    let sessionConversionRate = 0;
    let totalRevenue = 0;

    const parseNumber = (value) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    };

    for (const row of rows) {
      const metrics = row.metricValues || [];
      sessions += parseNumber(metrics[0]?.value);
      totalUsers += parseNumber(metrics[1]?.value);
      newUsers += parseNumber(metrics[2]?.value);
      sessionConversionRate += parseNumber(metrics[3]?.value);
      totalRevenue += parseNumber(metrics[4]?.value);
    }

    // GA4 returns sessionConversionRate as a percentage (e.g., 2.5 for 2.5%).
    const conversions = sessions > 0 ? sessions * (sessionConversionRate / 100) : 0;

    console.log('[GA4_SUMMARY]', { workspaceId, userId: userKey, propertyId: conn.propertyId, sessions, totalUsers, newUsers });

    return res.json({
      dateRange,
      propertyId: conn.propertyId,
      sessions,
      totalUsers,
      newUsers,
      conversions,
      sessionConversionRate,
      totalRevenue,
    });
  } catch (err) {
    console.error('[GA4_SUMMARY_ERROR]', err?.message);
    return res.status(500).json({ error: 'ga4_api_error' });
  }
});

export default router;
