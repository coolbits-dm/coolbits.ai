# Infrastructure Plan

## Environment
- Hosts: VPS at cloud.cblm.ai with planned migration to AWB/Cloud Run for high scale.  
- Deployment: `pm2` running `app/server/server.js`, controlled via `ecosystem.config.cjs`.  
- Runtime: Node 20+ (ESM), environment variables for `OPENAI_API_KEY`, `PORT`, etc.

## Services
- **Express + Body-{Parser}:** handles JSON, ensures `/health` returns status.  
- **OpenAI Proxy:** uses `fetch` for `/v1/chat/completions` and respects token economy.  
- **Static Assets:** served from `/public/assets` with minimal caching.  

## Observability & Security
- PM2 logs forwarded; `pm2 flush` used during release cycles following AWB doc style.  
- Rate limiting implemented in conversation planning; anti-spam flows redirect to `suggestions`.  
- Multi-language UI ensures `CORS` is limited and `Andy` disclaimers are appended in responses.

## Resilience
- Future plan: integrate Camarad logging pipeline, TF scripts for infra provisioning, and additional backups.  
- Token economy uses budget watchers; alerts go to Slack/email (documented separately).  
- All doc files mention Andy’s human oversight and disclaimers to reassure governance.
