import express from 'express';
import payloadsRouter from './payloads-router.js';
import runsRouter from './runs-router.js';

const router = express.Router();

router.use('/payloads', payloadsRouter);
router.use('/runs', runsRouter);

export default router;
