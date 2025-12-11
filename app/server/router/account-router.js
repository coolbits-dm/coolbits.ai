import express from 'express';
import { requireUser } from '../middleware/auth.js';
import { getUserByEmail } from '../userStore.js';
import { PLANS } from '../config/plans.js';

const router = express.Router();

router.get('/usage', requireUser, async (req, res) => {
  try {
    const user = await getUserByEmail(req.userEmail);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const plan = PLANS[user.planId] || PLANS.STARTER_FREE;
    const charge = plan.chargePerMessage || Number(process.env.CHAT_TOKEN_CHARGE) || 25;
    const showLowBalanceBanner =
      !plan.isPaid && (user.tokensRemaining || 0) < charge * 5;
    return res.json({
      email: user.email,
      planId: user.planId,
      planLabel: user.planLabel || plan.label,
      tokensRemaining: user.tokensRemaining,
      totalUsed: user.totalUsed || 0,
      emailVerified: Boolean(user.emailVerified),
      emailVerifiedAt: user.emailVerifiedAt || null,
      canRequestVerification: !user.emailVerified,
      showLowBalanceBanner,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Usage lookup failed' });
  }
});

export default router;
