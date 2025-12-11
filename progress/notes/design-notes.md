# Design Notes

## Intent Routing
- Keyword-based heuristics cover Business, Agency, DevOps, About, smalltalk, and out-of-scope attempts.  
- `router/index.js` now exposes `/api/intent` plus guardrail detection for jailbreaks, identity probes, and general irrelevance.
- Redirect message is hard-coded to keep responses aligned with the guardrail mandate.

## Chat Experience
- `handleChat` accepts Express request/response objects, sanitizes history, and chooses the model using either `OPENAI_MODEL` or a lightweight heuristic.
- Multi-language suggestions are included on small talk answers and the `/api/suggestions` endpoint accepts Accept-Language hints.
- Every reply appends the disclaimer stored in `server/config/config.json` so Andy’s human oversight is explicit.

## Routing & Pages
- Added `/api/pages/:section` to serve the markdown content for each portal pillar (business, agency, devops, about) with sanitization.
- `/app/pages` now holds descriptive copy for those sections, matching the portal navigation.

## Observability
- PM2 keeps the Express process alive; `logger.js` records sanitized requests and errors under `/logs` with no sensitive payloads.
