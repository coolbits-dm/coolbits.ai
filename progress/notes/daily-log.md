# Daily Log

## 2025-11-18
- Rebuilt `/opt` structure and documented progress hierarchy (AWB-style).  
- Replaced knowledge base content with production-level copy covering Business, Agency, DevOps, About, and FAQ.  
- Implemented `intent-router.js`, `suggestions.js`, and `chat.js` with named exports, multi-model selection, and PM2 compatibility.  
- Added disclaimers to every response and created system prompt guardrails for Andy.  
- Flushed PM2 logs and validated there are no import/export failures.  
## 2025-11-19
- Added deterministic CORS middleware, expanded the router surface (`/api/suggestions`, `/api/intent`, `/api/pages/:section`), and added new portal copy pages.  
- Replaced the body-parser dependency with `express.json()`, leveraged global `fetch`, and kept the logs sanitized for public traffic.  
- Published `.env.example` and documented the new handler state inside the design notes.
