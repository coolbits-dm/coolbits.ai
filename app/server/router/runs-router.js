import express from 'express';
import { requireUser } from '../middleware/auth.js';
import { getUserByEmail } from '../userStore.js';
import { resolvePayloadAttachments } from '../services/payloadService.js';
import { createRunPreview, consumeRunPreview } from '../services/runPreviewService.js';
import { PRICING_VERSION, FX_VERSION } from '../config/pricingConfig.js';
import { assertWorkspaceAccess } from '../services/workspaceService.js';

const router = express.Router();

function getWorkspaceId(req) {
  const candidate = req.body?.workspaceId || req.query?.workspaceId || req.workspaceId || 'business';
  return String(candidate || 'business').trim() || 'business';
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

    const requestedWorkspaceId = getWorkspaceId(req);
    const planId = user.planId || user.plan_id || null;
    const capabilities = Array.isArray(user.workspacesAllowed)
      ? { workspacesAllowed: user.workspacesAllowed }
      : null;
    const workspace = await assertWorkspaceAccess({
      ownerId: user.id || user.email,
      workspaceId: requestedWorkspaceId,
      planId,
      capabilities,
    });
    const workspaceId = workspace.id;
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

    const requestedWorkspaceId = getWorkspaceId(req);
    const planId = user.planId || user.plan_id || null;
    const capabilities = Array.isArray(user.workspacesAllowed)
      ? { workspacesAllowed: user.workspacesAllowed }
      : null;
    const workspace = await assertWorkspaceAccess({
      ownerId: user.id || user.email,
      workspaceId: requestedWorkspaceId,
      planId,
      capabilities,
    });
    const workspaceId = workspace.id;
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

export default router;
