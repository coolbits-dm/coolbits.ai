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
