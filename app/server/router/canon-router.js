import express from 'express';
import { loadCanon } from '../../shared/canon/loadCanon.js';

const router = express.Router();

router.get('/', (_req, res) => {
  const { canon, models, canonHash } = loadCanon();
  res.json({ canonHash, canon, models });
});

export default router;
