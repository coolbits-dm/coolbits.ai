# Contact Form

`/contact` submits to `POST /api/contact` and uses Cloudflare Turnstile (invisible) for abuse prevention.

## Required environment variables

Turnstile:

- `TURNSTILE_SITE_KEY` (public, sent to the browser via `GET /api/public/contact-config`)
- `TURNSTILE_SECRET_KEY` (server-only)

Email routing:

- `CONTACT_RECIPIENT` (fixed recipient, e.g. `office@coolbits.ai`)
- `CONTACT_FROM` (SMTP sender, e.g. `no-reply@coolbits.ai`)
- `CONTACT_REPLY_TO` (fallback reply-to; user email is used when valid)

SMTP:

- `SMTP_HOST`
- `SMTP_PORT` (e.g. `587`)
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_SECURE` (`true` for TLS-on-connect, `false` for STARTTLS)

## Error codes

`POST /api/contact` returns stable JSON codes:

- `captcha_failed`
- `rate_limited`
- `invalid_input`
- `mail_not_configured`
- `mail_send_failed`

