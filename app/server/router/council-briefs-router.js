import express from 'express';
import { requireUser } from '../middleware/auth.js';
import { getUserByEmail } from '../userStore.js';
import { query } from '../db.js';

const router = express.Router();

const GA4_ALLOWED_BLOCKS = [
  'overview',
  'series',
  'pages',
  'sources',
  'events',
  'geo',
  'device',
];
const GA4_ALLOWED_BLOCKS_SET = new Set(GA4_ALLOWED_BLOCKS);
const GA4_BLOCK_ORDER = GA4_ALLOWED_BLOCKS.slice();

function getWorkspaceId(req) {
  const candidate = req.workspaceId || null;
  return candidate ? String(candidate).trim() : null;
}

function normalizeMode(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'standard') return 'standard';
  if (raw === 'full') return 'full';
  return 'compact';
}

function clampTopN(mode, topN) {
  const n = Number(topN);
  const normalized = Number.isFinite(n) ? Math.round(n) : 10;
  const allowed = [5, 10, 20];
  const selected = allowed.includes(normalized) ? normalized : 10;
  const cap = mode === 'compact' ? 5 : mode === 'standard' ? 10 : 20;
  return Math.min(selected, cap);
}

function normalizeBlocks(value) {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const normalized = list
    .map((b) => String(b || '').trim().toLowerCase())
    .filter(Boolean)
    .filter((b) => GA4_ALLOWED_BLOCKS_SET.has(b));
  const unique = Array.from(new Set(normalized));
  unique.sort((a, b) => GA4_BLOCK_ORDER.indexOf(a) - GA4_BLOCK_ORDER.indexOf(b));
  return unique;
}

function safeTrim(value, maxLen) {
  const raw = typeof value === 'string' ? value : value == null ? '' : String(value);
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return trimmed.slice(0, maxLen);
}

function estimateTokens(text) {
  if (typeof text !== 'string') return 0;
  const chars = text.trim().length;
  if (!chars) return 0;
  return Math.max(0, Math.ceil(chars / 4));
}

function formatInteger(value) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  try {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
  } catch (_err) {
    return String(Math.round(n));
  }
}

function formatMoney(value) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  try {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(n);
  } catch (_err) {
    return String(Math.round(n * 100) / 100);
  }
}

function formatPercent(value) {
  if (value == null) return '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  const rounded = Math.round(n * 10) / 10;
  return `${sign}${rounded}%`;
}

function deriveCompareValue(current, pctChange) {
  if (current == null || pctChange == null) return null;
  const currentNumber = typeof current === 'number' ? current : Number(current);
  const pctNumber = typeof pctChange === 'number' ? pctChange : Number(pctChange);
  if (!Number.isFinite(currentNumber) || !Number.isFinite(pctNumber)) return null;
  const denom = 1 + pctNumber / 100;
  if (!Number.isFinite(denom) || denom === 0) return null;
  const prev = currentNumber / denom;
  if (!Number.isFinite(prev)) return null;
  return prev;
}

function buildMarkdownTable(headers, rows) {
  const cols = Array.isArray(headers) ? headers.length : 0;
  if (!cols) return '';
  const headerRow = `| ${headers.join(' | ')} |`;
  const alignRow = `| ${headers.map((_h, idx) => (idx === 0 ? '---' : '---:')).join(' | ')} |`;
  const body = (Array.isArray(rows) ? rows : []).map((r) => `| ${r.map((c) => String(c ?? '—')).join(' | ')} |`);
  return [headerRow, alignRow, ...body].join('\n');
}

function normalizeGa4Payload(snapshot) {
  const payload = snapshot?.payload;
  if (!payload || typeof payload !== 'object') {
    return {
      range: { from: snapshot?.range_from || null, to: snapshot?.range_to || null },
      compare: snapshot?.compare_from && snapshot?.compare_to ? {
        mode: snapshot?.compare_mode || 'custom',
        from: snapshot.compare_from,
        to: snapshot.compare_to,
      } : null,
      blocks: Array.isArray(snapshot?.blocks) ? snapshot.blocks : [],
      data: {},
    };
  }

  if (payload.data && payload.blocks) {
    return {
      range: payload.range || { from: snapshot?.range_from || null, to: snapshot?.range_to || null },
      compare: payload.compare || (snapshot?.compare_from && snapshot?.compare_to ? {
        mode: snapshot?.compare_mode || 'custom',
        from: snapshot.compare_from,
        to: snapshot.compare_to,
      } : null),
      blocks: Array.isArray(payload.blocks) ? payload.blocks : (Array.isArray(snapshot?.blocks) ? snapshot.blocks : []),
      data: payload.data && typeof payload.data === 'object' ? payload.data : {},
    };
  }

  if (payload.totals || payload.series || payload.tables) {
    return {
      range: payload.range || { from: snapshot?.range_from || null, to: snapshot?.range_to || null },
      compare: payload.compareRange
        ? { mode: snapshot?.compare_mode || 'previous_period', from: payload.compareRange.from, to: payload.compareRange.to }
        : snapshot?.compare_from && snapshot?.compare_to
        ? { mode: snapshot?.compare_mode || 'custom', from: snapshot.compare_from, to: snapshot.compare_to }
        : null,
      blocks: Array.isArray(snapshot?.blocks) ? snapshot.blocks : [],
      data: {
        overview: payload.totals || {},
        series: payload.series || {},
        pages: { rows: payload.tables?.pages || [] },
        sources: { rows: payload.tables?.sourceMedium || [] },
        events: { rows: payload.tables?.events || [] },
      },
    };
  }

  return {
    range: payload.range || { from: snapshot?.range_from || null, to: snapshot?.range_to || null },
    compare: payload.compare || null,
    blocks: Array.isArray(snapshot?.blocks) ? snapshot.blocks : [],
    data: payload.data && typeof payload.data === 'object' ? payload.data : {},
  };
}

function getGa4EvidenceFromData(data, includeBlocks, topN) {
  const evidence = [];

  const sourcesRows = data?.sources?.rows;
  const pagesRows = data?.pages?.rows;
  const eventsRows = data?.events?.rows;
  const geoCountries = data?.geo?.countries;
  const geoCities = data?.geo?.cities;
  const deviceCategory = data?.device?.deviceCategory;
  const osRows = data?.device?.os;

  const want = new Set(includeBlocks);
  const pushIf = (key, title, table) => {
    if (!table) return;
    evidence.push({ key, title, table });
  };

  if (want.has('sources')) {
    const rows = (Array.isArray(sourcesRows) ? sourcesRows : []).slice(0, topN).map((r) => [
      r?.sourceMedium || '—',
      formatInteger(r?.sessions),
      r?.conversions == null ? '—' : formatInteger(r?.conversions),
    ]);
    pushIf('sources', 'Top sources / medium', buildMarkdownTable(['Source/Medium', 'Sessions', 'Conversions'], rows));
  }

  if (want.has('pages')) {
    const rows = (Array.isArray(pagesRows) ? pagesRows : []).slice(0, topN).map((r) => [
      r?.title || r?.page || '—',
      r?.title ? (r?.page || '') : '',
      formatInteger(r?.sessions),
      r?.conversions == null ? '—' : formatInteger(r?.conversions),
    ]);
    pushIf('pages', 'Top pages', buildMarkdownTable(['Page', 'Path', 'Sessions', 'Conversions'], rows));
  }

  if (want.has('events')) {
    const rows = (Array.isArray(eventsRows) ? eventsRows : []).slice(0, topN).map((r) => [
      r?.eventName || '—',
      formatInteger(r?.count),
    ]);
    pushIf('events', 'Top events', buildMarkdownTable(['Event', 'Count'], rows));
  }

  if (want.has('geo')) {
    const countries = (Array.isArray(geoCountries) ? geoCountries : []).slice(0, topN).map((r) => [
      r?.country || '—',
      formatInteger(r?.sessions),
      r?.conversions == null ? '—' : formatInteger(r?.conversions),
    ]);
    pushIf('geo_countries', 'Top countries', buildMarkdownTable(['Country', 'Sessions', 'Conversions'], countries));

    const cities = (Array.isArray(geoCities) ? geoCities : []).slice(0, topN).map((r) => [
      r?.city || '—',
      formatInteger(r?.sessions),
      r?.conversions == null ? '—' : formatInteger(r?.conversions),
    ]);
    pushIf('geo_cities', 'Top cities', buildMarkdownTable(['City', 'Sessions', 'Conversions'], cities));
  }

  if (want.has('device')) {
    const devices = (Array.isArray(deviceCategory) ? deviceCategory : []).slice(0, topN).map((r) => [
      r?.deviceCategory || '—',
      formatInteger(r?.sessions),
      r?.conversions == null ? '—' : formatInteger(r?.conversions),
    ]);
    pushIf('device_category', 'Device category', buildMarkdownTable(['Device', 'Sessions', 'Conversions'], devices));

    const os = (Array.isArray(osRows) ? osRows : []).slice(0, topN).map((r) => [
      r?.os || '—',
      formatInteger(r?.sessions),
      r?.conversions == null ? '—' : formatInteger(r?.conversions),
    ]);
    pushIf('device_os', 'Operating system', buildMarkdownTable(['OS', 'Sessions', 'Conversions'], os));
  }

  return evidence;
}

function computeMovers({ currentRows, compareRows, keyFn, metricName }) {
  const current = Array.isArray(currentRows) ? currentRows : [];
  const compare = Array.isArray(compareRows) ? compareRows : [];
  const metric = String(metricName || 'sessions').trim();
  const score = (row) => {
    const v = row?.[metric];
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const map = new Map();
  current.forEach((row) => {
    const key = keyFn(row);
    if (!key) return;
    map.set(key, { key, current: score(row), compare: 0 });
  });
  compare.forEach((row) => {
    const key = keyFn(row);
    if (!key) return;
    const prev = map.get(key) || { key, current: 0, compare: 0 };
    prev.compare = score(row);
    map.set(key, prev);
  });

  const deltas = Array.from(map.values()).map((item) => ({
    key: item.key,
    delta: item.current - item.compare,
    current: item.current,
    compare: item.compare,
  }));

  const topUp = deltas
    .filter((d) => d.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 3);
  const topDown = deltas
    .filter((d) => d.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 2);

  const formatDelta = (d) => {
    const sign = d.delta > 0 ? '+' : '';
    return `${d.key} (${sign}${formatInteger(d.delta)})`;
  };

  const parts = [];
  if (topUp.length) parts.push(`up: ${topUp.map(formatDelta).join(', ')}`);
  if (topDown.length) parts.push(`down: ${topDown.map(formatDelta).join(', ')}`);
  return parts.length ? parts.join(' · ') : null;
}

function computeSeriesAnomalies(seriesDaily) {
  const rows = Array.isArray(seriesDaily) ? seriesDaily : [];
  if (!rows.length) return null;
  const values = rows.map((r) => Number(r?.sessions) || 0);
  const sum = values.reduce((acc, v) => acc + v, 0);
  const avg = sum / values.length;
  const max = Math.max(...values);
  const maxIdx = values.indexOf(max);
  const maxDate = rows[maxIdx]?.date || null;
  if (!maxDate || avg <= 0) return null;
  const lift = (max / avg - 1) * 100;
  if (!Number.isFinite(lift) || lift < 45) return null;
  return { date: maxDate, sessions: max, avg, liftPct: Math.round(lift * 10) / 10 };
}

function buildGa4SnapshotBriefMarkdown({ snapshot, payload, mode, includeBlocks, topN, question }) {
  const normalized = normalizeGa4Payload({ ...snapshot, payload });
  const blocks = normalizeBlocks(includeBlocks);
  const data = normalized.data || {};
  const compare = normalized.compare || null;

  const lines = [];
  lines.push('### GA4 Snapshot Brief');
  lines.push('');

  lines.push('#### Context');
  lines.push(`- Property: \`${snapshot.property_id || normalized?.propertyId || '—'}\``);
  lines.push(`- Range: ${snapshot.range_from || normalized.range?.from || '—'} → ${snapshot.range_to || normalized.range?.to || '—'}`);
  if (compare) {
    const modeLabel =
      compare.mode === 'previous_year'
        ? 'Previous year'
        : compare.mode === 'custom'
          ? 'Custom'
          : 'Previous period';
    lines.push(`- Compare (${modeLabel}): ${compare.from} → ${compare.to}`);
  } else {
    lines.push('- Compare: none');
  }
  lines.push(`- Blocks: ${blocks.length ? blocks.join(', ') : '—'}`);
  lines.push('');

  if (blocks.includes('overview')) {
    const overview = data.overview || {};
    const deltas = overview?.deltas || {};

    const users = overview?.users ?? null;
    const sessions = overview?.sessions ?? null;
    const conversions = overview?.conversions ?? null;
    const revenue = overview?.revenue ?? null;

    const usersPrev = deriveCompareValue(users, deltas.users);
    const sessionsPrev = deriveCompareValue(sessions, deltas.sessions);
    const conversionsPrev = conversions == null ? null : deriveCompareValue(conversions, deltas.conversions);
    const revenuePrev = revenue == null ? null : deriveCompareValue(revenue, deltas.revenue);

    const usersDelta = usersPrev == null ? null : users - usersPrev;
    const sessionsDelta = sessionsPrev == null ? null : sessions - sessionsPrev;
    const conversionsDelta = conversionsPrev == null || conversions == null ? null : conversions - conversionsPrev;
    const revenueDelta = revenuePrev == null || revenue == null ? null : revenue - revenuePrev;

    const kpiRows = [
      ['Users', formatInteger(users), usersPrev == null ? '—' : formatInteger(usersPrev), usersDelta == null ? '—' : formatInteger(usersDelta), formatPercent(deltas.users)],
      ['Sessions', formatInteger(sessions), sessionsPrev == null ? '—' : formatInteger(sessionsPrev), sessionsDelta == null ? '—' : formatInteger(sessionsDelta), formatPercent(deltas.sessions)],
      ['Conversions', conversions == null ? '—' : formatInteger(conversions), conversionsPrev == null ? '—' : formatInteger(conversionsPrev), conversionsDelta == null ? '—' : formatInteger(conversionsDelta), formatPercent(deltas.conversions)],
      ['Revenue', revenue == null ? '—' : formatMoney(revenue), revenuePrev == null ? '—' : formatMoney(revenuePrev), revenueDelta == null ? '—' : formatMoney(revenueDelta), formatPercent(deltas.revenue)],
    ];

    lines.push('#### KPIs');
    lines.push(buildMarkdownTable(['Metric', 'Current', 'Compare', 'Δ', 'Δ%'], kpiRows));
    lines.push('');

    const whatChanged = [];
    const candidates = [
      { key: 'users', label: 'Users', pct: deltas.users, delta: usersDelta },
      { key: 'sessions', label: 'Sessions', pct: deltas.sessions, delta: sessionsDelta },
      { key: 'conversions', label: 'Conversions', pct: deltas.conversions, delta: conversionsDelta },
      { key: 'revenue', label: 'Revenue', pct: deltas.revenue, delta: revenueDelta, money: true },
    ].filter((c) => c.pct != null);

    if (candidates.length) {
      candidates.sort((a, b) => Math.abs(Number(b.pct) || 0) - Math.abs(Number(a.pct) || 0));
      const top = candidates[0];
      const deltaText =
        top.delta == null
          ? formatPercent(top.pct)
          : `${formatPercent(top.pct)} (${top.money ? formatMoney(top.delta) : formatInteger(top.delta)})`;
      whatChanged.push(`Biggest KPI move: **${top.label}** ${deltaText}.`);
    }

    if (conversions != null && sessions != null && sessions > 0 && compare && conversionsPrev != null && sessionsPrev != null && sessionsPrev > 0) {
      const rate = conversions / sessions;
      const prevRate = conversionsPrev / sessionsPrev;
      const rateDeltaPct = prevRate === 0 ? null : ((rate - prevRate) / prevRate) * 100;
      if (Number.isFinite(rateDeltaPct) && rateDeltaPct <= -5) {
        whatChanged.push(`Conversion efficiency down: **${Math.round(rateDeltaPct * 10) / 10}%** vs compare (conversions/sessions).`);
      }
      if ((deltas.sessions ?? 0) > 0 && (deltas.conversions ?? 0) < 0) {
        whatChanged.push('Sessions up while conversions down → investigate conversion drop-off.');
      }
    }

    const anomaly = computeSeriesAnomalies(data?.series?.daily);
    if (anomaly) {
      whatChanged.push(
        `Traffic spike: ${anomaly.date} sessions **${formatInteger(anomaly.sessions)}** (+${anomaly.liftPct}% vs avg ${formatInteger(anomaly.avg)}).`,
      );
    }

    if (compare && blocks.includes('sources')) {
      const movers = computeMovers({
        currentRows: data?.sources?.rows,
        compareRows: data?.sources?.compareRows,
        keyFn: (r) => String(r?.sourceMedium || '').trim(),
        metricName: 'sessions',
      });
      if (movers) whatChanged.push(`Source movers (sessions): ${movers}.`);
    }

    if (compare && blocks.includes('pages')) {
      const movers = computeMovers({
        currentRows: data?.pages?.rows,
        compareRows: data?.pages?.compareRows,
        keyFn: (r) => `${String(r?.page || '').trim()}|${String(r?.title || '').trim()}`,
        metricName: 'sessions',
      });
      if (movers) whatChanged.push(`Page movers (sessions): ${movers}.`);
    }

    if (compare && blocks.includes('events')) {
      const movers = computeMovers({
        currentRows: data?.events?.rows,
        compareRows: data?.events?.compareRows,
        keyFn: (r) => String(r?.eventName || '').trim(),
        metricName: 'count',
      });
      if (movers) whatChanged.push(`Event movers (count): ${movers}.`);
    }

    if (whatChanged.length) {
      const limit = mode === 'compact' ? 4 : mode === 'standard' ? 6 : 10;
      lines.push('#### What changed');
      whatChanged.slice(0, limit).forEach((b) => lines.push(`- ${b}`));
      lines.push('');
    }
  }

  const evidenceAll = getGa4EvidenceFromData(data, blocks, topN);
  const evidencePriority = ['sources', 'pages', 'events', 'geo_countries', 'device_category', 'geo_cities', 'device_os'];
  evidenceAll.sort((a, b) => evidencePriority.indexOf(a.key) - evidencePriority.indexOf(b.key));

  let maxEvidence = mode === 'compact' ? 2 : mode === 'standard' ? 4 : 999;
  const evidenceToInclude = evidenceAll.slice(0, maxEvidence);

  if (evidenceToInclude.length) {
    lines.push('#### Evidence');
    lines.push('');
    evidenceToInclude.forEach((section) => {
      lines.push(`##### ${section.title}`);
      lines.push(section.table);
      lines.push('');
    });
  }

  const questionText = safeTrim(question, 800) || 'Explain what changed, likely drivers, and next actions.';
  lines.push('#### Question for Council');
  lines.push(questionText);
  lines.push('');

  return lines.join('\n');
}

function enforceCharLimit(text, maxChars) {
  if (typeof text !== 'string') return { text: '', truncated: false };
  if (text.length <= maxChars) return { text, truncated: false };
  const suffix = '\n\n…(truncated)…\n';
  const trimmed = text.slice(0, Math.max(0, maxChars - suffix.length)).trimEnd();
  return { text: `${trimmed}${suffix}`, truncated: true };
}

async function storeCouncilBrief({
  workspaceId,
  userId,
  source,
  snapshotId,
  mode,
  includeBlocks,
  topN,
  question,
  prompt,
}) {
  try {
    const includeBlocksJson = JSON.stringify(includeBlocks);
    const result = await query(
      `
        INSERT INTO council_briefs (
          workspace_id,
          user_id,
          source,
          snapshot_id,
          mode,
          include_blocks,
          top_n,
          question,
          prompt
        )
        VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)
        RETURNING id
      `,
      [
        workspaceId,
        userId,
        source,
        snapshotId,
        mode,
        includeBlocksJson,
        topN,
        question,
        prompt,
      ],
    );
    return result.rows?.[0]?.id || null;
  } catch (err) {
    // Optional persistence; allow deployments without the table.
    if (err?.code === '42P01') {
      return null;
    }
    throw err;
  }
}

router.post('/briefs', requireUser, async (req, res) => {
  const email = req.userEmail || req.user?.email || null;
  if (!email) return res.status(401).json({ error: 'Unauthorized' });

  const user = await getUserByEmail(email);
  const userId = user?.id ? String(user.id) : null;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const workspaceId = getWorkspaceId(req);
  if (!workspaceId) return res.status(403).json({ error: 'workspace_not_bound' });
  const source = safeTrim(req.body?.source, 24).toLowerCase();
  if (source !== 'ga4') {
    return res.status(400).json({ error: 'invalid_source', message: 'Only ga4 is supported for now.' });
  }

  const snapshotIdRaw = req.body?.snapshotId;
  const snapshotId = Number(snapshotIdRaw);
  if (!Number.isFinite(snapshotId) || snapshotId <= 0) {
    return res.status(400).json({ error: 'invalid_snapshot_id', message: 'snapshotId must be a positive number.' });
  }

  const mode = normalizeMode(req.body?.mode);
  const topN = clampTopN(mode, req.body?.topN);
  const question = safeTrim(req.body?.question, 1200);
  const includeBlocks = normalizeBlocks(req.body?.includeBlocks);

  try {
    const snapshotResult = await query(
      `
        SELECT
          id,
          created_at,
          workspace_id,
          user_id,
          property_id,
          range_from::text AS range_from,
          range_to::text AS range_to,
          blocks,
          compare_mode,
          compare_from::text AS compare_from,
          compare_to::text AS compare_to,
          payload
        FROM ga4_snapshots
        WHERE id = $1
          AND workspace_id = $2
          AND user_id = $3
        LIMIT 1
      `,
      [snapshotId, workspaceId, userId],
    );

    const snapshot = snapshotResult.rows?.[0] || null;
    if (!snapshot) {
      return res.status(404).json({ error: 'snapshot_not_found', message: 'Snapshot not found.' });
    }

    const maxChars = mode === 'compact' ? 5000 : mode === 'standard' ? 12000 : 24000;
    const promptRaw = buildGa4SnapshotBriefMarkdown({
      snapshot,
      payload: snapshot.payload,
      mode,
      includeBlocks: includeBlocks.length ? includeBlocks : Array.isArray(snapshot.blocks) ? snapshot.blocks : [],
      topN,
      question,
    });
    const { text: prompt, truncated } = enforceCharLimit(promptRaw, maxChars);
    const estimatedTokens = estimateTokens(prompt);

    const briefId = await storeCouncilBrief({
      workspaceId,
      userId,
      source,
      snapshotId: snapshot.id,
      mode,
      includeBlocks: includeBlocks.length ? includeBlocks : Array.isArray(snapshot.blocks) ? snapshot.blocks : [],
      topN,
      question,
      prompt,
    });

    console.log('[COUNCIL_BRIEF_CREATE]', {
      workspaceId,
      userId,
      source,
      snapshotId: snapshot.id,
      mode,
      topN,
      blocksCount: includeBlocks.length,
      truncated,
    });

    return res.json({
      briefId,
      prompt,
      meta: { estimatedTokens, truncated },
    });
  } catch (err) {
    console.warn('[COUNCIL_BRIEF_CREATE_ERROR]', {
      workspaceId,
      userId,
      source,
      snapshotId,
      mode,
      name: err?.name || null,
      code: err?.code || null,
    });
    return res.status(500).json({ error: 'brief_build_failed', message: 'Could not build council brief.' });
  }
});

export default router;
