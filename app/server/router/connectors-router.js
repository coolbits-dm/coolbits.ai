// Legacy connectors router (Google Ads v1)
// Canonical Ads connector lives in app/server/router/googleads-router.js under /api/connectors/googleads/*
import express from 'express';

const router = express.Router();

router.use((req, res) => {
  console.warn('[GOOGLEADS_V1_DEPRECATED]', { path: req.originalUrl });
  return res.status(410).json({
    error: 'deprecated',
    message: 'Google Ads connector v1 is deprecated. Use /api/connectors/googleads/* instead.',
  });
});

export default router;
