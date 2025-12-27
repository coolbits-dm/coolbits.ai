import express from 'express';
import fs from 'node:fs';
import { requireUser } from '../middleware/auth.js';
import { getUserByEmail } from '../userStore.js';
import {
  initiateArtifact,
  getArtifact,
  uploadArtifactStream,
  completeArtifact,
  getDownloadStream,
} from '../services/artifactService.js';

const router = express.Router();

function getWorkspaceId(req) {
  const candidate = req.body?.workspaceId || req.query?.workspaceId || req.workspaceId || 'business';
  return String(candidate || 'business').trim() || 'business';
}

function respondError(res, err) {
  const status = err?.status || 400;
  const code = err?.code || 'artifact_error';
  const message = err?.message || 'Artifact request failed.';
  return res.status(status).json({ error: code, message });
}

router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  next();
});

router.post('/initiate', requireUser, async (req, res) => {
  try {
    const user = await getUserByEmail(req.userEmail || req.user?.email);
    if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });

    const workspaceId = getWorkspaceId(req);
    const { name, contentType, bytes, sha256 } = req.body || {};

    const result = await initiateArtifact({
      workspaceId,
      userId: user.id || user.email,
      name,
      contentType,
      bytes,
      sha256,
    });

    return res.status(201).json({
      artifactId: result.artifactId,
      uploadUrl: result.uploadPath,
    });
  } catch (err) {
    return respondError(res, err);
  }
});

router.put('/:id/upload', requireUser, async (req, res) => {
  try {
    const user = await getUserByEmail(req.userEmail || req.user?.email);
    if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });

    const workspaceId = getWorkspaceId(req);
    const id = req.params.id;

    const contentLength = req.headers['content-length'] ? Number(req.headers['content-length']) : null;
    const result = await uploadArtifactStream({
      workspaceId,
      id,
      stream: req,
      contentLength,
    });

    return res.json({ ok: true, bytes: result.bytes, sha256: result.sha256 });
  } catch (err) {
    return respondError(res, err);
  }
});

router.post('/:id/complete', requireUser, async (req, res) => {
  try {
    const user = await getUserByEmail(req.userEmail || req.user?.email);
    if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });

    const workspaceId = getWorkspaceId(req);
    const id = req.params.id;

    const artifact = await completeArtifact({ workspaceId, id });
    return res.json({ artifact });
  } catch (err) {
    return respondError(res, err);
  }
});

router.get('/:id', requireUser, async (req, res) => {
  try {
    const user = await getUserByEmail(req.userEmail || req.user?.email);
    if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });

    const workspaceId = getWorkspaceId(req);
    const id = req.params.id;
    const artifact = await getArtifact({ workspaceId, id });
    if (!artifact) return res.status(404).json({ error: 'artifact_not_found' });
    return res.json({ artifact });
  } catch (err) {
    return respondError(res, err);
  }
});

router.get('/:id/download', requireUser, async (req, res) => {
  try {
    const user = await getUserByEmail(req.userEmail || req.user?.email);
    if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });

    const workspaceId = getWorkspaceId(req);
    const id = req.params.id;
    const { artifact, filePath, stat } = await getDownloadStream({ workspaceId, id });

    const total = stat.size;
    const range = req.headers.range;

    res.set('Accept-Ranges', 'bytes');
    res.set('Content-Type', artifact.contentType || 'application/octet-stream');
    res.set('X-Content-Type-Options', 'nosniff');

    const safeName = artifact.name ? artifact.name.replace(/[/\\]/g, '') : null;
    const disposition = safeName ? `inline; filename="${safeName}"` : 'inline';
    res.set('Content-Disposition', disposition);

    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) {
        res.status(416).set('Content-Range', `bytes */${total}`).end();
        return;
      }
      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end = match[2] ? parseInt(match[2], 10) : total - 1;
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= total) {
        res.status(416).set('Content-Range', `bytes */${total}`).end();
        return;
      }
      const chunkSize = end - start + 1;
      res.status(206);
      res.set('Content-Length', chunkSize);
      res.set('Content-Range', `bytes ${start}-${end}/${total}`);
      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }

    res.status(200);
    res.set('Content-Length', total);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    return respondError(res, err);
  }
});

export default router;
