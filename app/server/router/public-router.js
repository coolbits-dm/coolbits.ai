import express from 'express';
import { listAgents as listCbAgents } from '../config/cbAgents.js';
import { listCouncils } from '../config/councils.js';
import { handlePublicContact } from '../services/publicContactService.js';

const router = express.Router();

router.get('/contact-config', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || null,
  });
});

router.get('/agents-registry', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const councilMap = new Map();
  listCouncils().forEach((council) => {
    const slug = council?.slug || council?.id;
    if (!slug) return;
    const members = Array.isArray(council.agents) ? council.agents : [];
    members.forEach((agentId) => {
      if (!agentId) return;
      const list = councilMap.get(agentId) || [];
      list.push(slug);
      councilMap.set(agentId, list);
    });
  });
  const agents = listCbAgents().map((agent) => ({
    id: agent.id,
    label: agent.label,
    role: agent.role || '',
    model: agent.model || '',
    enabled: Boolean(agent.enabled),
    shortTag: agent.shortTag || '',
    canApplyChanges: Boolean(agent.canApplyChanges),
    councils: councilMap.get(agent.id) || [],
  }));
  res.json({ agents });
});

router.post('/contact', handlePublicContact);

export default router;
