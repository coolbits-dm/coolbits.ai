# Chat Frontend – Canonical Source

## Canonical UI

The **canonical chat UI for coolbits.ai** is:

- **Repo**: `/opt/coolbits.ai`
- **Paths**:
  - `public/chat.html`
  - `public/assets/chat.js`
  - `public/assets/style.css`
  - Matching files under `deploy/` (build/mirror of `public/`)

All production UI work for the chat (connectors, Business Pulse, Billing UI, Prompt Meter, council UI, etc.) MUST be done here.

The Node/Express backend serves this static frontend.

## Cloudflare Pages frontend

There is a separate Cloudflare Pages repo that contains a copy/variant of the chat UI.

- Status: **mirror / legacy**.
- Rule: Do NOT deploy it as the main chat UI unless it has been explicitly synced from the canonical source above.
- Any experimental work done there must be ported back into `/opt/coolbits.ai/public` before going live.

## Guardrails for future changes

When using AI/coding assistants on this repo:

### Backend-only tasks

For **backend-only** work (APIs, billing, council, connectors logic):

- Allowed scope: `app/server/**`
- Forbidden scope: `public/**`, `deploy/**`

Prompt guideline:

> Work only on backend code under `app/server/**`.  
> Do not modify anything under `public/` or `deploy/` (HTML, JS, CSS, static assets).

### Frontend-only tasks

For **frontend/UI** work (chat shell, agents, Prompt Meter, Billing UI, connectors UI):

- Allowed scope:
  - `public/chat.html`
  - `public/assets/chat.js`
  - `public/assets/style.css`
  - Matching files under `deploy/`
- Forbidden scope: `app/server/**`

Prompt guideline:

> You may modify `public/chat.html`, `public/assets/chat.js`, and `public/assets/style.css` (and matching files under `deploy/`).  
> Do not touch any code under `app/server/**`.

## Summary

- **Source of truth** for the chat UI is `/opt/coolbits.ai/public`.
- Cloudflare Pages chat is non-canonical and must not diverge silently.
- Use the guardrail prompts above to keep backend and frontend changes separated.
