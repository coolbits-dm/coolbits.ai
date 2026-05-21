# camarad.ai

**Self-hostable AI platform for marketing agencies and Google Ads managers.**

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/Node.js-ESM-green.svg)
![Self-hostable](https://img.shields.io/badge/Self--hostable-Yes-black.svg)

---

## What is this?

`camarad.ai` is an open-source, self-hostable AI platform for marketing agencies, PPC teams, and Google Ads managers who need operational intelligence across real advertising accounts.

It connects to Google Ads manager accounts, Google Analytics 4, internal workspaces, PostgreSQL, and multiple LLM providers to generate structured marketing analysis, campaign diagnostics, and actionable recommendations.

This is **not** a generic ChatGPT wrapper.

The platform is designed around real account data, connector state, workspace context, and deterministic intelligence modules such as Search Terms, Waste Finder, ROAS Leaders, and Conversion Efficiency. AI agents operate on top of these modules and scenarios instead of guessing from free-form prompts.

### What makes it different

- Works with real Google Ads MCC / manager account data.
- Supports multiple client accounts and workspaces.
- Uses structured intelligence modules before invoking LLMs.
- Supports multiple LLM providers instead of being locked to one vendor.
- Designed for self-hosting, agency operations, and developer extension.
- Ships with documented environment configuration via `.env.example`.

---

## Features

- Google Ads API integration with MCC / manager account access.
- Google Analytics 4 connector.
- Multi-workspace architecture.
- Authentication system.
- Connector-based data access.
- PostgreSQL-backed local persistence.
- AI agent scenarios, including Google Ads audit workflows.
- Search Terms intelligence module.
- Waste Finder module for spend leakage analysis.
- ROAS Leaders module for performance ranking.
- Conversion Efficiency module.
- Multi-provider LLM dispatch:
  - OpenAI
  - Anthropic
  - xAI
  - Vertex AI, optional
- Express.js backend using ESM.
- Cloudflare Pages-compatible frontend deployment.
- PM2-ready VPS deployment.
- MIT licensed.

---

## Quick Start: Self-hosting

### 1. Clone the repository

```bash
git clone <your-repository-url>
cd <repository-folder>
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create your environment file

```bash
cp .env.example .env
```

Edit `.env` and configure the required keys. See the Configuration section below.

### 4. Prepare PostgreSQL

```bash
createdb <database_name>
```

Apply migrations using the migration files included in the repository.

### 5. Run the backend

```bash
npm start
```

The Express backend runs on port 8788 by default.

### 6. Deploy the frontend

The frontend is compatible with Cloudflare Pages. Use the build process configured in the repository.

---

## Configuration

Full list in `.env.example`. Minimum required:

| Variable | Required | Purpose |
|---|---|---|
| DATABASE | Yes | PostgreSQL connection string |
| SECRET_KEY | Yes | Session and auth signing secret |
| PORT | Yes | Backend HTTP port, default 8788 |
| OPENAI_API_KEY | If OpenAI enabled | OpenAI provider key |
| ANTHROPIC_API_KEY | If Anthropic enabled | Anthropic provider key |
| XAI_API_KEY | If xAI enabled | xAI provider key |
| GOOGLE_ADS_CLIENT_ID | Google Ads | OAuth client ID |
| GOOGLE_ADS_CLIENT_SECRET | Google Ads | OAuth client secret |
| GOOGLE_ADS_DEVELOPER_TOKEN | Google Ads | Developer token |
| GOOGLE_ADS_LOGIN_CUSTOMER_ID | MCC access | Manager account customer ID |
| GOOGLE_ADS_REDIRECT_URI | Google OAuth | OAuth callback URL |
| GOOGLE_ADS_SCOPES | Google OAuth | OAuth scopes |
| STRIPE_SECRET_KEY | If billing enabled | Stripe secret key |
| STRIPE_WEBHOOK_SECRET | If Stripe webhooks enabled | Webhook signing secret |

Do not commit `.env` files or production secrets.

---

## Architecture
Browser / Frontend
|
v
Cloudflare Pages / Static Frontend
|
v
Express.js Backend :8788
|
+--> Auth / Workspace Routers
|
+--> Connector Routers
|       +--> Google Ads API
|       +--> Google Analytics 4
|
+--> Intelligence Modules
|       +--> Search Terms
|       +--> Waste Finder
|       +--> ROAS Leaders
|       +--> Conversion Efficiency
|
+--> AI Agent Scenarios
|       +--> googleAdsAudit
|
+--> LLM Provider Dispatch
|       +--> OpenAI
|       +--> Anthropic
|       +--> xAI
|       +--> Vertex AI (optional)
|
v
PostgreSQL Local Database

---

## LLM Providers

| Provider | Env var | Status |
|---|---|---|
| OpenAI | OPENAI_API_KEY | Primary |
| Anthropic | ANTHROPIC_API_KEY | Supported |
| xAI | XAI_API_KEY | Supported |
| Vertex AI | Google Cloud credentials | Optional |

---

## Google Ads Setup

### 1. Prepare Google Ads API access

- Obtain a Google Ads developer token.
- Identify your manager account customer ID.
GOOGLE_ADS_DEVELOPER_TOKEN=<your-developer-token>
GOOGLE_ADS_LOGIN_CUSTOMER_ID=<your-manager-customer-id>

### 2. Create OAuth credentials in Google Cloud Console

- Enable Google Ads API.
- Configure OAuth consent screen.
- Create OAuth 2.0 Client ID credentials.
- Add your backend callback URL as an authorized redirect URI.
GOOGLE_ADS_CLIENT_ID=<your-client-id>
GOOGLE_ADS_CLIENT_SECRET=<your-client-secret>
GOOGLE_ADS_REDIRECT_URI=<your-callback-url>
GOOGLE_ADS_SCOPES=<required-scopes>

### 3. Connect accounts inside the app

Sign in → Connectors → Google Ads → Connect → Approve OAuth → Confirm accounts are visible.

---

## VPS Deployment

Target: Ubuntu 22.04 LTS, Node.js 20+, PostgreSQL, PM2, Nginx.

```bash
sudo apt update
sudo apt install -y git curl nginx postgresql postgresql-contrib
```

```bash
sudo mkdir -p /opt/camarad
sudo chown -R $USER:$USER /opt/camarad
cd /opt/camarad
git clone <your-repository-url> .
npm install
cp .env.example .env
```

Configure PostgreSQL:

```bash
sudo -u postgres psql
```

```sql
CREATE DATABASE <database_name>;
CREATE USER <database_user> WITH PASSWORD '<strong_password>';
GRANT ALL PRIVILEGES ON DATABASE <database_name> TO <database_user>;
```

Start with PM2:

```bash
npm install -g pm2
pm2 start <entrypoint-file> --name camarad
pm2 save
pm2 startup
```

Nginx proxy pattern for API:

```nginx
server {
    server_name <your-domain>;

    location /api/ {
        proxy_pass http://127.0.0.1:8788$request_uri;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        root <frontend-build-directory>;
        try_files $uri $uri/ /index.html;
    }
}
```

---

## Development Notes

- Keep secrets in `.env`, never in source code.
- Use `.env.example` as the documented contract for configuration.
- Keep connector logic separated from intelligence modules.
- Prefer structured account data before invoking LLMs.
- Treat AI agents as scenario executors over real data, not as free-form chat wrappers.
- Keep provider-specific LLM logic behind a dispatch layer.

---

## Contributing

Contributions are welcome.

Good first areas:
- Additional marketing intelligence modules.
- Connector improvements.
- Google Ads reporting workflows.
- GA4 analysis workflows.
- Provider adapters for additional LLMs.
- Documentation improvements.
- Deployment templates.
- Tests around connector and agent behavior.

Workflow: fork → feature branch → focused change → update docs → open pull request.

Do not commit secrets, account exports, tokens, customer data, or production `.env` files.

---

## License

MIT License. See LICENSE for details.
