import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import cors from './middleware/cors.js';
import router from './router/index.js';
import canonRouter from './router/canon-router.js';
import metricsRouter from './routers/metrics-router.js';
import { logRequest, logError } from './logger.js';
import stripeWebhookRouter from './router/stripe-webhook-router.js';

console.log('[COOLBITS_BOOT]', import.meta.url);

const BUILD_COMMIT_PATH = '/opt/coolbits.ai/var/build_commit';
const readBuildCommit = () => {
  try {
    const raw = fs.readFileSync(BUILD_COMMIT_PATH, 'utf8');
    const info = {};
    for (const line of raw.split('\n')) {
      if (!line) continue;
      const idx = line.indexOf('=');
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (!key) continue;
      info[key] = value;
    }
    return Object.keys(info).length > 0 ? info : null;
  } catch (err) {
    return null;
  }
};

const app = express();
app.use(
  cors({
    origin: [
      'https://coolbits.ai',
      'https://www.coolbits.ai',
      'https://coolbits-console.pages.dev',
      'https://01087f76.coolbits-console.pages.dev',
      'http://localhost:3000',
      'http://localhost:5173',
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Visitor-Id', 'X-Workspace-Id'],
  }),
);

// Stripe webhook needs raw body
app.use('/api/webhook', stripeWebhookRouter);
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('X-CB-Instance', `${process.pid}@${os.hostname()}`);
  next();
});

app.use((req, res, next) => {
  console.log('[COOLBITS_REQUEST]', req.method, req.originalUrl);
  res.on('finish', () => console.log('[COOLBITS_REQUEST_DONE]', req.originalUrl, res.statusCode));
  logRequest(req);
  next();
});

app.get('/health', (req, res) => {
  res.json({ ok: true, buildCommit: readBuildCommit() });
});
app.get('/healthz', (req, res) => {
  res.json({ ok: true, buildCommit: readBuildCommit() });
});

const redirectTo = (target) => (_req, res) => res.redirect(302, target);

app.get(['/pricing', '/pricing/'], redirectTo('/chat?view=pricing'));
app.get(['/maturity', '/maturity/'], redirectTo('/chat?view=maturity'));
app.get(['/agents', '/agents/'], redirectTo('/chat?view=agents'));
app.get(['/connectors', '/connectors/'], redirectTo('/chat?view=connectors'));
app.get(['/orchestrators', '/orchestrators/'], redirectTo('/chat?view=orchestrators'));

app.use('/api/metrics', metricsRouter);

// All API routes
app.use('/api/canon', canonRouter);
app.use('/api', router);

app.use((err, req, res, next) => {
  logError(err);
  res.status(500).json({ error: 'Internal error' });
});

const PORT = process.env.PORT || 8788;
app.listen(PORT, () => {
  console.log(`CoolBits.ai server running on port ${PORT}`);
});
