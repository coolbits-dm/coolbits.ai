# CoolBits.ai - AI-Powered Business Intelligence Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.8+](https://img.shields.io/badge/python-3.8+-blue.svg)](https://www.python.org/downloads/)
[![Node.js 18+](https://img.shields.io/badge/node.js-18+-green.svg)](https://nodejs.org/)

## 🚀 Overview

CoolBits.ai is a comprehensive AI-powered business intelligence platform that integrates multiple AI agents (oGPT, oGrok, oCursor, oPython) to provide intelligent automation, RAG-powered insights, and multi-domain business solutions.

## 🏗️ Architecture

### Core Components
- **Multi-Agent System**: Coordinated AI agents for different business functions
- **RAG Infrastructure**: Retrieval-Augmented Generation with vector databases
- **Business Intelligence**: Industry-specific analytics and reporting
- **API Integration**: Seamless connectivity with major AI providers
- **Security Layer**: SafeNet integration for enterprise-grade security

### Technology Stack
- **Backend**: Python 3.8+, FastAPI, SQLAlchemy
- **Frontend**: Next.js, React, TypeScript
- **Database**: PostgreSQL with pgvector extension
- **AI/ML**: OpenAI, xAI, Google Vertex AI, Meta AI
- **Infrastructure**: Google Cloud Platform, Docker
- **Development**: Windows 11 local development environment

## 🤖 AI Agents

| Agent | Role | Description |
|-------|------|-------------|
| **oGPT** | OpenAI Integration | Handles OpenAI API interactions and GPT model management |
| **oGrok** | xAI Integration | Manages xAI Grok model interactions and processing |
| **oCursor** | Development Assistant | AI-powered code development and debugging |
| **oPython** | Python Specialist | Python development, optimization, and best practices |
| **oGit** | Version Control | Git workflow management and repository policies |

## 📁 Project Structure

```
coolbits.ai/
├── app/                    # Next.js application
├── cblm/                   # Corporate Business Logic Management
├── agents/                 # AI agent implementations
├── components/             # React components
├── lib/                    # Shared libraries and utilities
├── panels/                 # Admin and management panels
├── safenet/                # Security and compliance modules
├── team-updates/           # Team documentation and updates
├── infra/                  # Infrastructure configurations
└── docs/                   # Documentation and guides
```

## 🚀 Quick Start

### Prerequisites
- Python 3.8+
- Node.js 18+
- PostgreSQL with pgvector
- Google Cloud SDK
- Windows 11 (recommended)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/coolbits-dm/coolbits.ai.git
   cd coolbits.ai
   ```

2. **Setup Python environment**
   ```bash
   python -m venv venv
   venv\Scripts\activate  # Windows
   pip install -r requirements.txt
   ```

3. **Setup Node.js dependencies**
   ```bash
   npm install
   ```

4. **Configure environment variables**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your API keys and configurations
   ```

5. **Initialize database**
   ```bash
   python setup_rag_system.py
   ```

6. **Start development servers**
   ```bash
   # Start Python backend
   python coolbits_main_dashboard.py
   
   # Start Next.js frontend (in another terminal)
   npm run dev
   ```

## 🔧 Configuration

### API Keys Setup
The platform integrates with multiple AI providers. Configure your API keys in the environment variables:

- `OPENAI_API_KEY`: OpenAI API access
- `XAI_API_KEY`: xAI Grok API access
- `GOOGLE_CLOUD_PROJECT`: Google Cloud project ID
- `VERTEX_AI_LOCATION`: Vertex AI region

### RAG System Configuration
Configure your RAG infrastructure using the provided scripts:
```bash
# Setup Vertex AI RAG
python create_vertex_ai_rag.py

# Create industry-specific corpora
python create_rag_corpora_python.py
```

### GitHub Actions oCL Exec Workflow
To execute privileged Google Cloud operations from GitHub Actions without storing JSON keys, the repository ships with the `.github/workflows/oclexec.yml` workflow. The checklist below is the full execution roadmap for @oCL so every run follows the same audited pathway.

1. **Pre-flight validation**
   - Confirm Cloud Billing is active and Cloud Tasks quotas look healthy:
     ```bash
     gcloud beta billing projects describe coolbits-ai --format="value(billingEnabled)"
     gcloud beta services quota metrics list --project=coolbits-ai \
       --filter="metric:cloudtasks.googleapis.com/*" --limit=50
     ```
   - Fetch the latest Cloud Run revision and verify the `/api/v1/task-hook` endpoint is reachable (add an IAP token if the load balancer enforces IAP):
     ```bash
     REGION=europe-west3
     SVC=andy-gateway
     gcloud run services describe $SVC --region $REGION \
       --format="value(status.url,status.conditions[].message)"
     curl -sS -D- "$(gcloud run services describe $SVC --region $REGION \
       --format='value(status.url)')/api/v1/task-hook" | head -n 20
     ```

2. **Configure GitHub secrets**
   - `GCP_WIF_PROVIDER`: `projects/271190369805/locations/global/workloadIdentityPools/gh-pool/providers/gh-provider`
   - `GCP_SA_EMAIL`: `o-runner@coolbits-ai.iam.gserviceaccount.com`

   These values correspond to the Workload Identity Federation pool (`gh-pool`), provider (`gh-provider`), and the automation service account `o-runner` that already has `cloudtasks.enqueuer`, `run.invoker`, and `iap.httpsResourceAccessor` roles.

3. **Queue and IAM posture**
   - Check the current bindings for the automation service account and attach any missing roles:
     ```bash
     PROJECT=coolbits-ai
     REGION=europe-west3
     SA=o-runner@$PROJECT.iam.gserviceaccount.com
     gcloud projects get-iam-policy $PROJECT --flatten="bindings[].members" \
       --filter="bindings.members:$SA" --format="table(bindings.role)"
     for ROLE in roles/cloudtasks.enqueuer roles/run.invoker roles/iap.httpsResourceAccessor; do
       gcloud projects add-iam-policy-binding $PROJECT \
         --member="serviceAccount:$SA" --role="$ROLE"
     done
     gcloud run services add-iam-policy-binding andy-gateway \
       --region=$REGION --member="serviceAccount:$SA" --role="roles/run.invoker"
     ```
   - Ensure the target queue exists and inspect rate limits before handing control to the workflow:
     ```bash
     QUEUE=ogpt-default-queue
     gcloud tasks queues list --location=$REGION --project=$PROJECT
     gcloud tasks queues create $QUEUE --location=$REGION --project=$PROJECT || true
     gcloud tasks queues describe $QUEUE --location=$REGION --project=$PROJECT \
       --format="yaml(state,rateLimits,retryConfig,httpTarget)"
     ```
     Save the YAML describe output—you will attach a snippet of it when sharing evidence with stakeholders.

4. **Run validation actions (capture evidence)**
   - Navigate to **Actions → oCL Exec → Run workflow**.
   - Trigger the workflow three times with the following inputs to confirm each stage:
     1. `action=iam-queue-invoker` (ensures IAM bindings are in place).
     2. `action=create-queue`, `args=ogpt-default-queue` (creates or verifies the Cloud Tasks queue in `europe-west3`). When the job prints the `gcloud tasks queues describe` YAML, copy the snippet and save it for your evidence bundle.
     3. `action=ping-task` (enqueues a test task targeting the `andy-gateway` Cloud Run service at `/api/v1/task-hook`).
        The workflow resolves the Cloud Run URL and exports `TASK_PROJECT`, `TASK_REGION`, `TASK_QUEUE`, and `TASK_URL`
        so the helper script creates the Cloud Task against the intended resources. Capture the emitted task name from the logs for later reference.
        
        | Variable | Meaning |
        |----------|---------|
        | `TASK_PROJECT` | Google Cloud project that owns the queue (`coolbits-ai`). |
        | `TASK_REGION`  | Cloud Tasks region supplied via the workflow dispatch (default `europe-west3`). |
        | `TASK_QUEUE`   | Queue name resolved from the workflow input (`ogpt-default-queue` unless overridden). |
        | `TASK_URL`     | Fully qualified Cloud Run URL for the `/api/v1/task-hook` endpoint. |
   - After each dispatch, copy the GitHub Actions run URL (e.g., `https://github.com/coolbits-dm/coolbits.ai/actions/runs/<id>`) or download the logs so stakeholders can confirm the automation actually executed; drop these links into the final evidence bundle.

5. **Post-run verification, evidence & troubleshooting**
   - Confirm the workflow emitted a task name and review Cloud Run logs for a matching request (include the relevant log lines in the evidence bundle):
     ```bash
     gcloud run logs read --region=$REGION --service=andy-gateway --limit=200
     ```
   - Double-check that Cloud Tasks shows the recently created task (and that it was delivered) before closing the session:
     ```bash
     gcloud tasks tasks list --queue=$QUEUE --location=$REGION --project=$PROJECT --limit=5
     ```
   - Assemble an evidence package containing:
     - The GitHub Actions run URLs (or exported logs) for each dispatch.
     - A snippet from the queue describe or task list command above showing the most recent entries.
     - The Cloud Run log snippet proving `/api/v1/task-hook` executed.
     Share this bundle with @Andrei/@oCC so they can see the task completed end-to-end.
   - If the workflow fails, download the Action logs, verify the queue state, and re-check IAM bindings.
   - For IAP-protected services, supply a signed IAP JWT or use the direct Cloud Run URL exposed in the workflow logs.

## 📊 Features

### Business Intelligence
- Industry-specific analytics
- Real-time data processing
- Automated reporting
- Cost optimization monitoring

### AI Agent Management
- Multi-agent coordination
- Role-based access control
- Performance monitoring
- Automated scaling

### Security & Compliance
- SafeNet integration
- Enterprise-grade security
- Audit logging
- Compliance reporting

## 🤝 Contributing

We welcome contributions from the development team. Please follow our Git workflow:

1. **Branch Naming**: Use descriptive branch names with prefixes:
   - `feature/`: New features
   - `fix/`: Bug fixes
   - `refactor/`: Code refactoring
   - `docs/`: Documentation updates

2. **Commit Messages**: Follow conventional commit format:
   ```
   type(scope): description
   
   Examples:
   feat(agents): add oGPT integration
   fix(rag): resolve vector indexing issue
   docs(readme): update installation guide
   ```

3. **Pull Requests**: All changes must go through pull request review

## 📋 Development Guidelines

### Code Standards
- **Python**: Follow PEP 8, use type hints
- **TypeScript**: Use strict mode, proper interfaces
- **Git**: Conventional commits, meaningful messages
- **Documentation**: Keep README and code comments updated

### Testing
```bash
# Run Python tests
python -m pytest tests/

# Run TypeScript tests
npm test
```

## 🔒 Security

- All API keys are managed through secure environment variables
- SafeNet integration provides enterprise-grade security
- Regular security audits and compliance checks
- Encrypted communication channels

## 📞 Support

For technical support and questions:
- **Internal Team**: Use the multi-agent chat panel
- **Documentation**: Check the `/docs` directory
- **Issues**: Create GitHub issues for bugs and feature requests

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🏢 Company Information

**CoolBits SRL** - AI-Powered Business Solutions
- **Website**: [coolbits.ai](https://coolbits.ai)
- **Email**: office@coolbits.ai
- **Location**: Romania

---

*Built with ❤️ by the CoolBits.ai development team*
