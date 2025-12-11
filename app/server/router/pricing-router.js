import express from 'express';
import { getPublicPricingSheet } from '../config/pricingConfig.js';

const router = express.Router();

// GET /api/pricing/models
router.get('/models', (_req, res) => {
  const sheet = getPublicPricingSheet();
  res.json(sheet);
});

export default router;
