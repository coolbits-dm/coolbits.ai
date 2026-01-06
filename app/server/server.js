import 'dotenv/config';
import express from 'express';
import cors from './middleware/cors.js';
import router from './router/index.js';
import canonRouter from './router/canon-router.js';
import metricsRouter from './routers/metrics-router.js';
import { logRequest, logError } from './logger.js';
import stripeWebhookRouter from './router/stripe-webhook-router.js';

console.log('[COOLBITS_BOOT]', import.meta.url);

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
  console.log('[COOLBITS_REQUEST]', req.method, req.originalUrl);
  res.on('finish', () => console.log('[COOLBITS_REQUEST_DONE]', req.originalUrl, res.statusCode));
  logRequest(req);
  next();
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});
app.get('/healthz', (req, res) => {
  res.json({ ok: true });
});

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
