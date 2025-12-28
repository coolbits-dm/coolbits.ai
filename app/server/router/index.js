import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import chatRouter from './chat-router.js';
import profileRouter from './profile-router.js';
import reasoningRouter from './reasoning-router.js';
import vertexRouter from './vertex-router.js';
import billingRouter from './billing-router.js';
import authRouter from './auth-router.js';
import accountRouter from './account-router.js';
import projectRouter from './project-router.js';
import pricingRouter from './pricing-router.js';
import chatsRouter from './chats-router.js';
import payloadsRouter from './payloads-router.js';
import runsRouter from './runs-router.js';
import userRouter from './user-router.js';
import agentsRouter from './agents-router.js';
import analyticsRouter from './analytics-router.js';
import ppcRouter from './ppc-router.js';
import briefsRouter from './briefs-router.js';
import adminRouter from './admin-router.js';
import devAdsRouter from './dev-ads-router.js';
import councilRouter from './council-router.js';
import workspaceServiceRouter from './workspaceServiceRouter.js';
import contactRouter from './contact-router.js';
import googleAdsRouter from './googleads-router.js';
import ga4Router from './ga4-router.js';
import { classifyMessage } from './intent-router.js';
import { getSuggestions } from './suggestions.js';

const router = express.Router();

router.use((req, _res, next) => { console.log('[ROUTER]', req.method, req.originalUrl); next(); });
const PAGES_ROOT = path.resolve(process.cwd(), 'app', 'pages');
const SUPPORTED_LANGUAGES = ['en', 'ro', 'es', 'fr', 'de'];

function detectLanguage(req) {
  const candidate = (req.body?.language || req.query?.language || '').toLowerCase();
  const header = (req.headers['accept-language'] || '').toLowerCase();
  const tokens = [candidate, ...header.split(',')];
  for (const token of tokens) {
    const code = token.trim().slice(0, 2);
    if (SUPPORTED_LANGUAGES.includes(code)) {
      return code;
    }
  }
  return 'en';
}

router.use('/chat', chatRouter);
router.use('/chats', chatsRouter);
router.use('/payloads', payloadsRouter);
router.use('/runs', runsRouter);
router.use('/profile', profileRouter);
router.use('/reasoning', reasoningRouter);
router.use('/ultimate', vertexRouter);
router.use('/agents', agentsRouter);
router.use('/analytics', analyticsRouter);
router.use('/ppc', ppcRouter);
router.use('/briefs', briefsRouter);
router.use('/admin', adminRouter);
router.use('/dev/ads', devAdsRouter);
router.use('/councils', councilRouter);
router.use('/', workspaceServiceRouter);
router.use('/contact', contactRouter);
router.use('/connectors/googleads', googleAdsRouter);
router.use('/connectors/ga4', ga4Router);
// Billing routes already enforce auth within billing-router; mount without extra middleware here to use the same logic as /auth.
router.use('/billing', billingRouter);
router.use('/auth', authRouter);
router.use('/account', accountRouter);
router.use('/projects', projectRouter);
router.use('/pricing', pricingRouter);
router.use('/', userRouter);

router.get('/suggestions', (req, res) => {
  const language = detectLanguage(req);
  res.json({ language, suggestions: getSuggestions(language) });
});

router.post('/intent', (req, res) => {
  const text = String(req.body?.message || '').trim();
  const classification = classifyMessage(text);
  res.json({
    intent: classification.intent,
    redirectMessage: classification.redirectMessage,
    systemPromptPreview: classification.systemPrompt?.slice(0, 200),
  });
});

router.get('/pages/:section', async (req, res) => {
  const section = String(req.params.section || '').replace(/[^a-z0-9_-]/gi, '');
  if (!section) {
    return res.status(400).json({ error: 'Section required' });
  }
  const target = path.join(PAGES_ROOT, section, 'index.md');
  if (!target.startsWith(PAGES_ROOT)) {
    return res.status(404).json({ error: 'Not found' });
  }
  try {
    const payload = await fs.readFile(target, 'utf8');
    res.json({ section, content: payload });
  } catch (err) {
    res.status(404).json({ error: 'Page not found' });
  }
});

export default router;
