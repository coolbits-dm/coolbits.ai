import express from 'express';
import { handleUltimateCampaignPlan } from '../vertex/vertex-controller.js';

const router = express.Router();

router.post('/campaign-plan', async (req, res) => {
  const result = await handleUltimateCampaignPlan(req);
  res.status(result.status).json(result.body);
});

export default router;
