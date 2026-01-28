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
import { createSnapshot, getSnapshotById, listSnapshots } from '../repos/ga4SnapshotsRepo.js';

const router = express.Router();
console.log('[GA4_ROUTER_LOADED]');

const GA4_SCOPES = ['https://www.googleapis.com/auth/analytics.readonly'];

function getUserKey(user) {
  return user && user.id ? String(user.id) : null;
}

function getWorkspaceId(req) {
  const candidate = req.workspaceId || null;
  return candidate ? String(candidate).trim() : null;
}

function createOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const base =
    process.env.GA4_OAUTH_REDIRECT_BASE ||
    process.env.GOOGLE_ADS_OAUTH_REDIRECT_BASE ||
    process.env.GOOGLE_OAUTH_REDIRECT_BASE; // reuse shared base if set

  if (!clientId || !clientSecret || !base) {
    const msg = 'GA4 OAuth env vars missing';
    console.warn('[GA4_CONFIG_MISSING]', { clientId: !!clientId, clientSecret: !!clientSecret, base: !!base });
    throw new Error(msg);
  }

  const redirectUri = `${base.replace(/\/$/, '')}/api/connectors/ga4/oauth/callback`;
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function buildAppRedirect(status, errorCode, message) {
  const appBase = process.env.APP_BASE_URL || process.env.COOLBITS_PUBLIC_BASE_URL || 'https://coolbits.ai';
  const url = new URL('/chat', appBase);
  url.searchParams.set('connector', 'ga4');
  url.searchParams.set('status', status);
  if (errorCode) url.searchParams.set('error', errorCode);
  if (message) url.searchParams.set('message', String(message).slice(0, 280));
  return url.toString();
}

function getOauthErrorDetails(err) {
  const data = err?.response?.data;
  const oauthError = typeof data?.error === 'string' ? data.error : null;
  const oauthErrorDescription = typeof data?.error_description === 'string' ? data.error_description : null;
  return { oauthError, oauthErrorDescription };
}

function safeLogValue(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\s+/g, ' ').slice(0, 220);
}

function extractGoogleApiMessage(err) {
  const data = err?.response?.data;
  if (!data) return null;
  if (typeof data?.error?.message === 'string') return data.error.message;
  if (typeof data?.error_description === 'string') return data.error_description;
  if (typeof data?.message === 'string') return data.message;
  return null;
}

function extractGoogleApiStatus(err) {
  const data = err?.response?.data;
  if (typeof data?.error?.status === 'string') return data.error.status;
  return null;
}

function extractGoogleApiReason(err) {
  const errors = Array.isArray(err?.errors) ? err.errors : [];
  const reason = errors.find((e) => e && typeof e.reason === 'string')?.reason;
  if (reason) return reason;
  const details = err?.response?.data?.error?.details;
  if (Array.isArray(details)) {
    for (const detail of details) {
      const detailErrors = Array.isArray(detail?.errors) ? detail.errors : [];
      const detailReason = detailErrors.find((e) => e && typeof e.reason === 'string')?.reason;
      if (detailReason) return detailReason;
      const type = typeof detail?.['@type'] === 'string' ? detail['@type'] : '';
      if (type.includes('ErrorInfo') && typeof detail?.reason === 'string') {
        return detail.reason;
      }
    }
  }
  return null;
}

function classifyGa4GoogleError(err) {
  const statusCode = Number(err?.response?.status) || null;
  const { oauthError, oauthErrorDescription } = getOauthErrorDetails(err);
  const rawMessage = extractGoogleApiMessage(err) || err?.message || null;
  const message = safeLogValue(rawMessage);
  const apiStatus = extractGoogleApiStatus(err);
  const reason = extractGoogleApiReason(err);

  const lowered = (message || '').toLowerCase();
  const isApiNotEnabled =
    reason === 'accessNotConfigured' ||
    reason === 'SERVICE_DISABLED' ||
    lowered.includes('accessnotconfigured') ||
    lowered.includes('api has not been used in project') ||
    lowered.includes('has not been used in project') ||
    lowered.includes('api is disabled') ||
    lowered.includes('service disabled');
  const isQuotaExceeded =
    statusCode === 429 ||
    apiStatus === 'RESOURCE_EXHAUSTED' ||
    reason === 'quotaExceeded' ||
    reason === 'dailyLimitExceeded' ||
    lowered.includes('quota') ||
    lowered.includes('resource exhausted');
  const isRateLimited =
    statusCode === 429 ||
    apiStatus === 'RESOURCE_EXHAUSTED' ||
    reason === 'rateLimitExceeded' ||
    reason === 'userRateLimitExceeded' ||
    lowered.includes('rate limit') ||
    lowered.includes('too many requests');

  if (oauthError === 'invalid_grant' || lowered.includes('invalid_grant')) {
    return {
      httpStatus: 400,
      error: 'invalid_grant',
      message: oauthErrorDescription || 'Google authorization expired. Disconnect and reconnect.',
      details: { statusCode, apiStatus, reason },
    };
  }

  if (isRateLimited) {
    return {
      httpStatus: 429,
      error: isQuotaExceeded ? 'quota_exceeded' : 'rate_limited',
      message: isQuotaExceeded
        ? 'Google Analytics API quota exceeded. Please try again later.'
        : 'Google Analytics API rate limited. Please retry in a moment.',
      details: { statusCode, apiStatus, reason },
    };
  }

  if (statusCode === 403 || apiStatus === 'PERMISSION_DENIED') {
    if (isApiNotEnabled) {
      return {
        httpStatus: 403,
        error: 'api_not_enabled',
        message: 'Google Analytics API is not enabled for this project.',
        details: { statusCode, apiStatus, reason },
      };
    }
    return {
      httpStatus: 403,
      error: 'insufficient_permissions',
      message: 'The connected Google account does not have access to this GA4 data.',
      details: { statusCode, apiStatus, reason },
    };
  }

  if (statusCode === 401 || apiStatus === 'UNAUTHENTICATED') {
    return {
      httpStatus: 400,
      error: 'invalid_grant',
      message: 'Google authorization expired. Disconnect and reconnect.',
      details: { statusCode, apiStatus, reason },
    };
  }

  return {
    httpStatus: 500,
    error: 'ga4_api_error',
    message: message || 'GA4 request failed.',
    details: { statusCode, apiStatus, reason },
  };
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

function formatGa4DateDimension(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
  if (isValidYmd(raw)) return raw;
  return null;
}

function parseMetricNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function buildMetricIndex(report) {
  const headers = Array.isArray(report?.data?.metricHeaders) ? report.data.metricHeaders : [];
  const map = {};
  headers.forEach((header, idx) => {
    const name = header && typeof header.name === 'string' ? header.name : null;
    if (name) {
      map[name] = idx;
    }
  });
  return map;
}

const GA4_REPORT_DEFAULT_BLOCKS = ['overview', 'series', 'pages', 'sources', 'events'];
const GA4_REPORT_OPTIONAL_BLOCKS = ['geo', 'device'];
const GA4_REPORT_ALLOWED_BLOCKS = new Set([...GA4_REPORT_DEFAULT_BLOCKS, ...GA4_REPORT_OPTIONAL_BLOCKS]);

function normalizeGa4Blocks(value) {
  if (typeof value !== 'string') {
    return GA4_REPORT_DEFAULT_BLOCKS.slice();
  }
  const raw = value.trim();
  if (!raw) {
    return GA4_REPORT_DEFAULT_BLOCKS.slice();
  }
  const blocks = raw
    .split(',')
    .map((b) => b.trim().toLowerCase())
    .filter(Boolean)
    .filter((b) => GA4_REPORT_ALLOWED_BLOCKS.has(b));
  const unique = Array.from(new Set(blocks));
  return unique.length ? unique : GA4_REPORT_DEFAULT_BLOCKS.slice();
}

function normalizeCompareMode(value) {
  const raw = (value || '').toString().trim().toLowerCase();
  if (raw === 'previous_period') return 'previous_period';
  if (raw === 'previous_year') return 'previous_year';
  if (raw === 'custom') return 'custom';
  return 'none';
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

async function buildGa4ReportV1({
  oauth2Client,
  propertyId,
  rangeFrom,
  rangeTo,
  blocks,
  compare,
}) {
  const analyticsdata = google.analyticsdata('v1beta');
  const limiter = createConcurrencyLimiter(3);

  const runOptional = (requestBodyBase, requiredMetrics, optionalMetrics) =>
    limiter(() =>
      runGa4ReportWithOptionalMetrics({
        analyticsdata,
        oauth2Client,
        propertyId,
        requestBodyBase,
        requiredMetrics,
        optionalMetrics,
      }),
    );

  const runReport = (requestBody) =>
    limiter(() =>
      analyticsdata.properties.runReport({
        auth: oauth2Client,
        property: `properties/${propertyId}`,
        requestBody,
      }),
    );

  const dateRangesPrimary = [{ startDate: rangeFrom, endDate: rangeTo }];
  const dateRangesCompare = compare ? [{ startDate: compare.from, endDate: compare.to }] : null;

  const fetchOverview = async (dateRanges) => {
    const result = await runOptional(
      { dateRanges },
      ['totalUsers', 'sessions'],
      ['conversions', 'purchaseRevenue'],
    );
    const row = Array.isArray(result.report?.data?.rows) ? result.report.data.rows[0] : null;
    const values = Array.isArray(row?.metricValues) ? row.metricValues : [];
    const metricIndex = buildMetricIndex(result.report);
    return {
      users: parseMetricNumber(values[metricIndex.totalUsers]?.value),
      sessions: parseMetricNumber(values[metricIndex.sessions]?.value),
      conversions:
        typeof metricIndex.conversions === 'number'
          ? parseMetricNumber(values[metricIndex.conversions]?.value)
          : null,
      revenue:
        typeof metricIndex.purchaseRevenue === 'number'
          ? parseMetricNumber(values[metricIndex.purchaseRevenue]?.value)
          : null,
    };
  };

  const fetchSeries = async (dateRanges) => {
    const result = await runOptional(
      {
        dateRanges,
        dimensions: [{ name: 'date' }],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
      },
      ['sessions'],
      ['conversions'],
    );
    const rows = Array.isArray(result.report?.data?.rows) ? result.report.data.rows : [];
    const metricIndex = buildMetricIndex(result.report);
    return rows
      .map((row) => {
        const dim = Array.isArray(row?.dimensionValues) ? row.dimensionValues : [];
        const met = Array.isArray(row?.metricValues) ? row.metricValues : [];
        const date = formatGa4DateDimension(dim[0]?.value);
        if (!date) return null;
        return {
          date,
          sessions: parseMetricNumber(met[metricIndex.sessions]?.value),
          conversions:
            typeof metricIndex.conversions === 'number'
              ? parseMetricNumber(met[metricIndex.conversions]?.value)
              : null,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.date.localeCompare(b.date));
  };

  const fetchPages = async (dateRanges) => {
    const result = await runOptional(
      {
        dateRanges,
        dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: '10',
      },
      ['sessions'],
      ['conversions'],
    );
    const rows = Array.isArray(result.report?.data?.rows) ? result.report.data.rows : [];
    const metricIndex = buildMetricIndex(result.report);
    return rows
      .map((row) => {
        const dim = Array.isArray(row?.dimensionValues) ? row.dimensionValues : [];
        const met = Array.isArray(row?.metricValues) ? row.metricValues : [];
        const page = typeof dim[0]?.value === 'string' ? dim[0].value : '';
        const title = typeof dim[1]?.value === 'string' ? dim[1].value : '';
        if (!page && !title) return null;
        return {
          page,
          title,
          sessions: parseMetricNumber(met[metricIndex.sessions]?.value),
          conversions:
            typeof metricIndex.conversions === 'number'
              ? parseMetricNumber(met[metricIndex.conversions]?.value)
              : null,
        };
      })
      .filter(Boolean);
  };

  const fetchSources = async (dateRanges) => {
    const result = await runOptional(
      {
        dateRanges,
        dimensions: [{ name: 'sessionSourceMedium' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: '10',
      },
      ['sessions'],
      ['conversions'],
    );
    const rows = Array.isArray(result.report?.data?.rows) ? result.report.data.rows : [];
    const metricIndex = buildMetricIndex(result.report);
    return rows
      .map((row) => {
        const dim = Array.isArray(row?.dimensionValues) ? row.dimensionValues : [];
        const met = Array.isArray(row?.metricValues) ? row.metricValues : [];
        const sourceMedium = typeof dim[0]?.value === 'string' ? dim[0].value : '';
        if (!sourceMedium) return null;
        return {
          sourceMedium,
          sessions: parseMetricNumber(met[metricIndex.sessions]?.value),
          conversions:
            typeof metricIndex.conversions === 'number'
              ? parseMetricNumber(met[metricIndex.conversions]?.value)
              : null,
        };
      })
      .filter(Boolean);
  };

  const fetchEvents = async (dateRanges) => {
    const report = await runReport({
      dateRanges,
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
      limit: '10',
    });
    const rows = Array.isArray(report.data?.rows) ? report.data.rows : [];
    return rows
      .map((row) => {
        const dim = Array.isArray(row?.dimensionValues) ? row.dimensionValues : [];
        const met = Array.isArray(row?.metricValues) ? row.metricValues : [];
        const eventName = typeof dim[0]?.value === 'string' ? dim[0].value : '';
        if (!eventName) return null;
        return {
          eventName,
          count: parseMetricNumber(met[0]?.value),
        };
      })
      .filter(Boolean);
  };

  const fetchGeoCountries = async (dateRanges) => {
    const result = await runOptional(
      {
        dateRanges,
        dimensions: [{ name: 'country' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: '10',
      },
      ['sessions'],
      ['conversions'],
    );
    const rows = Array.isArray(result.report?.data?.rows) ? result.report.data.rows : [];
    const metricIndex = buildMetricIndex(result.report);
    return rows
      .map((row) => {
        const dim = Array.isArray(row?.dimensionValues) ? row.dimensionValues : [];
        const met = Array.isArray(row?.metricValues) ? row.metricValues : [];
        const country = typeof dim[0]?.value === 'string' ? dim[0].value : '';
        if (!country) return null;
        return {
          country,
          sessions: parseMetricNumber(met[metricIndex.sessions]?.value),
          conversions:
            typeof metricIndex.conversions === 'number'
              ? parseMetricNumber(met[metricIndex.conversions]?.value)
              : null,
        };
      })
      .filter(Boolean);
  };

  const fetchGeoCities = async (dateRanges) => {
    const result = await runOptional(
      {
        dateRanges,
        dimensions: [{ name: 'city' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: '10',
      },
      ['sessions'],
      ['conversions'],
    );
    const rows = Array.isArray(result.report?.data?.rows) ? result.report.data.rows : [];
    const metricIndex = buildMetricIndex(result.report);
    return rows
      .map((row) => {
        const dim = Array.isArray(row?.dimensionValues) ? row.dimensionValues : [];
        const met = Array.isArray(row?.metricValues) ? row.metricValues : [];
        const city = typeof dim[0]?.value === 'string' ? dim[0].value : '';
        if (!city) return null;
        return {
          city,
          sessions: parseMetricNumber(met[metricIndex.sessions]?.value),
          conversions:
            typeof metricIndex.conversions === 'number'
              ? parseMetricNumber(met[metricIndex.conversions]?.value)
              : null,
        };
      })
      .filter(Boolean);
  };

  const fetchDeviceCategory = async (dateRanges) => {
    const result = await runOptional(
      {
        dateRanges,
        dimensions: [{ name: 'deviceCategory' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: '10',
      },
      ['sessions'],
      ['conversions'],
    );
    const rows = Array.isArray(result.report?.data?.rows) ? result.report.data.rows : [];
    const metricIndex = buildMetricIndex(result.report);
    return rows
      .map((row) => {
        const dim = Array.isArray(row?.dimensionValues) ? row.dimensionValues : [];
        const met = Array.isArray(row?.metricValues) ? row.metricValues : [];
        const deviceCategory = typeof dim[0]?.value === 'string' ? dim[0].value : '';
        if (!deviceCategory) return null;
        return {
          deviceCategory,
          sessions: parseMetricNumber(met[metricIndex.sessions]?.value),
          conversions:
            typeof metricIndex.conversions === 'number'
              ? parseMetricNumber(met[metricIndex.conversions]?.value)
              : null,
        };
      })
      .filter(Boolean);
  };

  const fetchOs = async (dateRanges) => {
    const result = await runOptional(
      {
        dateRanges,
        dimensions: [{ name: 'operatingSystem' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: '10',
      },
      ['sessions'],
      ['conversions'],
    );
    const rows = Array.isArray(result.report?.data?.rows) ? result.report.data.rows : [];
    const metricIndex = buildMetricIndex(result.report);
    return rows
      .map((row) => {
        const dim = Array.isArray(row?.dimensionValues) ? row.dimensionValues : [];
        const met = Array.isArray(row?.metricValues) ? row.metricValues : [];
        const os = typeof dim[0]?.value === 'string' ? dim[0].value : '';
        if (!os) return null;
        return {
          os,
          sessions: parseMetricNumber(met[metricIndex.sessions]?.value),
          conversions:
            typeof metricIndex.conversions === 'number'
              ? parseMetricNumber(met[metricIndex.conversions]?.value)
              : null,
        };
      })
      .filter(Boolean);
  };

  const data = {};

  const tasks = [];

  if (blocks.includes('overview')) {
    tasks.push(
      (async () => {
        const [current, previous] = await Promise.all([
          fetchOverview(dateRangesPrimary),
          dateRangesCompare ? fetchOverview(dateRangesCompare) : Promise.resolve(null),
        ]);
        const overview = { ...current };
        if (compare && previous) {
          overview.deltas = {
            users: percentChange(current.users, previous.users),
            sessions: percentChange(current.sessions, previous.sessions),
            conversions:
              current.conversions == null || previous.conversions == null
                ? null
                : percentChange(current.conversions, previous.conversions),
            revenue:
              current.revenue == null || previous.revenue == null
                ? null
                : percentChange(current.revenue, previous.revenue),
          };
        }
        data.overview = overview;
      })(),
    );
  }

  if (blocks.includes('series')) {
    tasks.push(
      (async () => {
        const [daily, compareDaily] = await Promise.all([
          fetchSeries(dateRangesPrimary),
          dateRangesCompare ? fetchSeries(dateRangesCompare) : Promise.resolve(null),
        ]);
        const series = { daily };
        if (compare && Array.isArray(compareDaily)) {
          series.compareDaily = compareDaily;
        }
        data.series = series;
      })(),
    );
  }

  if (blocks.includes('pages')) {
    tasks.push(
      (async () => {
        const [rows, compareRows] = await Promise.all([
          fetchPages(dateRangesPrimary),
          dateRangesCompare ? fetchPages(dateRangesCompare) : Promise.resolve(null),
        ]);
        const pages = { rows };
        if (compare && Array.isArray(compareRows)) {
          pages.compareRows = compareRows;
        }
        data.pages = pages;
      })(),
    );
  }

  if (blocks.includes('sources')) {
    tasks.push(
      (async () => {
        const [rows, compareRows] = await Promise.all([
          fetchSources(dateRangesPrimary),
          dateRangesCompare ? fetchSources(dateRangesCompare) : Promise.resolve(null),
        ]);
        const sources = { rows };
        if (compare && Array.isArray(compareRows)) {
          sources.compareRows = compareRows;
        }
        data.sources = sources;
      })(),
    );
  }

  if (blocks.includes('events')) {
    tasks.push(
      (async () => {
        const [rows, compareRows] = await Promise.all([
          fetchEvents(dateRangesPrimary),
          dateRangesCompare ? fetchEvents(dateRangesCompare) : Promise.resolve(null),
        ]);
        const events = { rows };
        if (compare && Array.isArray(compareRows)) {
          events.compareRows = compareRows;
        }
        data.events = events;
      })(),
    );
  }

  if (blocks.includes('geo')) {
    tasks.push(
      (async () => {
        const [countries, cities, compareCountries, compareCities] = await Promise.all([
          fetchGeoCountries(dateRangesPrimary),
          fetchGeoCities(dateRangesPrimary),
          dateRangesCompare ? fetchGeoCountries(dateRangesCompare) : Promise.resolve(null),
          dateRangesCompare ? fetchGeoCities(dateRangesCompare) : Promise.resolve(null),
        ]);
        const geo = { countries, cities };
        if (compare && Array.isArray(compareCountries)) {
          geo.compareCountries = compareCountries;
        }
        if (compare && Array.isArray(compareCities)) {
          geo.compareCities = compareCities;
        }
        data.geo = geo;
      })(),
    );
  }

  if (blocks.includes('device')) {
    tasks.push(
      (async () => {
        const [deviceCategory, os, compareDeviceCategory, compareOs] = await Promise.all([
          fetchDeviceCategory(dateRangesPrimary),
          fetchOs(dateRangesPrimary),
          dateRangesCompare ? fetchDeviceCategory(dateRangesCompare) : Promise.resolve(null),
          dateRangesCompare ? fetchOs(dateRangesCompare) : Promise.resolve(null),
        ]);
        const device = { deviceCategory, os };
        if (compare && Array.isArray(compareDeviceCategory)) {
          device.compareDeviceCategory = compareDeviceCategory;
        }
        if (compare && Array.isArray(compareOs)) {
          device.compareOs = compareOs;
        }
        data.device = device;
      })(),
    );
  }

  await Promise.all(tasks);

  return {
    range: { from: rangeFrom, to: rangeTo },
    compare: compare ? { mode: compare.mode, from: compare.from, to: compare.to } : null,
    blocks: blocks.slice(),
    data,
  };
}

async function runGa4ReportWithOptionalMetrics({
  analyticsdata,
  oauth2Client,
  propertyId,
  requestBodyBase,
  requiredMetrics = [],
  optionalMetrics = [],
}) {
  const originalOptional = optionalMetrics.slice();
  const activeOptional = optionalMetrics.slice();

  const tryRun = async (metrics) =>
    analyticsdata.properties.runReport({
      auth: oauth2Client,
      property: `properties/${propertyId}`,
      requestBody: {
        ...requestBodyBase,
        metrics: metrics.map((name) => ({ name })),
      },
    });

  for (let attempt = 0; attempt <= originalOptional.length; attempt += 1) {
    try {
      const metrics = requiredMetrics.concat(activeOptional);
      const report = await tryRun(metrics);
      const missing = originalOptional.filter((m) => !activeOptional.includes(m));
      return { report, missingOptionalMetrics: missing };
    } catch (err) {
      if (!activeOptional.length) {
        throw err;
      }
      const msg = (extractGoogleApiMessage(err) || err?.message || '').toString().toLowerCase();
      const matchIdx = activeOptional.findIndex((m) => msg.includes(m.toLowerCase()));
      if (matchIdx >= 0) {
        activeOptional.splice(matchIdx, 1);
      } else {
        activeOptional.pop();
      }
    }
  }

  const report = await tryRun(requiredMetrics);
  return { report, missingOptionalMetrics: originalOptional.slice() };
}

async function buildGa4DashboardReportLegacy({
  oauth2Client,
  propertyId,
  rangeFrom,
  rangeTo,
  compareMode,
}) {
  const analyticsdata = google.analyticsdata('v1beta');
  const dateRanges = [{ startDate: rangeFrom, endDate: rangeTo }];
  const compareRange = compareMode === 'prev' ? computePreviousRange(rangeFrom, rangeTo) : null;

  const totalsPromise = runGa4ReportWithOptionalMetrics({
    analyticsdata,
    oauth2Client,
    propertyId,
    requestBodyBase: { dateRanges },
    requiredMetrics: ['totalUsers', 'sessions'],
    optionalMetrics: ['conversions', 'purchaseRevenue'],
  });

  const dailyPromise = runGa4ReportWithOptionalMetrics({
    analyticsdata,
    oauth2Client,
    propertyId,
    requestBodyBase: {
      dateRanges,
      dimensions: [{ name: 'date' }],
      orderBys: [{ dimension: { dimensionName: 'date' } }],
    },
    requiredMetrics: ['sessions'],
    optionalMetrics: ['conversions'],
  });

  const pagesPromise = runGa4ReportWithOptionalMetrics({
    analyticsdata,
    oauth2Client,
    propertyId,
    requestBodyBase: {
      dateRanges,
      dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: '10',
    },
    requiredMetrics: ['sessions'],
    optionalMetrics: ['conversions'],
  });

  const sourceMediumPromise = runGa4ReportWithOptionalMetrics({
    analyticsdata,
    oauth2Client,
    propertyId,
    requestBodyBase: {
      dateRanges,
      dimensions: [{ name: 'sessionSourceMedium' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: '10',
    },
    requiredMetrics: ['sessions'],
    optionalMetrics: ['conversions'],
  });

  const eventsPromise = analyticsdata.properties.runReport({
    auth: oauth2Client,
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges,
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
      limit: '10',
    },
  });

  const [totalsResult, dailyResult, pagesResult, sourceMediumResult, eventsReport] = await Promise.all([
    totalsPromise,
    dailyPromise,
    pagesPromise,
    sourceMediumPromise,
    eventsPromise,
  ]);

  const totalsRow = Array.isArray(totalsResult.report?.data?.rows) ? totalsResult.report.data.rows[0] : null;
  const totalsValues = Array.isArray(totalsRow?.metricValues) ? totalsRow.metricValues : [];
  const totalsMetricIndex = buildMetricIndex(totalsResult.report);

  const totals = {
    users: parseMetricNumber(totalsValues[totalsMetricIndex.totalUsers]?.value),
    sessions: parseMetricNumber(totalsValues[totalsMetricIndex.sessions]?.value),
    conversions:
      typeof totalsMetricIndex.conversions === 'number'
        ? parseMetricNumber(totalsValues[totalsMetricIndex.conversions]?.value)
        : null,
    revenue:
      typeof totalsMetricIndex.purchaseRevenue === 'number'
        ? parseMetricNumber(totalsValues[totalsMetricIndex.purchaseRevenue]?.value)
        : null,
  };

  const dailyRows = Array.isArray(dailyResult.report?.data?.rows) ? dailyResult.report.data.rows : [];
  const dailyMetricIndex = buildMetricIndex(dailyResult.report);
  const daily = dailyRows
    .map((row) => {
      const dim = Array.isArray(row?.dimensionValues) ? row.dimensionValues : [];
      const met = Array.isArray(row?.metricValues) ? row.metricValues : [];
      const date = formatGa4DateDimension(dim[0]?.value);
      if (!date) return null;
      return {
        date,
        sessions: parseMetricNumber(met[dailyMetricIndex.sessions]?.value),
        conversions:
          typeof dailyMetricIndex.conversions === 'number'
            ? parseMetricNumber(met[dailyMetricIndex.conversions]?.value)
            : null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));

  const pagesRows = Array.isArray(pagesResult.report?.data?.rows) ? pagesResult.report.data.rows : [];
  const pagesMetricIndex = buildMetricIndex(pagesResult.report);
  const pages = pagesRows
    .map((row) => {
      const dim = Array.isArray(row?.dimensionValues) ? row.dimensionValues : [];
      const met = Array.isArray(row?.metricValues) ? row.metricValues : [];
      const page = typeof dim[0]?.value === 'string' ? dim[0].value : '';
      const title = typeof dim[1]?.value === 'string' ? dim[1].value : '';
      if (!page && !title) return null;
      return {
        page,
        title,
        sessions: parseMetricNumber(met[pagesMetricIndex.sessions]?.value),
        conversions:
          typeof pagesMetricIndex.conversions === 'number'
            ? parseMetricNumber(met[pagesMetricIndex.conversions]?.value)
            : null,
      };
    })
    .filter(Boolean);

  const sourceRows = Array.isArray(sourceMediumResult.report?.data?.rows) ? sourceMediumResult.report.data.rows : [];
  const sourceMetricIndex = buildMetricIndex(sourceMediumResult.report);
  const sourceMedium = sourceRows
    .map((row) => {
      const dim = Array.isArray(row?.dimensionValues) ? row.dimensionValues : [];
      const met = Array.isArray(row?.metricValues) ? row.metricValues : [];
      const source = typeof dim[0]?.value === 'string' ? dim[0].value : '';
      if (!source) return null;
      return {
        sourceMedium: source,
        sessions: parseMetricNumber(met[sourceMetricIndex.sessions]?.value),
        conversions:
          typeof sourceMetricIndex.conversions === 'number'
            ? parseMetricNumber(met[sourceMetricIndex.conversions]?.value)
            : null,
      };
    })
    .filter(Boolean);

  const eventRows = Array.isArray(eventsReport.data?.rows) ? eventsReport.data.rows : [];
  const events = eventRows
    .map((row) => {
      const dim = Array.isArray(row?.dimensionValues) ? row.dimensionValues : [];
      const met = Array.isArray(row?.metricValues) ? row.metricValues : [];
      const eventName = typeof dim[0]?.value === 'string' ? dim[0].value : '';
      if (!eventName) return null;
      return {
        eventName,
        count: parseMetricNumber(met[0]?.value),
      };
    })
    .filter(Boolean);

  return {
    range: { from: rangeFrom, to: rangeTo },
    compareRange: compareRange ? { from: compareRange.from, to: compareRange.to } : null,
    totals,
    series: { daily },
    tables: {
      pages,
      sourceMedium,
      events,
    },
  };
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
  const { code, state, error: oauthError } = req.query || {};

  if (oauthError) {
    const oauthErrorDescription = typeof req.query?.error_description === 'string' ? req.query.error_description : null;
    console.warn(logPrefix, 'oauth error', { oauthError, oauthErrorDescription });
    return res.redirect(302, buildAppRedirect('error', String(oauthError), oauthErrorDescription));
  }

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
      return res.redirect(302, buildAppRedirect('error', tokenError || 'token_exchange_failed', oauthErrorDescription));
    }

    const refreshToken = tokens?.refresh_token || null;
    let existingConn = null;
    if (userKey) {
      try {
        existingConn = await getConnectionByWorkspace(workspaceId, userKey);
      } catch (lookupErr) {
        console.error(logPrefix, 'lookup_failed', {
          name: lookupErr?.name || null,
          code: lookupErr?.code || null,
        });
      }
    }
    const storedRefreshToken = refreshToken || existingConn?.refreshToken || null;

    if (!storedRefreshToken) {
      console.warn(logPrefix, 'missing_refresh_token', { userId: userKey, workspaceId });
      return res.redirect(302, buildAppRedirect('error', 'missing_refresh_token'));
    }

    if (userKey) {
      try {
        await upsertConnection({
          workspaceId,
          userId: userKey,
          propertyId: existingConn?.propertyId || null,
          refreshToken: storedRefreshToken,
          status: 'connected',
          connectedAt: new Date(),
        });
      } catch (storageErr) {
        console.error(logPrefix, 'storage_failed', {
          name: storageErr?.name || null,
          code: storageErr?.code || null,
        });
        return res.redirect(302, buildAppRedirect('error', 'storage_failed'));
      }
    }

    console.log(logPrefix, 'stored connection', {
      userId: userKey,
      workspaceId,
      hasRefresh: Boolean(storedRefreshToken),
    });

    return res.redirect(302, buildAppRedirect('success'));
  } catch (err) {
    const { oauthError: tokenError, oauthErrorDescription } = getOauthErrorDetails(err);
    console.error(logPrefix, 'callback_failed', {
      name: err?.name || null,
      code: err?.code || null,
      oauthError: tokenError,
      oauthErrorDescription,
    });
    return res.redirect(302, buildAppRedirect('error', tokenError || 'token_exchange_failed', oauthErrorDescription));
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
    return res.status(400).json({ error: conn && conn.status === 'connected' ? 'missing_refresh_token' : 'not_connected' });
  }

  try {
    oauth2Client.setCredentials({ refresh_token: conn.refreshToken });
    const analyticsadmin = google.analyticsadmin('v1beta');
    const accounts = [];
    let accountsPageToken = undefined;
    do {
      const resp = await analyticsadmin.accounts.list({
        auth: oauth2Client,
        pageSize: 200,
        pageToken: accountsPageToken,
      });
      if (Array.isArray(resp.data?.accounts)) {
        accounts.push(...resp.data.accounts);
      }
      accountsPageToken = resp.data?.nextPageToken;
    } while (accountsPageToken);

    const propertiesMap = new Map();
    for (const account of accounts) {
      const accountName = typeof account?.name === 'string' ? account.name : null;
      if (!accountName) continue;
      let pageToken = undefined;
      do {
        let resp;
        try {
          resp = await analyticsadmin.properties.list({
            auth: oauth2Client,
            pageSize: 200,
            pageToken,
            filter: `parent:${accountName}`,
          });
        } catch (err) {
          const statusCode = Number(err?.response?.status) || null;
          const msg = (extractGoogleApiMessage(err) || err?.message || '').toString().toLowerCase();
          if (statusCode === 400 && msg.includes('filter')) {
            resp = await analyticsadmin.properties.list({
              auth: oauth2Client,
              pageSize: 200,
              pageToken,
              filter: `ancestor:${accountName}`,
            });
          } else {
            throw err;
          }
        }
        const respProperties = Array.isArray(resp.data?.properties) ? resp.data.properties : [];
        for (const property of respProperties) {
          const resourceName = typeof property?.name === 'string' ? property.name : null;
          const propertyId = resourceName ? resourceName.replace('properties/', '') : null;
          if (!propertyId) continue;
          const displayName =
            typeof property?.displayName === 'string' && property.displayName.trim()
              ? property.displayName.trim()
              : propertyId;
          propertiesMap.set(propertyId, { propertyId, displayName, resourceName });
        }
        pageToken = resp.data?.nextPageToken;
      } while (pageToken);
    }

    const properties = Array.from(propertiesMap.values()).sort((a, b) =>
      a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }),
    );

    console.log('[GA4_PROPERTIES_FETCH]', {
      workspaceId,
      userId: userKey,
      accounts: accounts.length,
      properties: properties.length,
    });
    return res.json({ properties });
  } catch (err) {
    const classified = classifyGa4GoogleError(err);
    console.warn('[GA4_PROPERTIES_ERROR]', {
      workspaceId,
      userId: userKey,
      error: classified.error,
      ...classified.details,
    });
    return res.status(classified.httpStatus).json({ error: classified.error, message: classified.message });
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

  const conn = await getConnectionByWorkspace(workspaceId, userKey);
  if (!conn || conn.status !== 'connected') {
    return res.status(400).json({ error: 'not_connected' });
  }

  await updateProperty({ workspaceId, userId: userKey, propertyId });
  const record = await getConnectionByWorkspace(workspaceId, userKey);

  return res.json({
    connected: Boolean(record && record.status === 'connected' && record.refreshToken),
    propertyId: propertyId,
    lastSyncAt: record?.updatedAt ? record.updatedAt.toISOString() : null,
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
    return res.status(400).json({ error: conn && conn.status === 'connected' ? 'missing_refresh_token' : 'not_connected' });
  }

  if (!conn.propertyId) {
    return res.status(400).json({ error: 'property_not_set' });
  }

  try {
    oauth2Client.setCredentials({ refresh_token: conn.refreshToken });
    const analyticsdata = google.analyticsdata('v1beta');
    const rangeKey = typeof dateRange === 'string' ? dateRange.toLowerCase() : 'last_7_days';
    const dateRanges =
      rangeKey === 'last_30_days'
        ? [{ startDate: '30daysAgo', endDate: 'yesterday' }]
        : [{ startDate: '7daysAgo', endDate: 'yesterday' }];
    const baseRequest = {
      auth: oauth2Client,
      property: `properties/${conn.propertyId}`,
      requestBody: {
        dateRanges,
      },
    };

    const metricsPrimary = [
      { name: 'activeUsers' },
      { name: 'sessions' },
      { name: 'totalUsers' },
      { name: 'conversions' },
      { name: 'purchaseRevenue' },
    ];

    let report;
    let purchaseRevenueMissing = false;
    try {
      report = await analyticsdata.properties.runReport({
        ...baseRequest,
        requestBody: { ...baseRequest.requestBody, metrics: metricsPrimary },
      });
    } catch (err) {
      const msg = (extractGoogleApiMessage(err) || err?.message || '').toString();
      if (msg.includes('purchaseRevenue')) {
        purchaseRevenueMissing = true;
        report = await analyticsdata.properties.runReport({
          ...baseRequest,
          requestBody: { ...baseRequest.requestBody, metrics: metricsPrimary.slice(0, 4) },
        });
      } else {
        throw err;
      }
    }

    const row = Array.isArray(report.data?.rows) ? report.data.rows[0] : null;
    const values = Array.isArray(row?.metricValues) ? row.metricValues : [];

    const parseNumber = (value) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    };

    const activeUsers = parseNumber(values[0]?.value);
    const sessions = parseNumber(values[1]?.value);
    const totalUsers = parseNumber(values[2]?.value);
    const conversions = parseNumber(values[3]?.value);
    const purchaseRevenue = purchaseRevenueMissing ? null : parseNumber(values[4]?.value);

    console.log('[GA4_RUNREPORT]', {
      workspaceId,
      userId: userKey,
      propertyId: conn.propertyId,
      dateRange: rangeKey,
    });

    return res.json({
      dateRange,
      propertyId: conn.propertyId,
      activeUsers,
      sessions,
      totalUsers,
      conversions,
      purchaseRevenue,
    });
  } catch (err) {
    const classified = classifyGa4GoogleError(err);
    console.warn('[GA4_RUNREPORT_ERROR]', {
      workspaceId,
      userId: userKey,
      propertyId: conn.propertyId,
      error: classified.error,
      ...classified.details,
    });
    return res.status(classified.httpStatus).json({ error: classified.error, message: classified.message });
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
  const hasV1Params =
    typeof req.query?.blocks === 'string' ||
    typeof req.query?.compareMode === 'string' ||
    typeof req.query?.compareFrom === 'string' ||
    typeof req.query?.compareTo === 'string';
  const legacyCompare = String(req.query?.compare || 'none').trim().toLowerCase();

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
  if (!conn.propertyId) {
    return res.status(400).json({ error: 'property_not_set' });
  }

  try {
    oauth2Client.setCredentials({ refresh_token: conn.refreshToken });
    if (!hasV1Params) {
      const compareMode = legacyCompare === 'prev' ? 'prev' : 'none';
      const payload = await buildGa4DashboardReportLegacy({
        oauth2Client,
        propertyId: conn.propertyId,
        rangeFrom,
        rangeTo,
        compareMode,
      });

      console.log('[GA4_REPORT]', {
        workspaceId,
        userId: userKey,
        propertyId: conn.propertyId,
        from: rangeFrom,
        to: rangeTo,
        compare: compareMode,
        status: 'ok',
      });

      return res.json(payload);
    }

    const blocks = normalizeGa4Blocks(req.query?.blocks);
    let compareMode = normalizeCompareMode(req.query?.compareMode);
    if (compareMode === 'none' && legacyCompare === 'prev') {
      compareMode = 'previous_period';
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

    const payload = await buildGa4ReportV1({
      oauth2Client,
      propertyId: conn.propertyId,
      rangeFrom,
      rangeTo,
      blocks,
      compare,
    });

    console.log('[GA4_REPORT_V1]', {
      workspaceId,
      userId: userKey,
      propertyId: conn.propertyId,
      from: rangeFrom,
      to: rangeTo,
      blocks: blocks.join(','),
      compareMode: compare?.mode || 'none',
      status: 'ok',
    });

    return res.json(payload);
  } catch (err) {
    const classified = classifyGa4GoogleError(err);
    console.warn(hasV1Params ? '[GA4_REPORT_V1]' : '[GA4_REPORT]', {
      workspaceId,
      userId: userKey,
      propertyId: conn.propertyId,
      from: rangeFrom,
      to: rangeTo,
      compareMode: hasV1Params ? normalizeCompareMode(req.query?.compareMode) : legacyCompare === 'prev' ? 'prev' : 'none',
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
  const blocksRaw = req.body?.blocks;
  const blocksFromBody = Array.isArray(blocksRaw)
    ? Array.from(
      new Set(
        blocksRaw
          .map((b) => (b == null ? '' : String(b)).trim().toLowerCase())
          .filter(Boolean)
          .filter((b) => GA4_REPORT_ALLOWED_BLOCKS.has(b)),
      ),
    )
    : normalizeGa4Blocks(typeof blocksRaw === 'string' ? blocksRaw : '');
  const blocks = blocksFromBody.length ? blocksFromBody : GA4_REPORT_DEFAULT_BLOCKS.slice();

  const legacyCompare = String(req.body?.compare || 'none').trim().toLowerCase();
  let compareMode = normalizeCompareMode(req.body?.compareMode);
  if (compareMode === 'none' && legacyCompare === 'prev') {
    compareMode = 'previous_period';
  }
  const compareFrom = String(req.body?.compareFrom || '').trim();
  const compareTo = String(req.body?.compareTo || '').trim();

  const labelRaw = typeof req.body?.label === 'string' ? req.body.label : null;
  const label = labelRaw && labelRaw.trim() ? labelRaw.trim().slice(0, 120) : null;

  const fromDate = parseUtcYmd(rangeFrom);
  const toDate = parseUtcYmd(rangeTo);
  if (!fromDate || !toDate || fromDate.getTime() > toDate.getTime()) {
    return res.status(400).json({ error: 'invalid_range' });
  }

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
  if (!conn.propertyId) {
    return res.status(400).json({ error: 'property_not_set' });
  }

  try {
    oauth2Client.setCredentials({ refresh_token: conn.refreshToken });
    const payload = await buildGa4ReportV1({
      oauth2Client,
      propertyId: conn.propertyId,
      rangeFrom,
      rangeTo,
      blocks,
      compare,
    });

    const snapshot = await createSnapshot({
      workspaceId,
      userId: userKey,
      propertyId: conn.propertyId,
      rangeFrom,
      rangeTo,
      blocks,
      compareMode: compare?.mode || null,
      compareFrom: compare?.from || null,
      compareTo: compare?.to || null,
      label,
      payload,
    });

    console.log('[GA4_SNAPSHOT_CREATE]', {
      workspaceId,
      userId: userKey,
      propertyId: conn.propertyId,
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
    const classified = classifyGa4GoogleError(err);
    console.warn('[GA4_SNAPSHOT_CREATE]', {
      workspaceId,
      userId: userKey,
      propertyId: conn.propertyId,
      from: rangeFrom,
      to: rangeTo,
      compare: compareMode,
      status: 'error',
      error: classified.error,
      ...classified.details,
    });
    return res.status(classified.httpStatus).json({ error: classified.error, message: classified.message });
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
  if (!conn.propertyId) {
    return res.status(400).json({ error: 'property_not_set' });
  }

  try {
    const rows = await listSnapshots({ workspaceId, userId: userKey, propertyId: conn.propertyId, limit });
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
    console.warn('[GA4_SNAPSHOTS_LIST_ERROR]', {
      workspaceId,
      userId: userKey,
      propertyId: conn.propertyId,
      name: err?.name || null,
      code: err?.code || null,
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
    console.warn('[GA4_SNAPSHOT_GET_ERROR]', {
      workspaceId,
      userId: userKey,
      id,
      name: err?.name || null,
      code: err?.code || null,
    });
    return res.status(500).json({ error: 'snapshot_get_failed' });
  }
});

export default router;
