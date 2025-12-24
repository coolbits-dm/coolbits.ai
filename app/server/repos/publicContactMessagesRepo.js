import { query } from '../db.js';

export async function countRecentByIp({ ip, windowSeconds = 600 }) {
  const normalizedIp = typeof ip === 'string' ? ip.trim() : '';
  if (!normalizedIp) return 0;
  const seconds = Math.max(60, Math.min(86400, Number(windowSeconds) || 600));

  const result = await query(
    `
    SELECT COUNT(*)::int AS count
    FROM public_contact_messages
    WHERE ip = $1
      AND created_at >= (NOW() - ($2 * INTERVAL '1 second'))
    `,
    [normalizedIp.slice(0, 128), seconds],
  );

  return Number(result.rows?.[0]?.count) || 0;
}

export async function createContactMessage({ name, email, message, ip, userAgent, referrer }) {
  const result = await query(
    `
    INSERT INTO public_contact_messages (
      name,
      email,
      message,
      ip,
      user_agent,
      referrer
    )
    VALUES ($1,$2,$3,$4,$5,$6)
    RETURNING id, created_at
    `,
    [
      name || null,
      email,
      message,
      ip || null,
      userAgent || null,
      referrer || null,
    ],
  );

  const row = result.rows?.[0] || null;
  return row ? { id: row.id, createdAt: row.created_at } : null;
}

export default {
  countRecentByIp,
  createContactMessage,
};

