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
  updateCustomerId,
} from '../repos/googleAdsConnectionsRepo.js';
import { createSnapshot, getSnapshotById, listSnapshots } from '../repos/googleAdsSnapshotsRepo.js';

const router = express.Router();
console.log('[GOOGLEADS_ROUTER_LOADED]');
const GOOGLE_ADS_SCOPES = ['https://www.googleapis.com/auth/adwords'];
const GOOGLE_ADS_API_VERSION = (() => {
  const raw = String(process.env.GOOGLE_ADS_API_VERSION || 'v20').trim();
  if (!raw) return 'v20';
  return raw.startsWith('v') ? raw : `v${raw}`;
})();
const GOOGLE_ADS_API_BASE = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;
const GOOGLEADS_REPORT_ALLOWED_BLOCKS = new Set([
  'overview',
  'series',
  'campaigns',
  'devices',
  'networks',
  'search_terms',
  'keywords',
]);
const GOOGLEADS_REPORT_DEFAULT_BLOCKS = ['overview', 'series', 'campaigns', 'devices'];
const GOOGLEADS_REPORT_COMPARE_MODES = new Set(['none', 'previous_period', 'previous_year', 'custom']);

export function mapGoogleAdsCustomersError(err) {
  const status = Number(err?.status || err?.response?.status || err?.statusCode || 0);
  if (status === 401) {
    return {
      httpStatus: 401,
      body: { error: 'googleads_auth_failed', action: 'reconnect', status: 401 },
    };
  }
  return { httpStatus: 500, body: { error: 'googleads_api_error' } };
}

function getUserKey(user) {
  return user && user.id ? String(user.id) : null;
}

function getWorkspaceId(req) {
  return req.query?.workspaceId || req.body?.workspaceId || req.workspaceId || 'business';
}

function safeLogValue(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\s+/g, ' ').slice(0, 220);
}

function sanitizeLogText(value) {
  if (typeof value !== 'string') return null;
  return value
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/refresh_token["']?\s*:\s*["'][^"']+["']/gi, 'refresh_token:"[REDACTED]"')
    .replace(/access_token["']?\s*:\s*["'][^"']+["']/gi, 'access_token:"[REDACTED]"')
    .replace(/id_token["']?\s*:\s*["'][^"']+["']/gi, 'id_token:"[REDACTED]"');
}

function sanitizeErrorForLog(err) {
  if (!err || typeof err !== 'object') {
    return { name: null, code: null, message: null, stack: null };
  }
  const message = safeLogValue(err?.message || '') || null;
  const rawStack = typeof err?.stack === 'string' ? err.stack : null;
  const stack = rawStack ? sanitizeLogText(rawStack).slice(0, 1800) : null;
  const code = typeof err?.code === 'string' ? err.code : null;
  return { name: err?.name || null, code, message, stack };
}

function isPgError(err) {
  return !!(err && typeof err === 'object' && typeof err.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code));
}

function getPublicProto(req) {
  const xfProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  if (xfProto) return xfProto;

  // Cloudflare often sends: cf-visitor: {"scheme":"https"}
  const cfVisitor = req.headers['cf-visitor'];
  if (cfVisitor) {
    try {
      const j = JSON.parse(String(cfVisitor));
      if (j && j.scheme) return j.scheme;
    } catch {
      // ignore
    }
  }

  return 'https';
}

function getPublicHost(req) {
  const xfHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  return xfHost || req.headers.host;
}

function getPublicBase(req) {
  return `${getPublicProto(req)}://${getPublicHost(req)}`;
}

function getOAuthRedirectBase(req) {
  const configuredBase = String(process.env.GOOGLE_ADS_OAUTH_REDIRECT_BASE || '').trim();
  const base = configuredBase || getPublicBase(req);
  return base.replace(/\/$/, '');
}

function createOAuthClient(baseOverride) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const base = baseOverride || process.env.GOOGLE_ADS_OAUTH_REDIRECT_BASE;
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

  if (!clientId || !clientSecret || !base || !developerToken) {
    const msg = 'Google Ads OAuth env vars missing';
    console.warn('[GOOGLEADS_CONFIG_MISSING]', { clientId: !!clientId, clientSecret: !!clientSecret, base: !!base, developerToken: !!developerToken });
    throw new Error(msg);
  }

  const redirectUri = `${base.replace(/\/$/, '')}/api/connectors/googleads/oauth/callback`;

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  return oauth2Client;
}

function getOauthErrorDetails(err) {
  const data = err?.response?.data;
  const oauthError = typeof data?.error === 'string' ? data.error : null;
  const oauthErrorDescription = typeof data?.error_description === 'string' ? data.error_description : null;
  return { oauthError, oauthErrorDescription };
}

function extractGoogleAdsApiMessage(payload) {
  const root = payload?.error || payload?.[0]?.error || payload?.[0] || null;
  if (typeof root?.message === 'string') return root.message;
  if (typeof payload?.message === 'string') return payload.message;
  return null;
}

function extractGoogleAdsApiStatus(payload) {
  const root = payload?.error || payload?.[0]?.error || payload?.[0] || null;
  if (typeof root?.status === 'string') return root.status;
  if (typeof payload?.status === 'string') return payload.status;
  return null;
}

function extractGoogleAdsFailureErrors(payload) {
  const root = payload?.error || payload?.[0]?.error || payload?.[0] || null;
  const details = Array.isArray(root?.details) ? root.details : [];
  for (const detail of details) {
    const errors = Array.isArray(detail?.errors) ? detail.errors : [];
    if (errors.length) return errors;
  }
  return [];
}

function extractGoogleAdsFailureCode(payload) {
  const errors = extractGoogleAdsFailureErrors(payload);
  for (const error of errors) {
    const code = error?.errorCode || error?.error_code || null;
    if (!code || typeof code !== 'object') continue;
    if (typeof code.authorizationError === 'string') return code.authorizationError;
    if (typeof code.authenticationError === 'string') return code.authenticationError;
    if (typeof code.quotaError === 'string') return code.quotaError;
    if (typeof code.rateLimitError === 'string') return code.rateLimitError;
    if (typeof code.requestError === 'string') return code.requestError;
    const first = Object.values(code).find((v) => typeof v === 'string');
    if (typeof first === 'string') return first;
  }
  return null;
}

function normalizeCompareMode(value) {
  const raw = (value || '').toString().trim().toLowerCase();
  if (raw === 'previous_period') return 'previous_period';
  if (raw === 'previous_year') return 'previous_year';
  if (raw === 'custom') return 'custom';
  return 'none';
}

function normalizeGoogleAdsBlocks(value) {
  if (typeof value !== 'string') {
    return GOOGLEADS_REPORT_DEFAULT_BLOCKS.slice();
  }
  const raw = value.trim();
  if (!raw) {
    return GOOGLEADS_REPORT_DEFAULT_BLOCKS.slice();
  }
  const blocks = raw
    .split(',')
    .map((b) => b.trim().toLowerCase())
    .filter(Boolean)
    .filter((b) => GOOGLEADS_REPORT_ALLOWED_BLOCKS.has(b));
  const unique = Array.from(new Set(blocks));
  return unique.length ? unique : GOOGLEADS_REPORT_DEFAULT_BLOCKS.slice();
}

function percentChange(current, previous) {
  if (current == null || previous == null) return null;
  const currentNumber = Number(current);
  const previousNumber = Number(previous);
  if (!Number.isFinite(currentNumber) || !Number.isFinite(previousNumber)) return null;
  if (previousNumber === 0) {
    return currentNumber === 0 ? 0 : null;
  }
  const pct = ((currentNumber - previousNumber) / previousNumber) * 100;
  if (!Number.isFinite(pct)) return null;
  return Math.round(pct * 10) / 10;
}

function createConcurrencyLimiter(maxConcurrent) {
  const limit = Number(maxConcurrent) || 1;
  let active = 0;
  const queue = [];

  const next = () => {
    if (active >= limit) return;
    const item = queue.shift();
    if (!item) return;
    active += 1;
    Promise.resolve()
      .then(item.fn)
      .then((value) => {
        active -= 1;
        item.resolve(value);
        next();
      })
      .catch((err) => {
        active -= 1;
        item.reject(err);
        next();
      });
  };

  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
}

function isValidYmd(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseUtcYmd(value) {
  if (!isValidYmd(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatUtcYmd(date) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function addUtcDays(date, days) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function diffUtcDaysInclusive(fromDate, toDate) {
  const dayMs = 24 * 60 * 60 * 1000;
  const diff = Math.floor((toDate.getTime() - fromDate.getTime()) / dayMs);
  return diff + 1;
}

function computePreviousRange(rangeFrom, rangeTo) {
  const fromDate = parseUtcYmd(rangeFrom);
  const toDate = parseUtcYmd(rangeTo);
  if (!fromDate || !toDate) return null;
  const days = diffUtcDaysInclusive(fromDate, toDate);
  const compareToDate = addUtcDays(fromDate, -1);
  const compareFromDate = addUtcDays(fromDate, -days);
  return { from: formatUtcYmd(compareFromDate), to: formatUtcYmd(compareToDate) };
}

function shiftUtcDateByYears(date, years) {
  const year = date.getUTCFullYear() + years;
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const candidate = new Date(Date.UTC(year, month, day));
  if (candidate.getUTCMonth() !== month) {
    return new Date(Date.UTC(year, month + 1, 0));
  }
  return candidate;
}

function computePreviousYearRange(rangeFrom, rangeTo) {
  const fromDate = parseUtcYmd(rangeFrom);
  const toDate = parseUtcYmd(rangeTo);
  if (!fromDate || !toDate) return null;
  const compareFromDate = shiftUtcDateByYears(fromDate, -1);
  const compareToDate = shiftUtcDateByYears(toDate, -1);
  return { from: formatUtcYmd(compareFromDate), to: formatUtcYmd(compareToDate) };
}

function createGoogleAdsHttpError({ httpStatus, payload }) {
  const err = new Error('googleads_http_error');
  err.httpStatus = httpStatus || 500;
  err.googleAdsPayload = payload || null;
  err.googleAdsStatus = extractGoogleAdsApiStatus(payload);
  err.googleAdsFailureCode = extractGoogleAdsFailureCode(payload);
  err.safeMessage = safeLogValue(extractGoogleAdsApiMessage(payload));
  return err;
}

function classifyGoogleAdsError(err) {
  const statusCode = Number(err?.httpStatus || err?.response?.status) || null;
  const { oauthError, oauthErrorDescription } = getOauthErrorDetails(err);
  const payload = err?.googleAdsPayload || null;
  const googleStatus = err?.googleAdsStatus || extractGoogleAdsApiStatus(payload);
  const googleFailureCode = err?.googleAdsFailureCode || extractGoogleAdsFailureCode(payload);
  const message = safeLogValue(err?.safeMessage || extractGoogleAdsApiMessage(payload) || err?.message || '');

  const lowered = (message || '').toLowerCase();
  const isRateLimited =
    statusCode === 429 ||
    googleStatus === 'RESOURCE_EXHAUSTED' ||
    (googleFailureCode || '').toLowerCase().includes('rate') ||
    lowered.includes('rate limit') ||
    lowered.includes('too many requests');
  const isQuotaExceeded =
    statusCode === 429 ||
    googleStatus === 'RESOURCE_EXHAUSTED' ||
    (googleFailureCode || '').toLowerCase().includes('quota') ||
    lowered.includes('quota') ||
    lowered.includes('resource exhausted');

  if (oauthError === 'invalid_grant' || lowered.includes('invalid_grant')) {
    return {
      httpStatus: 400,
      error: 'invalid_grant',
      message: oauthErrorDescription || 'Google authorization expired. Disconnect and reconnect.',
      details: { statusCode, googleStatus, googleFailureCode },
    };
  }

  if (googleFailureCode === 'DEVELOPER_TOKEN_NOT_APPROVED') {
    return {
      httpStatus: 403,
      error: 'DEVELOPER_TOKEN_NOT_APPROVED',
      message: 'Developer token not approved / not enabled for this feature. Reporting is currently blocked.',
      details: { statusCode, googleStatus, googleFailureCode },
    };
  }

  if (isRateLimited) {
    return {
      httpStatus: 429,
      error: isQuotaExceeded ? 'quota_exceeded' : 'rate_limited',
      message: isQuotaExceeded
        ? 'Google Ads API quota exceeded. Please try again later.'
        : 'Google Ads API rate limited. Please retry in a moment.',
      details: { statusCode, googleStatus, googleFailureCode },
    };
  }

  if (statusCode === 403 || googleStatus === 'PERMISSION_DENIED') {
    return {
      httpStatus: 403,
      error: 'insufficient_permissions',
      message: 'The connected Google account does not have access to this Google Ads customer.',
      details: { statusCode, googleStatus, googleFailureCode },
    };
  }

  if (statusCode === 401 || googleStatus === 'UNAUTHENTICATED') {
    return {
      httpStatus: 400,
      error: 'invalid_grant',
      message: 'Google authorization expired. Disconnect and reconnect.',
      details: { statusCode, googleStatus, googleFailureCode },
    };
  }

  return {
    httpStatus: 500,
    error: 'googleads_api_error',
    message: message || 'Google Ads request failed.',
    details: { statusCode, googleStatus, googleFailureCode },
  };
}

function parseMetricNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function metricsValue(metrics, camel, snake) {
  if (!metrics) return 0;
  if (metrics[camel] != null) return parseMetricNumber(metrics[camel]);
  if (metrics[snake] != null) return parseMetricNumber(metrics[snake]);
  return 0;
}

function extractCurrencyCodeFromRow(row) {
  const code = row?.customer?.currencyCode || row?.customer?.currency_code || null;
  return typeof code === 'string' && code.trim() ? code.trim() : null;
}

async function googleAdsSearchStream({ headers, customerId, query }) {
  const resp = await fetch(`${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:searchStream`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query }),
  });

  const respText = await resp.text();
  let payload = null;
  try {
    payload = JSON.parse(respText);
  } catch {
    payload = null;
  }

  if (!resp.ok) {
    throw createGoogleAdsHttpError({ httpStatus: resp.status, payload });
  }

  const chunks = Array.isArray(payload) ? payload : [];
  const rows = chunks.flatMap((c) => (Array.isArray(c.results) ? c.results : []));
  return rows;
}

async function buildGoogleAdsReportV1({
  oauth2Client,
  customerId,
  loginCustomerId,
  rangeFrom,
  rangeTo,
  blocks,
  compare,
}) {
  const tokenInfo = await oauth2Client.getAccessToken();
  const accessToken = tokenInfo?.token;
  if (!accessToken) {
    throw createGoogleAdsHttpError({ httpStatus: 500, payload: { message: 'missing_access_token' } });
  }

  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': developerToken,
    'Content-Type': 'application/json',
  };
  if (loginCustomerId) {
    headers['login-customer-id'] = String(loginCustomerId);
  }

  const limiter = createConcurrencyLimiter(2);
  let currencyCode = null;
  const data = {};

  const runOverview = async (from, to) => {
    const query = `
      SELECT
        customer.currency_code,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value
      FROM customer
      WHERE segments.date BETWEEN '${from}' AND '${to}'
    `;
    const rows = await googleAdsSearchStream({ headers, customerId, query });
    const totals = {
      currencyCode: null,
      impressions: 0,
      clicks: 0,
      cost: 0,
      conversions: 0,
      convValue: 0,
    };
    let costMicros = 0;
    for (const row of rows) {
      const metrics = row.metrics || {};
      totals.impressions += metricsValue(metrics, 'impressions', 'impressions');
      totals.clicks += metricsValue(metrics, 'clicks', 'clicks');
      costMicros += metricsValue(metrics, 'costMicros', 'cost_micros');
      totals.conversions += metricsValue(metrics, 'conversions', 'conversions');
      totals.convValue += metricsValue(metrics, 'conversionsValue', 'conversions_value');
      if (!totals.currencyCode) {
        totals.currencyCode = extractCurrencyCodeFromRow(row);
      }
    }
    totals.cost = costMicros / 1_000_000;
    totals.ctr = totals.impressions > 0 ? totals.clicks / totals.impressions : 0;
    totals.avgCpc = totals.clicks > 0 ? totals.cost / totals.clicks : 0;
    totals.roas = totals.cost > 0 ? totals.convValue / totals.cost : null;
    totals.cpa = totals.conversions > 0 ? totals.cost / totals.conversions : null;
    return totals;
  };

  const runSeries = async (from, to) => {
    const query = `
      SELECT
        segments.date,
        customer.currency_code,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value
      FROM customer
      WHERE segments.date BETWEEN '${from}' AND '${to}'
      ORDER BY segments.date
    `;
    const rows = await googleAdsSearchStream({ headers, customerId, query });
    const byDate = new Map();
    for (const row of rows) {
      const date = row?.segments?.date || row?.segments?.date?.value || null;
      if (!date) continue;
      const metrics = row.metrics || {};
      const prev = byDate.get(date) || {
        date,
        impressions: 0,
        clicks: 0,
        cost: 0,
        conversions: 0,
        convValue: 0,
      };
      prev.impressions += metricsValue(metrics, 'impressions', 'impressions');
      prev.clicks += metricsValue(metrics, 'clicks', 'clicks');
      prev.cost += metricsValue(metrics, 'costMicros', 'cost_micros') / 1_000_000;
      prev.conversions += metricsValue(metrics, 'conversions', 'conversions');
      prev.convValue += metricsValue(metrics, 'conversionsValue', 'conversions_value');
      byDate.set(date, prev);
      if (!currencyCode) {
        currencyCode = extractCurrencyCodeFromRow(row);
      }
    }
    return Array.from(byDate.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  };

  const runCampaigns = async (from, to) => {
    const query = `
      SELECT
        campaign.id,
        campaign.name,
        campaign.advertising_channel_type,
        campaign.status,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value
      FROM campaign
      WHERE segments.date BETWEEN '${from}' AND '${to}'
      ORDER BY metrics.cost_micros DESC
      LIMIT 20
    `;
    const rows = await googleAdsSearchStream({ headers, customerId, query });
    return rows
      .map((row) => {
        const campaign = row.campaign || row.campaign_ || null;
        const metrics = row.metrics || {};
        const id = campaign?.id || campaign?.campaignId || campaign?.campaign_id || null;
        const name = campaign?.name || '';
        const channel = campaign?.advertisingChannelType || campaign?.advertising_channel_type || null;
        const status = campaign?.status || null;
        const cost = metricsValue(metrics, 'costMicros', 'cost_micros') / 1_000_000;
        const convValue = metricsValue(metrics, 'conversionsValue', 'conversions_value');
        const conversions = metricsValue(metrics, 'conversions', 'conversions');
        return {
          id: id == null ? null : String(id),
          name,
          channel,
          status,
          impressions: metricsValue(metrics, 'impressions', 'impressions'),
          clicks: metricsValue(metrics, 'clicks', 'clicks'),
          cost,
          conversions,
          convValue,
          roas: cost > 0 ? convValue / cost : null,
        };
      })
      .filter((row) => row && row.id);
  };

  const runDevices = async (from, to) => {
    const query = `
      SELECT
        segments.device,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value
      FROM customer
      WHERE segments.date BETWEEN '${from}' AND '${to}'
      ORDER BY metrics.cost_micros DESC
    `;
    const rows = await googleAdsSearchStream({ headers, customerId, query });
    return rows
      .map((row) => {
        const device = row?.segments?.device || null;
        const metrics = row.metrics || {};
        const cost = metricsValue(metrics, 'costMicros', 'cost_micros') / 1_000_000;
        const convValue = metricsValue(metrics, 'conversionsValue', 'conversions_value');
        return {
          device: device || 'UNKNOWN',
          impressions: metricsValue(metrics, 'impressions', 'impressions'),
          clicks: metricsValue(metrics, 'clicks', 'clicks'),
          cost,
          conversions: metricsValue(metrics, 'conversions', 'conversions'),
          convValue,
          roas: cost > 0 ? convValue / cost : null,
        };
      })
      .filter(Boolean);
  };

  const runNetworks = async (from, to) => {
    const query = `
      SELECT
        segments.ad_network_type,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value
      FROM customer
      WHERE segments.date BETWEEN '${from}' AND '${to}'
      ORDER BY metrics.cost_micros DESC
    `;
    const rows = await googleAdsSearchStream({ headers, customerId, query });
    return rows
      .map((row) => {
        const network = row?.segments?.adNetworkType || row?.segments?.ad_network_type || null;
        const metrics = row.metrics || {};
        const cost = metricsValue(metrics, 'costMicros', 'cost_micros') / 1_000_000;
        const convValue = metricsValue(metrics, 'conversionsValue', 'conversions_value');
        return {
          network: network || 'UNKNOWN',
          impressions: metricsValue(metrics, 'impressions', 'impressions'),
          clicks: metricsValue(metrics, 'clicks', 'clicks'),
          cost,
          conversions: metricsValue(metrics, 'conversions', 'conversions'),
          convValue,
          roas: cost > 0 ? convValue / cost : null,
        };
      })
      .filter(Boolean);
  };

  const runSearchTerms = async (from, to) => {
    const query = `
      SELECT
        search_term_view.search_term,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value
      FROM search_term_view
      WHERE segments.date BETWEEN '${from}' AND '${to}'
      ORDER BY metrics.cost_micros DESC
      LIMIT 50
    `;
    const rows = await googleAdsSearchStream({ headers, customerId, query });
    return rows
      .map((row) => {
        const view = row.searchTermView || row.search_term_view || null;
        const term = view?.searchTerm || view?.search_term || null;
        const metrics = row.metrics || {};
        const cost = metricsValue(metrics, 'costMicros', 'cost_micros') / 1_000_000;
        return {
          term: term || '—',
          impressions: metricsValue(metrics, 'impressions', 'impressions'),
          clicks: metricsValue(metrics, 'clicks', 'clicks'),
          cost,
          conversions: metricsValue(metrics, 'conversions', 'conversions'),
          convValue: metricsValue(metrics, 'conversionsValue', 'conversions_value'),
        };
      })
      .filter(Boolean);
  };

  const runKeywords = async (from, to) => {
    const query = `
      SELECT
        ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value
      FROM keyword_view
      WHERE segments.date BETWEEN '${from}' AND '${to}'
      ORDER BY metrics.cost_micros DESC
      LIMIT 50
    `;
    const rows = await googleAdsSearchStream({ headers, customerId, query });
    return rows
      .map((row) => {
        const crit = row.adGroupCriterion || row.ad_group_criterion || null;
        const keyword = crit?.keyword || null;
        const text = keyword?.text || null;
        const matchType = keyword?.matchType || keyword?.match_type || null;
        const metrics = row.metrics || {};
        const cost = metricsValue(metrics, 'costMicros', 'cost_micros') / 1_000_000;
        return {
          keyword: text || '—',
          matchType: matchType || null,
          impressions: metricsValue(metrics, 'impressions', 'impressions'),
          clicks: metricsValue(metrics, 'clicks', 'clicks'),
          cost,
          conversions: metricsValue(metrics, 'conversions', 'conversions'),
          convValue: metricsValue(metrics, 'conversionsValue', 'conversions_value'),
        };
      })
      .filter(Boolean);
  };

  const requestedBlocks = Array.isArray(blocks) ? blocks : GOOGLEADS_REPORT_DEFAULT_BLOCKS.slice();
  const compareFrom = compare?.from || null;
  const compareTo = compare?.to || null;

  await Promise.all(
    requestedBlocks.map((block) =>
      limiter(async () => {
        if (block === 'overview') {
          const totals = await runOverview(rangeFrom, rangeTo);
          if (!currencyCode) currencyCode = totals.currencyCode;
          if (compareFrom && compareTo) {
            const compareTotals = await runOverview(compareFrom, compareTo);
            const keys = ['cost', 'clicks', 'impressions', 'ctr', 'avgCpc', 'conversions', 'convValue', 'roas', 'cpa'];
            const deltas = {};
            keys.forEach((key) => {
              const current = totals[key] == null ? null : Number(totals[key]);
              const previous = compareTotals[key] == null ? null : Number(compareTotals[key]);
              deltas[key] = {
                abs:
                  current == null || previous == null || !Number.isFinite(current) || !Number.isFinite(previous)
                    ? null
                    : Math.round((current - previous) * 1_000_000) / 1_000_000,
                pct: percentChange(current, previous),
              };
            });
            data.overview = { ...totals, deltas };
          } else {
            data.overview = totals;
          }
          return;
        }

        if (block === 'series') {
          const daily = await runSeries(rangeFrom, rangeTo);
          const series = { daily };
          if (compareFrom && compareTo) {
            const compareDaily = await runSeries(compareFrom, compareTo);
            series.compareDaily = compareDaily;
          }
          data.series = series;
          return;
        }

        if (block === 'campaigns') {
          const rows = await runCampaigns(rangeFrom, rangeTo);
          const blockPayload = { rows };
          if (compareFrom && compareTo) {
            blockPayload.compareRows = await runCampaigns(compareFrom, compareTo);
          }
          data.campaigns = blockPayload;
          return;
        }

        if (block === 'devices') {
          const rows = await runDevices(rangeFrom, rangeTo);
          const blockPayload = { rows };
          if (compareFrom && compareTo) {
            blockPayload.compareRows = await runDevices(compareFrom, compareTo);
          }
          data.devices = blockPayload;
          return;
        }

        if (block === 'networks') {
          const rows = await runNetworks(rangeFrom, rangeTo);
          const blockPayload = { rows };
          if (compareFrom && compareTo) {
            blockPayload.compareRows = await runNetworks(compareFrom, compareTo);
          }
          data.networks = blockPayload;
          return;
        }

        if (block === 'search_terms') {
          try {
            const rows = await runSearchTerms(rangeFrom, rangeTo);
            const blockPayload = { rows };
            if (compareFrom && compareTo) {
              try {
                blockPayload.compareRows = await runSearchTerms(compareFrom, compareTo);
              } catch {
                blockPayload.compareRows = [];
              }
            }
            data.search_terms = blockPayload;
          } catch (_err) {
            data.search_terms = { rows: [], compareRows: compareFrom && compareTo ? [] : undefined, warning: 'not_available' };
          }
          return;
        }

        if (block === 'keywords') {
          try {
            const rows = await runKeywords(rangeFrom, rangeTo);
            const blockPayload = { rows };
            if (compareFrom && compareTo) {
              try {
                blockPayload.compareRows = await runKeywords(compareFrom, compareTo);
              } catch {
                blockPayload.compareRows = [];
              }
            }
            data.keywords = blockPayload;
          } catch (_err) {
            data.keywords = { rows: [], compareRows: compareFrom && compareTo ? [] : undefined, warning: 'not_available' };
          }
          return;
        }
      }),
    ),
  );

  return {
    range: { from: rangeFrom, to: rangeTo },
    compare: compare ? { mode: compare.mode, from: compare.from, to: compare.to } : null,
    blocks: requestedBlocks,
    currencyCode: currencyCode || null,
    data,
  };
}

router.get('/status', requireUser, async (req, res) => {
  const email = req.userEmail || req.user?.email || null;
  if (!email) return res.status(401).json({ error: 'Unauthorized' });
  try {
    createOAuthClient();
  } catch (err) {
    console.warn('[GOOGLEADS_STATUS] config missing; returning disconnected');
    return res.json({
      connected: false,
      customerId: null,
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
  console.log('[GOOGLEADS_STATUS]', { workspaceId, userId: userKey, connected });

  if (!connected) {
    return res.json({
      connected: false,
      customerId: record?.customerId || null,
      loginCustomerId: record?.loginCustomerId || null,
      lastSyncAt: record?.updatedAt || null,
      status: record?.status || 'disconnected',
      error: record?.status === 'error' ? 'connection_error' : null,
    });
  }

  return res.json({
    connected: true,
    customerId: record.customerId || null,
    loginCustomerId: record?.loginCustomerId || null,
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
    const base = getOAuthRedirectBase(req);
    const redirectUri = `${base}/api/connectors/googleads/oauth/callback`;
    oauth2Client = createOAuthClient(base);
    console.log('[GOOGLEADS_AUTH_URL_CONFIG]', {
      base,
      redirectUri,
      xfProto: req.headers['x-forwarded-proto'],
      xfHost: req.headers['x-forwarded-host'],
      cfVisitor: req.headers['cf-visitor'],
      host: req.headers.host,
    });
  } catch (err) {
    logError(err);
    return res.status(500).json({ error: 'Google Ads OAuth not configured' });
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
    scope: GOOGLE_ADS_SCOPES,
    state,
  });

  console.log('[GOOGLEADS_AUTH_URL]', { userId: userKey });

  return res.json({ url });
});

router.get('/customers', requireUser, async (req, res) => {
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
    const tokenInfo = await oauth2Client.getAccessToken();
    const accessToken = tokenInfo?.token;
    if (!accessToken) {
      return res.status(500).json({ error: 'googleads_api_error' });
    }

    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': developerToken,
      'Content-Type': 'application/json',
    };

    // List accessible customer resource names
    const listResp = await fetch(`${GOOGLE_ADS_API_BASE}/customers:listAccessibleCustomers`, {
      method: 'GET',
      headers,
    });
    if (!listResp.ok) {
      const errorText = await listResp.text();
      const err = new Error(`listAccessibleCustomers failed: ${listResp.status}`);
      err.status = listResp.status;
      err.details = errorText;
      throw err;
    }
    const listJson = await listResp.json();
    const resourceNames = Array.isArray(listJson.resourceNames) ? listJson.resourceNames : [];

    const customers = resourceNames
      .map((rn) => {
        const customerId = typeof rn === 'string' && rn.includes('/') ? rn.split('/').pop() : rn;
        if (!customerId) return null;
        return {
          customerId,
          descriptiveName: customerId,
          currencyCode: null,
          isManager: null,
        };
      })
      .filter(Boolean);

    console.log('[GOOGLEADS_CUSTOMERS]', { workspaceId, userId: userKey, count: customers.length });
    return res.json({ customers });
  } catch (err) {
    const mapped = mapGoogleAdsCustomersError(err);
    const details = err?.details ? String(err.details).slice(0, 300) : null;
    if (mapped.httpStatus === 401) {
      console.warn('[GOOGLEADS_CUSTOMERS_AUTH_FAILED]', {
        workspaceId,
        userId: userKey,
        status: err?.status || 401,
        message: details,
      });
    } else {
      console.error('[GOOGLEADS_CUSTOMERS_ERROR]', {
        status: err?.status || null,
        message: err?.message,
      });
    }
    return res.status(mapped.httpStatus).json(mapped.body);
  }
});

router.get('/customers/clients', requireUser, async (req, res) => {
  const email = req.userEmail || req.user?.email || null;
  if (!email) return res.status(401).json({ error: 'Unauthorized' });
  const user = await getUserByEmail(email);
  const userKey = getUserKey(user);
  if (!userKey) return res.status(401).json({ error: 'Unauthorized' });

  const managerId = String(req.query?.managerId || '').trim();
  if (!managerId) {
    return res.status(400).json({ error: 'manager_id_required' });
  }

  let oauth2Client;
  try {
    oauth2Client = createOAuthClient();
  } catch (err) {
    logError(err);
    return res.status(500).json({ error: 'not_configured' });
  }

  const workspaceId = getWorkspaceId(req);
  const conn = await getConnectionByWorkspace(workspaceId, userKey);
  if (!conn || conn.status !== 'connected' || !conn.refreshToken) {
    return res.status(400).json({ error: 'not_connected' });
  }

  try {
    oauth2Client.setCredentials({ refresh_token: conn.refreshToken });
    const tokenInfo = await oauth2Client.getAccessToken();
    const accessToken = tokenInfo?.token;
    if (!accessToken) {
      return res.status(500).json({ error: 'googleads_api_error', message: 'missing_access_token' });
    }

    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': developerToken,
      'login-customer-id': managerId,
      'Content-Type': 'application/json',
    };

    const query = `
      SELECT
        customer_client.id,
        customer_client.descriptive_name,
        customer_client.manager,
        customer_client.level,
        customer_client.hidden
      FROM customer_client
      WHERE customer_client.level = 1
    `;

    const resp = await fetch(`${GOOGLE_ADS_API_BASE}/customers/${managerId}/googleAds:searchStream`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query }),
    });

    const respText = await resp.text();
    let payload = null;
    try {
      payload = JSON.parse(respText);
    } catch {
      payload = null;
    }

    if (!resp.ok) {
      const message =
        payload?.[0]?.error?.details?.[0]?.errors?.[0]?.errorCode?.authorizationError ||
        payload?.[0]?.error?.message ||
        `Google Ads API error (${resp.status})`;
      console.error('[GOOGLEADS_CLIENTS_ERROR]', { managerId, status: resp.status, message });
      return res.status(resp.status).json({ error: 'googleads_api_error', message });
    }

    const chunks = Array.isArray(payload) ? payload : [];
    const rows = chunks.flatMap((c) => (Array.isArray(c.results) ? c.results : []));

    const clients = rows
      .map((row) => {
        const cc = row.customerClient || row.customer_client || null;
        if (!cc) return null;
        const id = cc.id || cc.customerId || cc.customer_id || null;
        if (!id) return null;
        const customerId = String(id);
        const descriptiveName = cc.descriptiveName || cc.descriptive_name || customerId;
        const isManager = typeof cc.manager === 'boolean' ? cc.manager : Boolean(cc.managerCustomer || cc.manager_customer);
        const hidden = typeof cc.hidden === 'boolean' ? cc.hidden : Boolean(cc.hidden);
        return { customerId, descriptiveName, isManager, hidden };
      })
      .filter(Boolean);

    console.log('[GOOGLEADS_CLIENTS]', { workspaceId, userId: userKey, managerId, count: clients.length });
    return res.json({ clients });
  } catch (err) {
    console.error('[GOOGLEADS_CLIENTS_ERROR]', err?.message);
    return res.status(500).json({ error: 'googleads_api_error' });
  }
});

router.post('/customer', requireUser, async (req, res) => {
  const email = req.userEmail || req.user?.email || null;
  if (!email) return res.status(401).json({ error: 'Unauthorized' });
  const user = await getUserByEmail(email);
  const userKey = getUserKey(user);
  if (!userKey) return res.status(401).json({ error: 'Unauthorized' });
  const workspaceId = getWorkspaceId(req);
  const customerId = (req.body?.customerId || '').trim();
  const loginCustomerIdRaw = (req.body?.loginCustomerId || req.body?.login_customer_id || '').toString().trim();
  const loginCustomerId = loginCustomerIdRaw ? Number.parseInt(loginCustomerIdRaw, 10) : null;

  if (!customerId) {
    return res.status(400).json({ error: 'invalid_customer' });
  }

  await updateCustomerId({ workspaceId, userId: userKey, customerId, loginCustomerId: Number.isFinite(loginCustomerId) ? loginCustomerId : null });
  const record = await getConnectionByWorkspace(workspaceId, userKey);

  return res.json({
    connected: Boolean(record && record.status === 'connected' && record.refreshToken),
    customerId: customerId,
    loginCustomerId: record?.loginCustomerId || null,
    lastSyncAt: record?.updatedAt || null,
    status: record?.status || 'connected',
    error: null,
  });
});

router.get('/oauth/callback', async (req, res) => {
  const logPrefix = '[GOOGLEADS_OAUTH_CALLBACK]';
  const { code, state, error: oauthError } = req.query || {};
  const appBase = process.env.APP_BASE_URL || process.env.COOLBITS_PUBLIC_BASE_URL || 'https://coolbits.ai';
  const buildRedirect = (status, errorCode, message) => {
    const url = new URL('/chat', appBase);
    url.searchParams.set('connector', 'googleads');
    url.searchParams.set('status', status);
    if (errorCode) url.searchParams.set('error', errorCode);
    if (message) url.searchParams.set('message', message);
    return url.toString();
  };

  if (oauthError) {
    const oauthErrorDescription = typeof req.query?.error_description === 'string' ? req.query.error_description : null;
    console.warn(logPrefix, 'oauth error', { oauthError, oauthErrorDescription });
    return res.redirect(302, buildRedirect('error', String(oauthError), oauthErrorDescription));
  }

  if (!code) {
    console.error(logPrefix, 'missing code', req.query);
    return res.redirect(302, buildRedirect('error', 'missing_code'));
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
  const email = decoded?.e || decoded?.email || null;
  const workspaceId = decoded?.ws || decoded?.workspaceId || 'business';

  console.log(logPrefix, 'start', {
    hasCode: Boolean(code),
    hasState: Boolean(state),
    userId: userKey,
    workspaceId,
  });

  let oauth2Client;
  try {
    const base = getOAuthRedirectBase(req);
    const redirectUri = `${base}/api/connectors/googleads/oauth/callback`;
    console.log('[GOOGLEADS_OAUTH_CALLBACK]', {
      base,
      redirectUri,
      xfProto: req.headers['x-forwarded-proto'],
      xfHost: req.headers['x-forwarded-host'],
      cfVisitor: req.headers['cf-visitor'],
      host: req.headers.host,
    });
    oauth2Client = createOAuthClient(base);
  } catch (err) {
    console.error(logPrefix, 'config error', err?.message);
    return res.redirect(302, buildRedirect('error', 'not_configured'));
  }

  try {
    let tokens;
    try {
      const r = await oauth2Client.getToken(String(code));
      tokens = r?.tokens;
    } catch (err) {
      const { oauthError: tokenError, oauthErrorDescription } = getOauthErrorDetails(err);
      console.warn(logPrefix, 'token_exchange_failed', {
        oauthError: tokenError,
        oauthErrorDescription,
        status: err?.response?.status || null,
      });
      return res.redirect(302, buildRedirect('error', tokenError || 'token_exchange_failed', oauthErrorDescription));
    }
    const refreshToken = tokens.refresh_token || null;

    console.log(logPrefix, 'token_exchange', {
      userId: userKey,
      workspaceId,
      hasRefresh: Boolean(refreshToken),
      tokenType: tokens?.token_type || null,
      scope: tokens?.scope || null,
    });

    if (!refreshToken) {
      console.warn(logPrefix, 'no refresh token returned', { userKey });
    }

    if (userKey) {
      try {
        await upsertConnection({
          workspaceId,
          userId: userKey,
          customerId: null,
          refreshToken,
          status: refreshToken ? 'connected' : 'error',
          connectedAt: new Date(),
        });
      } catch (storageErr) {
        console.error(logPrefix, 'storage_failed', {
          name: storageErr?.name || null,
          code: storageErr?.code || null,
        });
        return res.redirect(302, buildRedirect('error', 'storage_failed'));
      }
    }

    console.log(logPrefix, 'stored connection', {
      userId: userKey,
      workspaceId,
      hasRefresh: Boolean(refreshToken),
    });

    return res.redirect(302, buildRedirect(refreshToken ? 'success' : 'error', refreshToken ? null : 'missing_refresh_token'));
  } catch (err) {
    const { oauthError: tokenError, oauthErrorDescription } = getOauthErrorDetails(err);
    console.error(logPrefix, 'callback_failed', {
      name: err?.name || null,
      code: err?.code || null,
      oauthError: tokenError,
      oauthErrorDescription,
    });
    return res.redirect(302, buildRedirect('error', tokenError || 'token_exchange_failed', oauthErrorDescription));
  }
});

router.post('/disconnect', requireUser, async (req, res) => {
  const email = req.userEmail || req.user?.email || null;
  if (!email) return res.status(401).json({ error: 'Unauthorized' });
  const user = await getUserByEmail(email);
  const userKey = getUserKey(user);
  if (!userKey) return res.status(401).json({ error: 'Unauthorized' });
  const workspaceId = getWorkspaceId(req);

  const record = await getConnectionByWorkspace(workspaceId, userKey);
  if (record?.refreshToken) {
    try {
      const client = createOAuthClient();
      client.setCredentials({ refresh_token: record.refreshToken });
      await client.revokeToken(record.refreshToken);
    } catch (err) {
      console.warn('[GOOGLEADS_DISCONNECT] revoke failed', err?.message);
    }
  }

  await markDisconnected({ workspaceId, userId: userKey });

  console.log('[GOOGLEADS_DISCONNECT] disconnected', { workspaceId, userId: userKey });

  return res.json({ ok: true });
});

router.get('/summary', requireUser, async (req, res) => {
  const email = req.userEmail || req.user?.email || null;
  if (!email) return res.status(401).json({ error: 'Unauthorized' });

  let oauth2Client;
  try {
    oauth2Client = createOAuthClient();
  } catch (err) {
    logError(err);
    return res.status(500).json({ error: 'not_configured' });
  }

  const user = await getUserByEmail(email);
  const userKey = getUserKey(user);
  if (!userKey) return res.status(401).json({ error: 'Unauthorized' });

  const workspaceId = req.query?.workspaceId || req.workspaceId || 'business';
  const dateRange = req.query?.dateRange || 'last_7_days';

  const conn = await getConnectionByWorkspace(workspaceId, userKey);
  if (!conn || conn.status !== 'connected' || !conn.refreshToken) {
    return res.status(400).json({ error: 'not_connected' });
  }

  if (!conn.customerId) {
    return res.status(400).json({ error: 'customer_not_set' });
  }

  try {
    oauth2Client.setCredentials({ refresh_token: conn.refreshToken });
    const tokenInfo = await oauth2Client.getAccessToken();
    const accessToken = tokenInfo?.token;
    if (!accessToken) {
      return res.status(500).json({ error: 'googleads_api_error' });
    }

    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': developerToken,
      'Content-Type': 'application/json',
    };
    if (conn.loginCustomerId) {
      headers['login-customer-id'] = String(conn.loginCustomerId);
    }

    const cid = conn.customerId;

    // Fetch metrics for last 7 days
    const query = `
      SELECT
        metrics.cost_micros,
        metrics.conversions,
        metrics.clicks,
        metrics.impressions,
        customer.currency_code
      FROM customer
      WHERE segments.date DURING LAST_7_DAYS
    `;

    const searchResp = await fetch(`${GOOGLE_ADS_API_BASE}/customers/${cid}/googleAds:searchStream`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query }),
    });
    if (!searchResp.ok) {
      throw new Error(`searchStream failed: ${searchResp.status}`);
    }
    const chunks = await searchResp.json();
    let costMicros = 0;
    let conversions = 0;
    let clicks = 0;
    let impressions = 0;
    let currency = 'USD';
    const rows = Array.isArray(chunks) ? chunks.flatMap((c) => c.results || []) : [];
    for (const row of rows) {
      const metrics = row.metrics || {};
      costMicros += Number(metrics.costMicros || metrics.cost_micros || 0);
      conversions += Number(metrics.conversions || 0);
      clicks += Number(metrics.clicks || 0);
      impressions += Number(metrics.impressions || 0);
      if (row.customer?.currencyCode || row.customer?.currency_code) {
        currency = row.customer.currencyCode || row.customer.currency_code;
      }
    }

    const cost = costMicros / 1_000_000;
    const cpa = cost / Math.max(conversions || 0, 1);
    const ctr = impressions > 0 ? clicks / impressions : 0;
    const conversionRate = clicks > 0 ? conversions / clicks : 0;
    const avgCpc = clicks > 0 ? cost / clicks : 0;

    console.log('[GOOGLEADS_SUMMARY]', { workspaceId, userId: userKey, cid, cost, conversions, clicks, impressions });

    return res.json({
      dateRange,
      currency,
      cost,
      conversions,
      clicks,
      impressions,
      cpa,
      ctr,
      conversionRate,
      avgCpc,
    });
  } catch (err) {
    console.error('[GOOGLEADS_SUMMARY_ERROR]', err?.message);
    return res.status(500).json({ error: 'googleads_api_error' });
  }
});

router.get('/report', requireUser, async (req, res) => {
  const email = req.userEmail || req.user?.email || null;
  if (!email) return res.status(401).json({ error: 'Unauthorized' });
  const user = await getUserByEmail(email);
  const userKey = getUserKey(user);
  if (!userKey) return res.status(401).json({ error: 'Unauthorized' });

  const workspaceId = getWorkspaceId(req);
  const rangeFrom = String(req.query?.from || '').trim();
  const rangeTo = String(req.query?.to || '').trim();
  const fromDate = parseUtcYmd(rangeFrom);
  const toDate = parseUtcYmd(rangeTo);
  if (!fromDate || !toDate || fromDate.getTime() > toDate.getTime()) {
    return res.status(400).json({ error: 'invalid_range' });
  }

  let oauth2Client;
  try {
    oauth2Client = createOAuthClient();
  } catch (err) {
    logError(err);
    return res.status(500).json({ error: 'not_configured' });
  }

  const conn = await getConnectionByWorkspace(workspaceId, userKey);
  if (!conn || conn.status !== 'connected' || !conn.refreshToken) {
    return res
      .status(400)
      .json({ error: conn && conn.status === 'connected' ? 'missing_refresh_token' : 'not_connected' });
  }
  if (!conn.customerId) {
    return res.status(400).json({ error: 'customer_not_set' });
  }

  const blocks = normalizeGoogleAdsBlocks(req.query?.blocks);
  const compareMode = normalizeCompareMode(req.query?.compareMode);
  if (!GOOGLEADS_REPORT_COMPARE_MODES.has(compareMode)) {
    return res.status(400).json({ error: 'invalid_compare_mode' });
  }
  const compareFrom = String(req.query?.compareFrom || '').trim();
  const compareTo = String(req.query?.compareTo || '').trim();

  let compare = null;
  if (compareMode === 'previous_period') {
    const computed = computePreviousRange(rangeFrom, rangeTo);
    if (!computed) {
      return res.status(400).json({ error: 'invalid_range' });
    }
    compare = { mode: compareMode, from: computed.from, to: computed.to };
  } else if (compareMode === 'previous_year') {
    const computed = computePreviousYearRange(rangeFrom, rangeTo);
    if (!computed) {
      return res.status(400).json({ error: 'invalid_range' });
    }
    compare = { mode: compareMode, from: computed.from, to: computed.to };
  } else if (compareMode === 'custom') {
    const compareFromDate = parseUtcYmd(compareFrom);
    const compareToDate = parseUtcYmd(compareTo);
    if (!compareFromDate || !compareToDate || compareFromDate.getTime() > compareToDate.getTime()) {
      return res.status(400).json({ error: 'invalid_compare_range' });
    }
    compare = { mode: compareMode, from: compareFrom, to: compareTo };
  }

  try {
    oauth2Client.setCredentials({ refresh_token: conn.refreshToken });
    const payload = await buildGoogleAdsReportV1({
      oauth2Client,
      customerId: conn.customerId,
      loginCustomerId: conn.loginCustomerId,
      rangeFrom,
      rangeTo,
      blocks,
      compare,
    });

    console.log('[GOOGLEADS_REPORT_V1]', {
      workspaceId,
      userId: userKey,
      customerId: conn.customerId,
      from: rangeFrom,
      to: rangeTo,
      blocks: blocks.join(','),
      compareMode: compare?.mode || 'none',
      status: 'ok',
    });

    return res.json(payload);
  } catch (err) {
    const classified = classifyGoogleAdsError(err);
    console.warn('[GOOGLEADS_REPORT_V1]', {
      workspaceId,
      userId: userKey,
      customerId: conn.customerId,
      from: rangeFrom,
      to: rangeTo,
      blocks: blocks.join(','),
      compareMode: compare?.mode || 'none',
      status: 'error',
      error: classified.error,
      ...classified.details,
    });
    return res.status(classified.httpStatus).json({ error: classified.error, message: classified.message });
  }
});

router.post('/snapshots', requireUser, async (req, res) => {
  const email = req.userEmail || req.user?.email || null;
  if (!email) return res.status(401).json({ error: 'Unauthorized' });
  const user = await getUserByEmail(email);
  const userKey = getUserKey(user);
  if (!userKey) return res.status(401).json({ error: 'Unauthorized' });

  const workspaceId = getWorkspaceId(req);
  const rangeFrom = String(req.body?.from || '').trim();
  const rangeTo = String(req.body?.to || '').trim();
  const fromDate = parseUtcYmd(rangeFrom);
  const toDate = parseUtcYmd(rangeTo);
  if (!fromDate || !toDate || fromDate.getTime() > toDate.getTime()) {
    return res.status(400).json({ error: 'invalid_range' });
  }

  const blocksRaw = req.body?.blocks;
  const blocksFromBody = Array.isArray(blocksRaw)
    ? Array.from(
        new Set(
          blocksRaw
            .map((b) => (b == null ? '' : String(b)).trim().toLowerCase())
            .filter(Boolean)
            .filter((b) => GOOGLEADS_REPORT_ALLOWED_BLOCKS.has(b)),
        ),
      )
    : normalizeGoogleAdsBlocks(typeof blocksRaw === 'string' ? blocksRaw : '');
  const blocks = blocksFromBody.length ? blocksFromBody : GOOGLEADS_REPORT_DEFAULT_BLOCKS.slice();

  const compareMode = normalizeCompareMode(req.body?.compareMode);
  const compareFrom = String(req.body?.compareFrom || '').trim();
  const compareTo = String(req.body?.compareTo || '').trim();

  let compare = null;
  if (compareMode === 'previous_period') {
    const computed = computePreviousRange(rangeFrom, rangeTo);
    if (!computed) {
      return res.status(400).json({ error: 'invalid_range' });
    }
    compare = { mode: compareMode, from: computed.from, to: computed.to };
  } else if (compareMode === 'previous_year') {
    const computed = computePreviousYearRange(rangeFrom, rangeTo);
    if (!computed) {
      return res.status(400).json({ error: 'invalid_range' });
    }
    compare = { mode: compareMode, from: computed.from, to: computed.to };
  } else if (compareMode === 'custom') {
    const compareFromDate = parseUtcYmd(compareFrom);
    const compareToDate = parseUtcYmd(compareTo);
    if (!compareFromDate || !compareToDate || compareFromDate.getTime() > compareToDate.getTime()) {
      return res.status(400).json({ error: 'invalid_compare_range' });
    }
    compare = { mode: compareMode, from: compareFrom, to: compareTo };
  }

  const labelRaw = typeof req.body?.label === 'string' ? req.body.label : null;
  const label = labelRaw && labelRaw.trim() ? labelRaw.trim().slice(0, 120) : null;

  let oauth2Client;
  try {
    oauth2Client = createOAuthClient();
  } catch (err) {
    logError(err);
    return res.status(500).json({ error: 'not_configured' });
  }

  const conn = await getConnectionByWorkspace(workspaceId, userKey);
  if (!conn || conn.status !== 'connected' || !conn.refreshToken) {
    return res
      .status(400)
      .json({ error: conn && conn.status === 'connected' ? 'missing_refresh_token' : 'not_connected' });
  }
  if (!conn.customerId) {
    return res.status(400).json({ error: 'customer_not_set' });
  }

  let payload = null;
  try {
    oauth2Client.setCredentials({ refresh_token: conn.refreshToken });
    payload = await buildGoogleAdsReportV1({
      oauth2Client,
      customerId: conn.customerId,
      loginCustomerId: conn.loginCustomerId,
      rangeFrom,
      rangeTo,
      blocks,
      compare,
    });
  } catch (err) {
    const classified = classifyGoogleAdsError(err);
    console.warn('[GOOGLEADS_SNAPSHOT_CREATE]', {
      workspaceId,
      userId: userKey,
      customerId: conn.customerId,
      from: rangeFrom,
      to: rangeTo,
      compareMode: compareMode,
      status: 'error',
      error: classified.error,
      ...classified.details,
    });
    return res.status(classified.httpStatus).json({ error: classified.error, message: classified.message });
  }

  try {
    const snapshot = await createSnapshot({
      workspaceId,
      userId: userKey,
      customerId: conn.customerId,
      rangeFrom,
      rangeTo,
      blocks,
      compareMode: compare?.mode || null,
      compareFrom: compare?.from || null,
      compareTo: compare?.to || null,
      label,
      payload,
    });

    console.log('[GOOGLEADS_SNAPSHOT_CREATE]', {
      workspaceId,
      userId: userKey,
      customerId: conn.customerId,
      from: rangeFrom,
      to: rangeTo,
      blocks: blocks.join(','),
      compareMode: compare?.mode || 'none',
      snapshotId: snapshot?.id || null,
      status: snapshot ? 'ok' : 'error',
    });

    if (!snapshot) {
      return res.status(500).json({ error: 'snapshot_store_failed' });
    }

    return res.json({ snapshotId: snapshot.id, createdAt: snapshot.createdAt });
  } catch (err) {
    const sanitized = sanitizeErrorForLog(err);
    console.warn('[GOOGLEADS_SNAPSHOT_STORE_ERROR]', {
      workspaceId,
      userId: userKey,
      customerId: conn.customerId,
      from: rangeFrom,
      to: rangeTo,
      blocks: blocks.join(','),
      compareMode: compare?.mode || 'none',
      ...sanitized,
    });
    const errorCode = isPgError(err) ? 'snapshot_store_failed' : 'snapshot_store_failed';
    return res.status(500).json({ error: errorCode });
  }
});

router.get('/snapshots', requireUser, async (req, res) => {
  const email = req.userEmail || req.user?.email || null;
  if (!email) return res.status(401).json({ error: 'Unauthorized' });
  const user = await getUserByEmail(email);
  const userKey = getUserKey(user);
  if (!userKey) return res.status(401).json({ error: 'Unauthorized' });

  const workspaceId = getWorkspaceId(req);
  const limit = Number(req.query?.limit) || 20;

  const conn = await getConnectionByWorkspace(workspaceId, userKey);
  if (!conn || conn.status !== 'connected' || !conn.refreshToken) {
    return res
      .status(400)
      .json({ error: conn && conn.status === 'connected' ? 'missing_refresh_token' : 'not_connected' });
  }
  if (!conn.customerId) {
    return res.status(400).json({ error: 'customer_not_set' });
  }

  try {
    const rows = await listSnapshots({ workspaceId, userId: userKey, customerId: conn.customerId, limit });
    const snapshots = rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      label: row.label || null,
      from: row.range_from,
      to: row.range_to,
      blocks: Array.isArray(row.blocks) ? row.blocks : [],
      compareMode: row.compare_mode || null,
      compareFrom: row.compare_from,
      compareTo: row.compare_to,
    }));
    return res.json({ snapshots });
  } catch (err) {
    const sanitized = sanitizeErrorForLog(err);
    console.warn('[GOOGLEADS_SNAPSHOTS_LIST_ERROR]', {
      workspaceId,
      userId: userKey,
      customerId: conn.customerId,
      ...sanitized,
    });
    return res.status(500).json({ error: 'snapshot_list_failed' });
  }
});

router.get('/snapshots/:id', requireUser, async (req, res) => {
  const email = req.userEmail || req.user?.email || null;
  if (!email) return res.status(401).json({ error: 'Unauthorized' });
  const user = await getUserByEmail(email);
  const userKey = getUserKey(user);
  if (!userKey) return res.status(401).json({ error: 'Unauthorized' });

  const workspaceId = getWorkspaceId(req);
  const rawId = String(req.params?.id || '').trim();
  const id = Number(rawId);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid_snapshot_id' });
  }

  try {
    const snapshot = await getSnapshotById({ workspaceId, userId: userKey, id });
    if (!snapshot) {
      return res.status(404).json({ error: 'snapshot_not_found' });
    }
    return res.json({
      snapshot: {
        id: snapshot.id,
        createdAt: snapshot.created_at,
        label: snapshot.label || null,
        from: snapshot.range_from,
        to: snapshot.range_to,
        blocks: Array.isArray(snapshot.blocks) ? snapshot.blocks : [],
        compareMode: snapshot.compare_mode || null,
        compareFrom: snapshot.compare_from,
        compareTo: snapshot.compare_to,
        payload: snapshot.payload,
      },
    });
  } catch (err) {
    const sanitized = sanitizeErrorForLog(err);
    console.warn('[GOOGLEADS_SNAPSHOT_GET_ERROR]', {
      workspaceId,
      userId: userKey,
      id,
      ...sanitized,
    });
    return res.status(500).json({ error: 'snapshot_get_failed' });
  }
});

export default router;
