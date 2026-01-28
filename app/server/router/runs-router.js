import express from 'express';
import path from 'node:path';
import { requireUser } from '../middleware/auth.js';
import { getUserByEmail } from '../userStore.js';
import { resolvePayloadAttachments } from '../services/payloadService.js';
import { createRunPreview, consumeRunPreview } from '../services/runPreviewService.js';
import { PRICING_VERSION, FX_VERSION } from '../config/pricingConfig.js';
import { getClient } from '../db.js';
import { createRun, getRun } from '../repos/runsRepo.js';
import { appendRunEventTx, listRunEvents } from '../repos/runEventsRepo.js';
import { writeJsonArtifact, createArtifact } from '../repos/artifactsRepo.js';
import { getProviderProfile } from '../repos/providerProfilesRepo.js';
import { getProviderAdapter } from '../providers/index.js';

const router = express.Router();
const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || path.resolve(process.cwd(), 'var', 'artifacts');
const REAL_CALL_WINDOW_MS = 60_000;
const REAL_CALLS_PER_MINUTE = (() => {
  const raw = Number(process.env.REAL_LLM_MAX_PER_MINUTE || 2);
  return Number.isFinite(raw) ? Math.max(0, raw) : 2;
})();
const REAL_INPUT_MAX_CHARS = (() => {
  const raw = Number(process.env.REAL_LLM_MAX_INPUT_CHARS || 2000);
  return Number.isFinite(raw) ? Math.max(1, raw) : 2000;
})();
const realCallBuckets = new Map();

function getWorkspaceId(req) {
  const candidate = req.workspaceId || null;
  return candidate ? String(candidate).trim() : null;
}

function normalizeOptionalText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeProfileName(value) {
  if (typeof value !== 'string') return 'google-vertex-sterile';
  const trimmed = value.trim();
  return trimmed || 'google-vertex-sterile';
}

function normalizeTraceId(req) {
  const bodyValue = typeof req.body?.traceId === 'string' ? req.body.traceId.trim() : '';
  if (bodyValue) return bodyValue;
  const headerValue = typeof req.headers['x-trace-id'] === 'string'
    ? req.headers['x-trace-id'].trim()
    : '';
  return headerValue || null;
}

function normalizeConfirmHeader(value) {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return raw === 'true' || raw === '1' || raw === 'yes';
}

function estimateInputChars(input, promptEnvelope) {
  if (typeof input === 'string') return input.length;
  if (input && typeof input === 'object') {
    try {
      return JSON.stringify(input).length;
    } catch {
      return String(input).length;
    }
  }
  if (typeof promptEnvelope === 'string') return promptEnvelope.length;
  if (promptEnvelope && typeof promptEnvelope === 'object') {
    try {
      return JSON.stringify(promptEnvelope).length;
    } catch {
      return String(promptEnvelope).length;
    }
  }
  return 0;
}

function consumeRealCall(workspaceId) {
  const now = Date.now();
  if (!Number.isFinite(REAL_CALLS_PER_MINUTE) || REAL_CALLS_PER_MINUTE <= 0) {
    return { allowed: false, remaining: 0, resetAt: now + REAL_CALL_WINDOW_MS };
  }
  const bucket = realCallBuckets.get(workspaceId) || { count: 0, windowStart: now };
  if (now - bucket.windowStart >= REAL_CALL_WINDOW_MS) {
    bucket.count = 0;
    bucket.windowStart = now;
  }
  if (bucket.count >= REAL_CALLS_PER_MINUTE) {
    realCallBuckets.set(workspaceId, bucket);
    return { allowed: false, remaining: 0, resetAt: bucket.windowStart + REAL_CALL_WINDOW_MS };
  }
  bucket.count += 1;
  realCallBuckets.set(workspaceId, bucket);
  return {
    allowed: true,
    remaining: Math.max(0, REAL_CALLS_PER_MINUTE - bucket.count),
    resetAt: bucket.windowStart + REAL_CALL_WINDOW_MS,
  };
}

function normalizeEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object') return null;
  const objective = typeof envelope.objective === 'string' ? envelope.objective.trim() : null;
  return {
    envelopeVersion: envelope.envelopeVersion || null,
    objective,
  };
}

function buildRequestPayload({ runId, profile, traceId, input, promptEnvelope, audit }) {
  const allowedTools = Array.isArray(profile.allowed_tools) ? profile.allowed_tools : [];
  const allowedScopes = Array.isArray(profile.allowed_scopes) ? profile.allowed_scopes : [];
  return {
    runId,
    provider: profile.provider,
    model: profile.default_model,
    profile: profile.name,
    traceId,
    request: {
      input: input ?? null,
      envelope: normalizeEnvelope(promptEnvelope),
      constraints: {
        allowWeb: false,
        allowedTools,
        allowedScopes,
      },
      responseFormat: profile.response_format || {},
      refusalPolicy: profile.refusal_policy || {},
      audit: audit || null,
    },
  };
}

function respondError(res, err) {
  const status = err?.status || 400;
  const code = err?.code || 'run_error';
  const message = err?.message || 'Run request failed.';
  return res.status(status).json({ error: code, message });
}

router.post('/preview', requireUser, async (req, res) => {
  try {
    const user = await getUserByEmail(req.userEmail || req.user?.email);
    if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });

    const workspaceId = getWorkspaceId(req);
    if (!workspaceId) {
      return res.status(403).json({ error: 'workspace_not_bound' });
    }
    const objective = typeof req.body?.objective === 'string' ? req.body.objective.trim() : '';
    if (!objective) {
      return res.status(400).json({ error: 'objective_required', message: 'Objective is required.' });
    }

    const payloadIds = Array.isArray(req.body?.payloadIds) ? req.body.payloadIds : null;
    const resolved = await resolvePayloadAttachments({ workspaceId, payloadIds });

    const preview = createRunPreview({
      userId: user.id || user.email,
      workspaceId,
      payloadIds: resolved.payloads.map((p) => p.id),
      payloadHashes: resolved.payloads.map((p) => p.hash),
    });

    return res.status(201).json({
      runId: preview.runId,
      previewId: preview.previewId,
      diff: null,
      estimatedUsage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        toolTokens: 0,
        costUsd: 0,
        costCbT: 0,
        pricingVersion: PRICING_VERSION,
        fxVersion: FX_VERSION,
        isEstimate: true,
      },
      payloads: resolved.payloads,
    });
  } catch (err) {
    return respondError(res, err);
  }
});

router.post('/commit', requireUser, async (req, res) => {
  try {
    const user = await getUserByEmail(req.userEmail || req.user?.email);
    if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });

    const workspaceId = getWorkspaceId(req);
    if (!workspaceId) {
      return res.status(403).json({ error: 'workspace_not_bound' });
    }
    const previewId = typeof req.body?.previewId === 'string' ? req.body.previewId.trim() : '';
    if (!previewId) {
      return res.status(400).json({ error: 'preview_required', message: 'previewId is required.' });
    }

    const preview = consumeRunPreview(previewId, {
      userId: user.id || user.email,
      workspaceId,
    });

    if (!preview) {
      return res.status(404).json({ error: 'preview_expired', message: 'Preview not found or expired.' });
    }

    return res.json({
      runId: preview.runId,
      status: 'queued',
    });
  } catch (err) {
    return respondError(res, err);
  }
});

router.post('/', requireUser, async (req, res, next) => {
  try {
    const workspaceId = getWorkspaceId(req);
    if (!workspaceId) {
      return res.status(403).json({ error: 'workspace_not_bound' });
    }
    const title = normalizeOptionalText(req.body?.title);
    const clientId = normalizeOptionalText(req.body?.clientId);
    const runId = await createRun({ workspaceId, clientId, title });
    res.json({ runId });
  } catch (err) {
    next(err);
  }
});

router.get('/:runId', requireUser, async (req, res, next) => {
  try {
    const workspaceId = getWorkspaceId(req);
    if (!workspaceId) {
      return res.status(403).json({ error: 'workspace_not_bound' });
    }
    const runId = req.params.runId;
    const run = await getRun(runId);
    if (!run || run.workspace_id !== workspaceId) {
      return res.status(404).json({ error: 'run_not_found' });
    }
    const events = await listRunEvents(runId, { limit: 1000 });
    res.json({ run, events });
  } catch (err) {
    next(err);
  }
});

router.post('/:runId/events', requireUser, async (req, res) => {
  const runId = req.params.runId;
  const workspaceId = getWorkspaceId(req);
  if (!workspaceId) {
    return res.status(403).json({ error: 'workspace_not_bound' });
  }
  const run = await getRun(runId);
  if (!run || run.workspace_id !== workspaceId) {
    return res.status(404).json({ error: 'run_not_found' });
  }
  const { kind, actor = {}, payload = {}, hashes = {} } = req.body || {};
  if (!kind) return res.status(400).json({ error: 'missing_kind' });

  let client;
  try {
    client = await getClient();
    await client.query('BEGIN');
    const seq = await appendRunEventTx(client, { runId, kind, actor, payload, hashes });
    await client.query('COMMIT');
    res.json({ ok: true, seq });
  } catch (err) {
    if (client) {
      await client.query('ROLLBACK');
    }
    if (err?.message === 'run_not_found') {
      return res.status(404).json({ error: 'run_not_found' });
    }
    console.error('[RUN_EVENT_APPEND_ERROR]', err?.message);
    return res.status(500).json({ error: 'append_event_failed' });
  } finally {
    if (client) {
      client.release();
    }
  }
});

router.post('/:runId/llm', requireUser, async (req, res) => {
  const runId = req.params.runId;
  const workspaceId = getWorkspaceId(req);
  if (!workspaceId) return res.status(403).json({ error: 'workspace_not_bound' });
  const profileName = normalizeProfileName(req.body?.profileName);
  const input = req.body?.input ?? null;
  const promptEnvelope = req.body?.promptEnvelope ?? null;
  const traceId = normalizeTraceId(req);

  const run = await getRun(runId);
  if (!run || run.workspace_id !== workspaceId) {
    return res.status(404).json({ error: 'run_not_found' });
  }

  const profile = await getProviderProfile(workspaceId, profileName);
  if (!profile) return res.status(404).json({ error: 'profile_not_found' });
  if (profile.is_enabled === false) return res.status(403).json({ error: 'profile_disabled' });

  let adapter;
  try {
    adapter = getProviderAdapter(profile);
  } catch (err) {
    return res.status(400).json({ error: 'provider_not_supported', provider: profile.provider });
  }

  const actor = {
    provider: profile.provider,
    model: profile.default_model,
    profile: profile.name,
  };
  const helloPayload = adapter.actorHello(profile, { runId, traceId });
  const useRealVertex = String(process.env.USE_REAL_VERTEX || '').toLowerCase() === 'true';
  const realRequested = req.body?.real === true;
  const realConfirmed = useRealVertex && realRequested && normalizeConfirmHeader(req.headers['x-real-llm-confirm']);
  const costCapUsd = Number.isFinite(Number(profile?.limits?.maxCostUsd))
    ? Number(profile.limits.maxCostUsd)
    : null;
  const costEstimateUsd = null;
  const inputChars = estimateInputChars(input, promptEnvelope);
  let rateLimit = null;
  const mode = useRealVertex ? 'real' : 'mock';

  if (useRealVertex && !realConfirmed) {
    const errorPayload = {
      runId,
      provider: profile.provider,
      model: profile.default_model,
      profile: profile.name,
      traceId,
      error: {
        message: 'real calls disabled without confirmation',
        code: 'real_calls_disabled',
      },
      audit: {
        mode,
        realConfirmed,
        costEstimateUsd,
        costCapUsd,
        rateLimit,
      },
    };
    const errorHash = adapter.hashJson(errorPayload.error);
    let client;
    try {
      client = await getClient();
      await client.query('BEGIN');
      await appendRunEventTx(client, {
        runId,
        kind: 'actor_hello',
        actor,
        payload: helloPayload,
      });
      await appendRunEventTx(client, {
        runId,
        kind: 'llm_error',
        actor,
        payload: errorPayload,
        hashes: { errorHash },
      });
      await client.query('COMMIT');
    } catch (err) {
      if (client) {
        await client.query('ROLLBACK');
      }
      console.error('[RUN_LLM_GUARDRAIL_LOG_FAILED]', err?.message || err);
    } finally {
      if (client) {
        client.release();
      }
    }
    return res.status(403).json({ error: 'real_calls_disabled' });
  }

  if (useRealVertex && realConfirmed) {
    if (inputChars > REAL_INPUT_MAX_CHARS) {
      const errorPayload = {
        runId,
        provider: profile.provider,
        model: profile.default_model,
        profile: profile.name,
        traceId,
        error: {
          message: `cost_cap_exceeded: input too large (${inputChars} chars)`,
          code: 'cost_cap_exceeded',
        },
        audit: {
          mode,
          realConfirmed,
          costEstimateUsd,
          costCapUsd,
          rateLimit,
        },
      };
      const errorHash = adapter.hashJson(errorPayload.error);
      let client;
      try {
        client = await getClient();
        await client.query('BEGIN');
        await appendRunEventTx(client, {
          runId,
          kind: 'actor_hello',
          actor,
          payload: helloPayload,
        });
        await appendRunEventTx(client, {
          runId,
          kind: 'llm_error',
          actor,
          payload: errorPayload,
          hashes: { errorHash },
        });
        await client.query('COMMIT');
      } catch (err) {
        if (client) {
          await client.query('ROLLBACK');
        }
        console.error('[RUN_LLM_GUARDRAIL_LOG_FAILED]', err?.message || err);
      } finally {
        if (client) {
          client.release();
        }
      }
      return res.status(400).json({ error: 'cost_cap_exceeded' });
    }

    rateLimit = consumeRealCall(workspaceId);
    if (!rateLimit.allowed) {
      const errorPayload = {
        runId,
        provider: profile.provider,
        model: profile.default_model,
        profile: profile.name,
        traceId,
        error: {
          message: 'real call rate limited',
          code: 'real_rate_limited',
        },
        audit: {
          mode,
          realConfirmed,
          costEstimateUsd,
          costCapUsd,
          rateLimit,
        },
      };
      const errorHash = adapter.hashJson(errorPayload.error);
      let client;
      try {
        client = await getClient();
        await client.query('BEGIN');
        await appendRunEventTx(client, {
          runId,
          kind: 'actor_hello',
          actor,
          payload: helloPayload,
        });
        await appendRunEventTx(client, {
          runId,
          kind: 'llm_error',
          actor,
          payload: errorPayload,
          hashes: { errorHash },
        });
        await client.query('COMMIT');
      } catch (err) {
        if (client) {
          await client.query('ROLLBACK');
        }
        console.error('[RUN_LLM_GUARDRAIL_LOG_FAILED]', err?.message || err);
      } finally {
        if (client) {
          client.release();
        }
      }
      return res.status(429).json({ error: 'real_rate_limited' });
    }
  }

  const audit = {
    mode,
    realConfirmed,
    costEstimateUsd,
    costCapUsd,
    rateLimit,
  };
  const requestPayload = buildRequestPayload({
    runId,
    profile,
    traceId,
    input,
    promptEnvelope,
    audit,
  });
  const inputHash = adapter.hashJson(requestPayload.request);

  let client;
  try {
    client = await getClient();
    await client.query('BEGIN');
    await appendRunEventTx(client, {
      runId,
      kind: 'actor_hello',
      actor,
      payload: helloPayload,
    });
    await appendRunEventTx(client, {
      runId,
      kind: 'llm_request',
      actor,
      payload: requestPayload,
      hashes: { inputHash },
    });
    await client.query('COMMIT');
  } catch (err) {
    if (client) {
      await client.query('ROLLBACK');
    }
    console.error('[RUN_LLM_REQUEST_ERROR]', err?.message || err);
    return res.status(500).json({ error: 'llm_request_failed' });
  } finally {
    if (client) {
      client.release();
    }
  }

  let result;
  try {
    result = await adapter.runOnce({ runId, promptEnvelope, profile, input, traceId });
  } catch (err) {
    const errorPayload = {
      runId,
      provider: profile.provider,
      model: profile.default_model,
      profile: profile.name,
      traceId,
      error: {
        message: err?.message || 'llm_failed',
        code: err?.code || null,
      },
    };
    const errorHash = adapter.hashJson(errorPayload.error);
    try {
      client = await getClient();
      await client.query('BEGIN');
      await appendRunEventTx(client, {
        runId,
        kind: 'llm_error',
        actor,
        payload: errorPayload,
        hashes: { errorHash },
      });
      await client.query('COMMIT');
    } catch (innerErr) {
      if (client) {
        await client.query('ROLLBACK');
      }
      console.error('[RUN_LLM_ERROR_EVENT_FAILED]', innerErr?.message || innerErr);
    } finally {
      if (client) {
        client.release();
      }
    }
    return res.status(502).json({ error: 'llm_error', message: err?.message || 'LLM failed.' });
  }

  const responsePayload = {
    runId,
    provider: profile.provider,
    model: profile.default_model,
    profile: profile.name,
    traceId,
    response: {
      text: result.text,
      meta: result.meta || null,
    },
  };
  const outputHash = adapter.hashJson(responsePayload.response);

  try {
    client = await getClient();
    await client.query('BEGIN');
    await appendRunEventTx(client, {
      runId,
      kind: 'llm_response',
      actor,
      payload: responsePayload,
      hashes: { outputHash },
    });
    await client.query('COMMIT');
  } catch (err) {
    if (client) {
      await client.query('ROLLBACK');
    }
    console.error('[RUN_LLM_RESPONSE_ERROR]', err?.message || err);
    return res.status(500).json({ error: 'llm_response_failed' });
  } finally {
    if (client) {
      client.release();
    }
  }

  res.json({
    ok: true,
    runId,
    provider: profile.provider,
    model: profile.default_model,
    profile: profile.name,
    traceId,
    text: result.text,
    hashes: { inputHash, outputHash },
  });
});

router.post('/:runId/snapshot', requireUser, async (req, res, next) => {
  try {
    const workspaceId = getWorkspaceId(req);
    if (!workspaceId) {
      return res.status(403).json({ error: 'workspace_not_bound' });
    }
    const runId = req.params.runId;
    const run = await getRun(runId);
    if (!run || run.workspace_id !== workspaceId) {
      return res.status(404).json({ error: 'run_not_found' });
    }

    const events = await listRunEvents(runId, { limit: 5000 });
    const snapshot = {
      run,
      events,
      createdAt: new Date().toISOString(),
    };

    const filename = `snapshot.${Date.now()}.json`;
    const file = await writeJsonArtifact({
      baseDir: ARTIFACTS_DIR,
      workspaceId: run.workspace_id,
      runId,
      filename,
      jsonObj: snapshot,
    });
    const storageKeyCandidate = path.relative(ARTIFACTS_DIR, file.uri);
    const storageKey =
      storageKeyCandidate && !storageKeyCandidate.startsWith('..')
        ? storageKeyCandidate
        : file.uri;
    const createdBy = req.userEmail || req.user?.email || 'system';
    const storageProvider = process.env.ARTIFACTS_STORAGE_PROVIDER || 'local';

    const artifactId = await createArtifact({
      workspaceId: run.workspace_id,
      clientId: run.client_id || null,
      runId,
      kind: 'snapshot',
      name: filename,
      contentType: file.contentType,
      uri: file.uri,
      sha256Hex: file.sha256,
      bytes: file.bytes,
      storageProvider,
      storageKey,
      createdBy,
    });

    res.json({ ok: true, artifactId, uri: file.uri, sha256: file.sha256 });
  } catch (err) {
    next(err);
  }
});

export default router;
