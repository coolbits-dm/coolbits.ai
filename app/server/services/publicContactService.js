import crypto from 'node:crypto';
import fetch from 'node-fetch';
import { logError } from '../logger.js';
import { countRecentByIp, createContactMessage } from '../repos/publicContactMessagesRepo.js';

const EMAIL_RATE_WINDOW_MS = 60 * 60 * 1000;
const EMAIL_RATE_LIMIT = 5;
const IP_RATE_LIMIT = 10;

const emailRateState = new Map();
let emailRateSweepCounter = 0;

function clampNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function sanitizeText(value, maxLen, { allowNewlines = false } = {}) {
  const raw = typeof value === 'string' ? value : '';
  let out = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Strip ASCII control chars except tab/newline.
  out = out.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  if (!allowNewlines) {
    out = out.replace(/\n+/g, ' ');
  }
  out = out.trim();
  if (typeof maxLen === 'number' && maxLen > 0) {
    out = out.slice(0, maxLen);
  }
  return out;
}

function sanitizeHeaderValue(value, maxLen) {
  return sanitizeText(value, maxLen, { allowNewlines: false }).replace(/[\r\n]+/g, ' ').trim();
}

function stableHash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function getClientIp(req) {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf.trim()) return cf.trim();

  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim();
  }

  return (req.ip || req.socket?.remoteAddress || '').toString();
}

function isValidEmail(value) {
  const email = (value || '').toString().trim();
  if (!email) return false;
  if (email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function recordAndCheckEmailRateLimit(email) {
  emailRateSweepCounter += 1;
  const now = Date.now();
  const threshold = now - EMAIL_RATE_WINDOW_MS;

  if (emailRateSweepCounter % 200 === 0) {
    for (const [key, timestamps] of emailRateState.entries()) {
      const recent = Array.isArray(timestamps) ? timestamps.filter((t) => t >= threshold) : [];
      if (!recent.length) {
        emailRateState.delete(key);
      } else {
        emailRateState.set(key, recent);
      }
    }
  }

  const key = stableHash(email.toLowerCase());
  const timestamps = emailRateState.get(key) || [];
  const recent = Array.isArray(timestamps) ? timestamps.filter((t) => t >= threshold) : [];
  if (recent.length >= EMAIL_RATE_LIMIT) {
    emailRateState.set(key, recent);
    return true;
  }
  recent.push(now);
  emailRateState.set(key, recent);
  return false;
}

async function verifyTurnstile({ token, remoteIp }) {
  const secret = process.env.TURNSTILE_SECRET_KEY || '';
  if (!secret) {
    return { ok: false, reason: 'missing_secret' };
  }

  try {
    const body = new URLSearchParams();
    body.set('secret', secret);
    body.set('response', token);
    if (remoteIp) body.set('remoteip', remoteIp);

    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const json = await resp.json().catch(() => null);
    const success = Boolean(json && json.success === true);
    return { ok: success, reason: success ? null : 'verification_failed' };
  } catch (_err) {
    return { ok: false, reason: 'network_error' };
  }
}

function smtpConfig() {
  const host = sanitizeHeaderValue(process.env.SMTP_HOST || '', 200);
  const port = clampNumber(process.env.SMTP_PORT || 587, 1, 65535);
  const user = sanitizeHeaderValue(process.env.SMTP_USER || '', 400);
  const pass = String(process.env.SMTP_PASS || '');
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';

  if (!host || !user || !pass) {
    return null;
  }

  return { host, port, user, pass, secure };
}

let cachedTransportPromise = null;

async function getMailTransport() {
  const cfg = smtpConfig();
  if (!cfg) return null;

  if (!cachedTransportPromise) {
    cachedTransportPromise = (async () => {
      const mod = await import('nodemailer').catch(() => null);
      const nodemailer = mod && (mod.default || mod);
      if (!nodemailer || typeof nodemailer.createTransport !== 'function') {
        return null;
      }
      return nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        auth: { user: cfg.user, pass: cfg.pass },
      });
    })();
  }

  return cachedTransportPromise;
}

async function sendContactEmail({ requestId, name, email, company, website, message }) {
  const transport = await getMailTransport();
  if (!transport) {
    return { ok: false, error: 'mail_not_configured' };
  }

  const recipient = sanitizeHeaderValue(process.env.CONTACT_RECIPIENT || 'office@coolbits.ai', 254);
  const from = sanitizeHeaderValue(process.env.CONTACT_FROM || '', 254);

  if (!recipient || !from) {
    return { ok: false, error: 'mail_not_configured' };
  }

  const safeCompany = sanitizeHeaderValue(company || '', 140);
  const safeEmail = sanitizeHeaderValue(email || '', 254);
  const subject = sanitizeHeaderValue(`CoolBits Contact: ${safeCompany || safeEmail}`, 180);

  const lines = [];
  if (name) lines.push(`Name: ${name}`);
  lines.push(`Email: ${email}`);
  if (company) lines.push(`Company: ${company}`);
  if (website) lines.push(`Website: ${website}`);
  lines.push('');
  lines.push('Message:');
  lines.push(message);

  try {
    await transport.sendMail({
      to: recipient,
      from,
      replyTo: safeEmail || sanitizeHeaderValue(process.env.CONTACT_REPLY_TO || recipient, 254),
      subject,
      text: lines.join('\n'),
      headers: {
        'X-Source': 'coolbits.ai/contact',
        'X-Request-Id': requestId,
      },
    });
    return { ok: true };
  } catch (err) {
    logError(new Error(`[CONTACT] reqId=${requestId} mail_send_failed code=${sanitizeHeaderValue(err?.code || 'unknown', 64)}`));
    return { ok: false, error: 'mail_send_failed' };
  }
}

export async function handlePublicContact(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const requestId = crypto.randomUUID ? crypto.randomUUID() : `contact-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const hp = sanitizeText(req.body?.hp, 200);
  if (hp) {
    console.log(`[CONTACT] reqId=${requestId} outcome=honeypot`);
    return res.json({ ok: true });
  }

  const name = sanitizeText(req.body?.name, 200);
  const company = sanitizeText(req.body?.company, 200);
  const website = sanitizeText(req.body?.website, 200);
  const email = sanitizeText(req.body?.email, 254);
  const message = sanitizeText(req.body?.message, 4000, { allowNewlines: true });
  const turnstileToken = sanitizeText(req.body?.turnstileToken, 4000);

  if (!turnstileToken) {
    console.log(`[CONTACT] reqId=${requestId} outcome=captcha_missing`);
    return res.status(400).json({ ok: false, error: 'captcha_failed' });
  }

  if (!isValidEmail(email) || message.length < 10) {
    console.log(`[CONTACT] reqId=${requestId} outcome=invalid_input`);
    return res.status(400).json({ ok: false, error: 'invalid_input' });
  }

  const ip = sanitizeText(getClientIp(req), 128);

  try {
    if (ip) {
      const recent = await countRecentByIp({ ip, windowSeconds: 60 * 60 });
      if (recent >= IP_RATE_LIMIT) {
        console.log(`[CONTACT] reqId=${requestId} outcome=rate_limited`);
        return res.status(429).json({ ok: false, error: 'rate_limited' });
      }
    }

    if (recordAndCheckEmailRateLimit(email)) {
      console.log(`[CONTACT] reqId=${requestId} outcome=rate_limited_email`);
      return res.status(429).json({ ok: false, error: 'rate_limited' });
    }

    const turnstile = await verifyTurnstile({ token: turnstileToken, remoteIp: ip || null });
    if (!turnstile.ok) {
      console.log(`[CONTACT] reqId=${requestId} outcome=captcha_failed`);
      return res.status(400).json({ ok: false, error: 'captcha_failed' });
    }

    const userAgent = sanitizeText(req.headers['user-agent'], 512);
    const referrer = sanitizeText(req.headers['referer'] || req.headers['referrer'], 800);

    const created = await createContactMessage({
      name,
      email,
      message,
      ip: ip || null,
      userAgent: userAgent || null,
      referrer: referrer || null,
    });

    const mail = await sendContactEmail({
      requestId,
      name,
      email,
      company,
      website,
      message,
    });

    if (!mail.ok) {
      console.log(`[CONTACT] reqId=${requestId} outcome=${mail.error || 'mail_send_failed'} messageId=${created?.id || 'none'}`);
      const status = mail.error === 'mail_not_configured' ? 503 : 502;
      return res.status(status).json({ ok: false, error: mail.error || 'mail_send_failed' });
    }

    console.log(`[CONTACT] reqId=${requestId} outcome=ok messageId=${created?.id || 'none'}`);
    return res.json({ ok: true });
  } catch (err) {
    logError(new Error(`[CONTACT] reqId=${requestId} error=internal`));
    logError(err);
    return res.status(500).json({ ok: false, error: 'mail_send_failed' });
  }
}
