# Deploy Checklist (Manual Gate)

Run these before any PM2 restart or Cloudflare deploy:

1) Registry guardrail

```
npm run test:registry
```

2) CBPL guardrails

```
node tools/cbpl-guardrails-test.js
```

If either step fails, stop and fix before proceeding with deployment.
