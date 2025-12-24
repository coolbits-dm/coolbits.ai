import express from 'express';
import { handlePublicContact } from '../services/publicContactService.js';

const router = express.Router();

router.get('/contact-config', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || null,
  });
});

router.post('/contact', handlePublicContact);

export default router;
