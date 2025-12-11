# Roadmap

## Q1 — Stabilize
- Finish governance documentation (milestones M0-M3).  
- Harden the portal chat with guardrails against trolling and multi-language misalignment.  
- Document engagement tiers for Business, Agency, DevOps.

## Q2 — Expand Knowledge & Automation
- Publish knowledge-base ingestion guidelines (M4) and extend to include legal/privacy/faq expansions.  
- Create sample workflows for Business automation, Agency reporting, and DevOps automation in `/app/static-pages` knowledge base.  
- Align with Camarad backend telemetry so we can reuse analytics for future AWB/Camarad clients.

## Q3 — Token Economy & Payment
- Implement Stripe/test environment for paying per token/consultation (M5).  
- Automate rate-limiting tied to budgets and notify Andy when usage thresholds are reached.  
- Introduce a monthly summary review that feeds into the `summaries` docs.

## Q4 — Enterprise Readiness & Monitoring
- Harden deployment under PM2/GCP, add monitoring to DevOps routes, fine-tune model selection logic.  
- Evaluate migrating chat logic to Camarad's AWB orchestrator once proven stable.  
- Document ongoing support agreements and transcripts for high-value clients.
