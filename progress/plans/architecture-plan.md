# Architecture Plan

## System Layers
1. **Portal UI:** Static landing plus `/app/portal` chat interface; suggestions guide queries toward the three services.
2. **Express Gateway:** `/app/server/server.js` proxies `/api/chat` to `handleChat`, includes CORS for CoolBits domains only.
3. **Intent Router:** `intent-router.js` determines Business/Agency/DevOps/Out-of-scope routes and enforces the `coolbits-*` prompts.
4. **OpenAI Proxy:** `chat.js` selects models (gpt-4.1-mini, gpt-4.1, gpt-5.1) based on intent, sanitizes conversation history, adds disclaimers.
5. **Knowledge Base:** Markdown files act as RAG-like sources for Business, Agency, DevOps, and FAQs.
6. **Observability & PM2:** `ecosystem.config.cjs` manages restarts; logs are monitored via `pm2 logs coolbits` and forwarded via Camarad logging plans.

## Data Flow
- User message → portal → `/api/chat` POST → `handleChat`.
- Intent classification feeds prompts and model selection.  
- Responses appended with disclaimer and suggestions, ensuring Andy’s persona stays consistent.
- Future integration: forward sanitized transcripts to Camarad logging stack for replay and governance.

## Safety & Filtering
- Out-of-scope / jailbreak tries trigger redirect message defined in `coolbits-core`.  
- Multi-language detection is handled by `suggestions.js`, but responses always mirror the user’s language with a professional tone.
- The `config.disclaimer` ensures transparency and human oversight.
