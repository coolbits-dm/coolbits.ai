# Monthly Summary

## November 2025
- Cleaned the VPS, rebuilt `/opt/coolbits.ai` and `/opt/cblm`, and created AWB-inspired progress documentation.  
- Defined Andy’s persona, the disclaimer policy, and the triple-layer service pillars.  
- Rolled out system prompts, the router/suggestions/chat stack, milestone records, and planning docs.  
- PM2 now runs the Express gateway, and we are poised to add Stripe/token economy (M5) and Camarad future merge notes.

## Risks & Mitigations
| Risk | Mitigation |
| --- | --- |
| Jailbreak attempts | Intent router redirects to the nuclear prompt and triggers anti-spam responses. |
| Unauthorized deployment changes | PM2 ensures restarts only from `ecosystem.config.cjs` and `npm install` is gated. |
| Lack of documentation discipline | AWB-style notes and summaries track progress and decisions weekly/monthly. |
