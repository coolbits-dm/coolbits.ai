import { marked } from "./vendor/marked.esm.js";
console.log("[CB_CHAT_BUILD]", "ui-canon", new Date().toISOString());
// [CB_BASELINE] cb136

// --- CoolBits auth debug wrapper ---
(() => {
  let authDebugEnabled = false;
  try {
    authDebugEnabled = window.localStorage.getItem("authDebug") === "1";
  } catch (error) {
    authDebugEnabled = false;
  }
  if (!authDebugEnabled || typeof window.fetch !== "function") {
    return;
  }
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const url = args[0];
    const init = args[1] || {};
    const isAuthEndpoint =
      (typeof url === "string" && url.includes("/api/auth/me")) ||
      (url && typeof url.url === "string" && url.url.includes("/api/auth/me"));
    if (!isAuthEndpoint) {
      return originalFetch(...args);
    }
    console.log("[AUTH_DEBUG] request", url, init);
    const response = await originalFetch(...args);
    console.log("[AUTH_DEBUG] status", response.status);
    try {
      const cloned = response.clone();
      const body = await cloned.json();
      console.log("[AUTH_DEBUG] body", body);
    } catch (error) {
      console.log("[AUTH_DEBUG] body", "non-JSON or parse failed");
    }
    return response;
  };
  console.log("[AUTH_DEBUG] enabled");
})();

const historyKey = "coolbits:chat-history";
const VISITOR_KEY = "coolbits:visitor-id";
const SEED_STORE_KEY = "coolbits:last-seed";

// Configuration - can be overridden via window.COOLBITS_CONFIG
const CONFIG = {
  API_BASE_URL: (window.COOLBITS_CONFIG && window.COOLBITS_CONFIG.API_BASE_URL) || '/api',
  USE_MOCK_DATA: (window.COOLBITS_CONFIG && window.COOLBITS_CONFIG.USE_MOCK_DATA) || false,
};

const API_BASE = CONFIG.API_BASE_URL;
const API_CHATS = `${API_BASE}/chats`;
const API_CHAT = `${API_BASE}/chat`;
const API_AUTH_ME = `${API_BASE}/auth/me`;
const API_SUGGESTIONS = `${API_BASE}/suggestions`;
const API_PROFILE = `${API_BASE}/profile`;
const API_REASONING_SESSION = `${API_BASE}/reasoning/session`;
const API_REASONING_STATUS = `${API_BASE}/reasoning/status`;
const API_CAMPAIGN_PLAN = `${API_BASE}/ultimate/campaign-plan`;
const API_BILLING_UPGRADE = `${API_BASE}/billing/upgrade`;
const API_BILLING_DOWNGRADE = `${API_BASE}/billing/downgrade`;
const API_BILLING_SUMMARY = `${API_BASE}/billing/summary`;
const API_AGENTS_REGISTRY = `${API_BASE}/agents/registry`;
const API_AGENTS_RUN = `${API_BASE}/agents/run`;
const API_CONTEXT_ACTIVE = `${API_BASE}/context/active`;
const API_CONTEXT_ACTIVATE = `${API_BASE}/context/activate`;
const API_PAYLOADS = `${API_BASE}/payloads`;
const PUBLIC_AGENTS_REGISTRY_URL = "/api/public/agents-registry";
const API_AUTH_GOOGLE_START = `${API_BASE}/auth/google/start`;
const API_PROJECTS = `${API_BASE}/projects`;

const CURRENCY_SYMBOLS = {
  EUR: "€",
  USD: "$",
  RON: "RON",
};

const PLAN_DEFINITIONS = {
  starter: {
    code: "starter",
    label: "Starter",
    price: 29,
    currency: "EUR",
    trialDays: 15,
    workspaces: "Business workspace",
    workspacesCount: 1,
    projects: 3,
    agents: 5,
    connectors: 5,
    tokensPerMonth: 150000,
  },
  agency: {
    code: "agency",
    label: "Agency",
    price: 79,
    currency: "EUR",
    trialDays: 15,
    workspaces: "Business + Agency workspaces",
    workspacesCount: 2,
    projects: 6,
    agents: 10,
    connectors: 5,
    tokensPerMonth: 500000,
  },
  dev: {
    code: "dev",
    label: "Developer",
    price: 79,
    currency: "EUR",
    trialDays: 15,
    workspaces: "Business + Dev workspaces",
    workspacesCount: 2,
    projects: 6,
    agents: 10,
    connectors: 5,
    tokensPerMonth: 600000,
  },
  enterprise: {
    code: "enterprise",
    label: "Enterprise",
    price: 199,
    currency: "EUR",
    trialDays: null,
    workspaces: "All workspaces",
    workspacesCount: "all",
    projects: 12,
    agents: "all",
    connectors: 10,
    tokensPerMonth: 2000000,
  },
};

const PLAN_CODES = Object.keys(PLAN_DEFINITIONS);

const CONNECTOR_CATEGORIES = [
  { id: "personal", label: "Personal connectors" },
  { id: "business", label: "Business connectors" },
  { id: "agency", label: "Agency connectors" },
  { id: "dev", label: "Developer connectors" },
];

const CONNECTORS_CONFIG = [
  {
    key: "google_docs",
    label: "Google Docs",
    category: "personal",
    status: "coming_soon",
    description: "Capture docs, notes, and meeting summaries from Google Docs.",
    icon: "docs",
  },
  {
    key: "gmail",
    label: "Gmail",
    category: "personal",
    status: "coming_soon",
    description: "Sync inbox signals and follow-ups from Gmail.",
    icon: "gmail",
  },
  {
    key: "google_calendar",
    label: "Google Calendar",
    category: "personal",
    status: "coming_soon",
    description: "Track schedule focus blocks, meetings, and habit cadence.",
    icon: "gcal",
  },
  {
    key: "notion",
    label: "Notion",
    category: "personal",
    status: "coming_soon",
    description: "Pull personal knowledge base, tasks, and daily notes from Notion.",
    icon: "notion",
  },
  {
    key: "todoist",
    label: "Todoist",
    category: "personal",
    status: "coming_soon",
    description: "Measure task completion velocity and planning rhythm from Todoist.",
    icon: "todoist",
  },
  {
    key: "googleads",
    label: "Google Ads",
    category: "business",
    status: "unknown",
    description: "Sync spend, conversions, and audiences from your core Google Ads accounts.",
    icon: "google_ads",
    agentKeys: ["ceo", "cmo", "ppc_lead"],
    supportsAuth: true,
    apiBase: "/api/connectors/googleads",
  },
  {
    key: "ga4",
    label: "Google Analytics 4",
    category: "business",
    status: "unknown",
    description: "Pull conversion events and funnel metrics from GA4 properties.",
    icon: "ga4",
    agentKeys: ["ceo", "cmo", "ppc_lead", "seo_lead"],
    supportsAuth: true,
    apiBase: "/api/connectors/ga4",
  },
  {
    key: "meta_ads",
    label: "Meta Ads",
    category: "business",
    status: "coming_soon",
    description: "Review paid social performance and audiences from Meta Ads.",
    icon: "meta",
    agentKeys: ["cmo", "ppc_lead"],
  },
  {
    key: "tiktok_ads",
    label: "TikTok Ads",
    category: "business",
    status: "coming_soon",
    description: "Centralize TikTok Ads reporting and budget pacing.",
    icon: "tiktok",
    agentKeys: ["cmo", "ppc_lead"],
  },
  {
    key: "linkedin_ads",
    label: "LinkedIn Ads",
    category: "business",
    status: "coming_soon",
    description: "Track B2B campaign reach and lead generation performance.",
    icon: "linkedin",
    agentKeys: ["ceo", "cmo", "ppc_lead", "seo_lead"],
  },
  {
    key: "google_ads_mcc",
    label: "Google Ads MCC",
    category: "agency",
    status: "coming_soon",
    description: "Manage multiple client ad accounts via MCC linking in one place.",
    icon: "mcc",
    agentKeys: ["agency_lead", "ppc_lead"],
  },
  {
    key: "ga4_multi_property",
    label: "GA4 multi-property",
    category: "agency",
    status: "coming_soon",
    description: "Aggregate analytics across several GA4 properties in a single view.",
    icon: "ga4",
    agentKeys: ["agency_lead", "seo_lead"],
  },
  {
    key: "meta_business_agency",
    label: "Meta Business / Agency",
    category: "agency",
    status: "coming_soon",
    description: "Agency-grade access and governance across Meta Business portfolios.",
    icon: "meta",
    agentKeys: ["agency_lead", "ppc_lead"],
  },
  {
    key: "tiktok_business_center",
    label: "TikTok Business Center",
    category: "agency",
    status: "coming_soon",
    description: "Coordinate TikTok assets and permissions through Business Center.",
    icon: "tiktok",
    agentKeys: ["agency_lead", "ppc_lead"],
  },
  {
    key: "linkedin_agency",
    label: "LinkedIn Agency",
    category: "agency",
    status: "coming_soon",
    description: "Operate client LinkedIn Ads from a unified agency workspace.",
    icon: "linkedin",
    agentKeys: ["agency_lead", "ppc_lead", "seo_lead"],
  },
  {
    key: "git",
    label: "Git (GitHub/GitLab)",
    category: "dev",
    status: "coming_soon",
    description: "Connect repos to track deployments and pull request signals.",
    icon: "git",
    agentKeys: ["cto", "dev_architect"],
  },
  {
    key: "google_cloud",
    label: "Google Cloud (Cloud Run / Logs)",
    category: "dev",
    status: "coming_soon",
    description: "Inspect Cloud Run services and centralize log visibility.",
    icon: "gcp",
    agentKeys: ["cto", "dev_architect"],
  },
  {
    key: "stripe",
    label: "Stripe",
    category: "dev",
    status: "coming_soon",
    description: "Pull Stripe revenue, subscriptions, and invoice telemetry.",
    icon: "stripe",
    agentKeys: ["ceo", "cfo", "dev_architect"],
  },
  {
    key: "tracking_debugger",
    label: "Tracking Debugger",
    category: "dev",
    status: "coming_soon",
    description: "QA pixels and events with a live debugger feed.",
    icon: "debug",
    agentKeys: ["cmo", "seo_lead", "dev_architect"],
  },
  {
    key: "error_event_stream",
    label: "Error & Event Stream",
    category: "dev",
    status: "coming_soon",
    description: "Stream errors and product events into CoolBits for triage.",
    icon: "errors",
    agentKeys: ["cto", "dev_architect"],
  },
];

const CONNECTOR_STATUS_LABELS = {
  available: "Available",
  planned: "Planned",
  connected: "Connected",
  disconnected: "Not connected",
  unknown: "Unknown",
  error: "Error",
  coming_soon: "Coming soon",
  not_planned: "Not available",
};

const cbConnectorState = {
  googleads: {
    status: "unknown",
    customerId: null,
    lastSyncAt: null,
    lastError: null,
    customerName: null,
  },
  ga4: {
    status: "unknown",
    propertyId: null,
    lastSyncAt: null,
    lastError: null,
    properties: [],
  },
};

const cbCouncilPerformanceState = {
  loaded: false,
  loading: false,
  error: null,
  summary: null,
  range: "billing_period",
};

const cbPromptMeterState = {
  tokensBase: 0,
  tokensEffective: 0,
  pctOfPlan: 0,
  pctAfterSend: 0,
  sizeClass: "xs",
  outcomeHint: "General reasoning",
};

const cbPublicAgentsRegistryState = {
  loaded: false,
  loading: false,
  items: [],
  byId: new Map(),
};

const cbNormalizeAgentWorkspace = (workspaceId) => {
  if (!workspaceId) return "business";
  const key = workspaceId.toString().toLowerCase();
  if (key === "dev" || key === "developer") return "developer";
  return key;
};

const cbSlugifyText = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const cbNormalizeAgentLabel = (label) => {
  const raw = String(label || "");
  const trimmed = raw.split(" – ")[0].split(" - ")[0];
  return trimmed.trim();
};

const cbEncodeAgentNameSegment = (value) =>
  encodeURIComponent(String(value || "").trim().replace(/\s+/g, "-"));

const cbRegistryWorkspacePrefix = (workspaceId) => {
  const normalized = cbNormalizeAgentWorkspace(workspaceId);
  if (normalized === "business") return "-B-";
  if (normalized === "agency") return "-A-";
  if (normalized === "developer") return "-D-";
  if (normalized === "personal") return "-P-";
  return "";
};

const cbEnsurePublicAgentsRegistry = async () => {
  if (cbPublicAgentsRegistryState.loading || cbPublicAgentsRegistryState.loaded) {
    return cbPublicAgentsRegistryState;
  }
  cbPublicAgentsRegistryState.loading = true;
  try {
    const res = await fetch(PUBLIC_AGENTS_REGISTRY_URL, { cache: "no-store" });
    if (!res.ok) {
      throw new Error("registry_unavailable");
    }
    const data = await res.json().catch(() => ({}));
    const list = Array.isArray(data?.agents) ? data.agents : [];
    cbPublicAgentsRegistryState.items = list;
    cbPublicAgentsRegistryState.byId = new Map(list.map((agent) => [agent.id, agent]));
    cbPublicAgentsRegistryState.loaded = true;
  } catch (error) {
    cbPublicAgentsRegistryState.loaded = false;
    cbPublicAgentsRegistryState.items = [];
    cbPublicAgentsRegistryState.byId = new Map();
  } finally {
    cbPublicAgentsRegistryState.loading = false;
  }
  return cbPublicAgentsRegistryState;
};

const cbResolvePublicRegistryAgent = (agent) => {
  if (!cbPublicAgentsRegistryState.loaded) {
    return null;
  }
  if (agent?.cbAgentId && cbPublicAgentsRegistryState.byId.has(agent.cbAgentId)) {
    return cbPublicAgentsRegistryState.byId.get(agent.cbAgentId) || null;
  }
  const label = cbNormalizeAgentLabel(agent?.label || agent?.key);
  if (!label) return null;
  const slugLabel = cbSlugifyText(label);
  const prefix = cbRegistryWorkspacePrefix(agent?.workspace);
  return (
    cbPublicAgentsRegistryState.items.find((item) => {
      if (!item || !item.id || !item.label) return false;
      if (prefix && !item.id.includes(prefix)) return false;
      return cbSlugifyText(item.label) === slugLabel;
    }) || null
  );
};

const cbBuildCouncilAgentProfile = (agent, registryAgent = null) => {
  const registry = registryAgent || cbResolvePublicRegistryAgent(agent);
  const workspaceSlug = cbNormalizeAgentWorkspace(agent?.workspace);
  const label = cbNormalizeAgentLabel(registry?.label || agent?.label || agent?.key || "Agent");
  const roleSlug = cbSlugifyText(registry?.label || label);
  const agentId = registry?.id || agent?.cbAgentId || null;
  return {
    agentId,
    workspaceSlug,
    roleSlug,
    defaultName: label,
    summary: registry?.role || agent?.shortDescription || "",
  };
};

const CB_COUNCIL_PREVIEW_SAMPLES = {
  business: [
    "Review quarterly KPIs and flag risks.",
    "Outline growth experiments for next month.",
    "Summarize priorities for the next 30 days.",
  ],
  agency: [
    "Audit paid media performance and next steps.",
    "Draft a cross-channel optimization plan.",
    "Identify GA4 tracking gaps and fixes.",
  ],
  developer: [
    "Assess infra risks before a release.",
    "Outline an API integration plan.",
    "Summarize reliability guardrails.",
  ],
};

const cbBuildCouncilHoverPreview = (agent, registryAgent = null) => {
  const workspace = cbNormalizeAgentWorkspace(agent?.workspace);
  const summary =
    (registryAgent && registryAgent.role) || agent?.shortDescription || "";
  const samples = CB_COUNCIL_PREVIEW_SAMPLES[workspace] || [];
  if (!summary && !samples.length) return "";
  const lines = [];
  if (summary) lines.push(summary);
  if (samples.length) {
    lines.push("Samples:");
    samples.slice(0, 3).forEach((sample) => {
      lines.push(`- ${sample}`);
    });
  }
  return lines.join("\n");
};

const cbGetWorkspaceLabel = (workspaceId) => {
  const normalized = cbNormalizeAgentWorkspace(workspaceId);
  const match =
    (Array.isArray(cbWorkspaces) &&
      cbWorkspaces.find((ws) => cbNormalizeAgentWorkspace(ws.id) === normalized)) ||
    null;
  if (match) return match.label;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const cbFindAgentByKey = (agentKey, workspaceId = null) => {
  if (!agentKey) return null;
  const normalizedWorkspace = workspaceId ? cbNormalizeAgentWorkspace(workspaceId) : null;
  return (
    AGENTS_CONFIG.find(
      (agent) =>
        agent &&
        agent.key === agentKey &&
        (!normalizedWorkspace || cbNormalizeAgentWorkspace(agent.workspace) === normalizedWorkspace)
    ) ||
    AGENTS_CONFIG.find((agent) => agent && agent.key === agentKey) ||
    null
  );
};

const cbGetAgentsForWorkspace = (workspaceId) => {
  const normalized = cbNormalizeAgentWorkspace(workspaceId || cbCurrentWorkspaceId);
  const scoped = AGENTS_CONFIG.filter(
    (agent) => cbNormalizeAgentWorkspace(agent.workspace) === normalized
  );
  return scoped.length ? scoped : AGENTS_CONFIG.slice();
};

const cbResolveConnectorByKey = (connectorKey) =>
  CONNECTORS_CONFIG.find((item) => item && item.key === connectorKey);

const cbGetConnectorsForAgent = (agent) => {
  if (!agent) return [];
  return (agent.connectors || [])
    .map((key) => cbResolveConnectorByKey(key))
    .filter(Boolean);
};

const cbGetAgentsForConnector = (connectorKey) =>
  AGENTS_CONFIG.filter(
    (agent) =>
      Array.isArray(agent.connectors) &&
      agent.connectors.includes(connectorKey)
  );

const cbBuildMockUsageRows = (agent) => {
  const label = agent?.label || "Agent";
  return [
    { lastRun: "Today 09:20", source: `${label} playground`, tokens: "3,200" },
    { lastRun: "Yesterday 18:05", source: "Inbox triage", tokens: "1,450" },
    { lastRun: "2 days ago", source: "Campaign brief", tokens: "2,780" },
  ];
};

const AGENTS_CONFIG = [
  {
    workspace: "business",
    key: "ceo",
    label: "CEO \u2013 Strategy",
    cbAgentId: "cbAgent-B-001-ceo",
    shortDescription: "Executive view on priorities, ROI, and trade-offs.",
    connectors: [],
    showInCouncil: true,
  },
  {
    workspace: "business",
    key: "cmo",
    label: "CMO \u2013 Growth",
    cbAgentId: "cbAgent-B-007-cmo",
    shortDescription: "Acquisition, paid media, and performance marketing (Google Ads, Meta, etc.).",
    connectors: ["googleads", "meta_ads", "tiktok_ads", "linkedin_ads", "ga4", "tracking_debugger"],
    showInCouncil: true,
  },
  {
    workspace: "business",
    key: "cfo",
    label: "CFO \u2013 Finance",
    cbAgentId: "cbAgent-B-003-cfo",
    shortDescription: "Budgets, forecasts, and performance guardrails.",
    connectors: ["stripe", "googleads"],
    showInCouncil: true,
  },
  {
    workspace: "business",
    key: "coo",
    label: "COO \u2013 Ops",
    cbAgentId: "cbAgent-B-004-coo",
    shortDescription: "Execution, processes, and cross-team alignment.",
    connectors: ["ga4", "google_ads_mcc"],
    showInCouncil: true,
  },
  {
    workspace: "business",
    key: "cto",
    label: "CTO \u2013 Tech",
    cbAgentId: "cbAgent-B-002-cto",
    shortDescription: "Architecture, delivery, and technical risk.",
    connectors: ["git", "google_cloud", "error_event_stream"],
    showInCouncil: true,
  },
  {
    workspace: "agency",
    key: "agency_lead",
    label: "Agency Lead",
    shortDescription: "Multi-client governance and performance alignment.",
    connectors: ["google_ads_mcc", "ga4_multi_property", "meta_business_agency", "tiktok_business_center", "linkedin_agency"],
    showInCouncil: false,
  },
  {
    workspace: "agency",
    key: "ppc_lead",
    label: "PPC Lead",
    shortDescription: "Paid media performance across networks.",
    connectors: ["googleads", "google_ads_mcc", "meta_ads", "tiktok_ads", "linkedin_ads"],
    showInCouncil: false,
  },
  {
    workspace: "business",
    key: "seo_lead",
    label: "SEO Lead",
    shortDescription: "Organic growth, content, and technical SEO.",
    connectors: ["ga4", "tracking_debugger"],
    showInCouncil: false,
  },
  {
    workspace: "developer",
    key: "dev_architect",
    label: "Dev Architect",
    shortDescription: "Systems design, observability, and reliability.",
    connectors: ["git", "google_cloud", "error_event_stream", "stripe"],
    showInCouncil: false,
  },
];

const CB_COUNCIL_MEMBERS = [
  {
    id: "ceo_strategy",
    label: "CEO Strategy",
    shortLabel: "CEO",
    description: "Executive perspective & strategy",
  },
  {
    id: "cto_tech",
    label: "CTO Tech",
    shortLabel: "CTO",
    description: "Architecture, delivery and technical risk",
  },
  {
    id: "cfo_finance",
    label: "CFO Finance",
    shortLabel: "CFO",
    description: "Costs, ROI, pricing and budgets",
  },
  {
    id: "cmo_growth",
    label: "CMO Growth",
    shortLabel: "CMO",
    description: "Acquisition, funnels and brand",
  },
  {
    id: "coo_ops",
    label: "COO Ops",
    shortLabel: "COO",
    description: "Processes, operations and execution",
  },
];

const CB_COUNCIL_STATUS_IDLE = "idle";
const CB_COUNCIL_STATUS_PENDING = "pending";
const CB_COUNCIL_STATUS_ACK = "ack";
const CB_COUNCIL_STATUS_ERROR = "error";

window.cbCouncilSelectedIds = window.cbCouncilSelectedIds || new Set();
let cbCouncilSelectedIds = window.cbCouncilSelectedIds;
let cbCouncilSendStatus = {};
let cbCouncilEnabled = false;

function cbGetCouncilElements() {
  const wrapper =
    document.getElementById("cb-council-pill") ||
    document.querySelector(".cb-council-pill") ||
    document.querySelector(".cb-council-wrapper");
  const labelEl = wrapper ? wrapper.querySelector(".cb-council-pill-label") : null;
  const countEl = wrapper ? wrapper.querySelector(".cb-council-pill-count") : null;
  return { wrapper, labelEl, countEl };
}

function cbSyncCouncilStateFromLegacy() {
  if (!(window.cbCouncilSelectedIds instanceof Set)) {
    window.cbCouncilSelectedIds = new Set();
  }
  cbCouncilSelectedIds = window.cbCouncilSelectedIds;
  cbCouncilState.selectedKeys = Array.from(cbCouncilSelectedIds);
}

function cbSyncLegacyCouncilFromState() {
  cbCouncilSelectedIds = new Set(cbCouncilState.selectedKeys || []);
  window.cbCouncilSelectedIds = cbCouncilSelectedIds;
  window.cbCouncilArmed = cbCouncilSelectedIds.size > 0;
}

function syncCouncilStateFromUi() {
  const selected = [];
  const toggles = document.querySelectorAll(
    ".cb-council-toggle[data-agent-key], .cb-council-pill-toggle[data-agent-key]"
  );
  toggles.forEach((el) => {
    const key = el.getAttribute("data-agent-key");
    const isSelected =
      el.classList.contains("cb-council-toggle--selected") ||
      el.classList.contains("is-selected") ||
      el.getAttribute("aria-pressed") === "true";
    if (key && isSelected) {
      selected.push(key);
    }
  });

  cbCouncilState.selectedKeys = selected;
  cbSyncLegacyCouncilFromState();

  console.log("[CB_COUNCIL] sync", { ...cbCouncilState });
  cbQueueActivateContextFromUi("council-selection-sync");
}

const cbGetCouncilSummaryLabel = () => {
  const selected = CB_COUNCIL_MEMBERS.filter((m) => cbCouncilSelectedIds.has(m.id));
  if (selected.length === 0) return "Council off";
  const firstLabel =
    selected[0]?.shortLabel || selected[0]?.label || selected[0]?.id || "Council";
  if (selected.length === 1) return firstLabel;
  return `${firstLabel} +${selected.length - 1}`;
};

const cbGetCouncilPrimaryMember = () => {
  const selected = CB_COUNCIL_MEMBERS.filter((m) => cbCouncilSelectedIds.has(m.id));
  return selected[0] || null;
};

const cbGetCouncilExtraCount = () => {
  const primary = cbGetCouncilPrimaryMember();
  if (!primary) return 0;
  return Math.max(0, cbCouncilSelectedIds.size - 1);
};

const cbGetCouncilGlobalStatus = () => {
  const ids = Array.from(cbCouncilSelectedIds);
  if (!ids.length) return CB_COUNCIL_STATUS_IDLE;
  let hasPending = false;
  let hasError = false;
  let hasAck = false;
  ids.forEach((id) => {
    const s = cbCouncilSendStatus[id] || CB_COUNCIL_STATUS_IDLE;
    if (s === CB_COUNCIL_STATUS_PENDING) hasPending = true;
    if (s === CB_COUNCIL_STATUS_ERROR) hasError = true;
    if (s === CB_COUNCIL_STATUS_ACK) hasAck = true;
  });
  if (hasPending) return CB_COUNCIL_STATUS_PENDING;
  if (hasError) return CB_COUNCIL_STATUS_ERROR;
  if (hasAck) return CB_COUNCIL_STATUS_ACK;
  return CB_COUNCIL_STATUS_IDLE;
};

const cbShouldUseCouncil = () => {
  cbSyncCouncilStateFromLegacy();
  const selectedCount = Array.isArray(cbCouncilState.selectedKeys)
    ? cbCouncilState.selectedKeys.length
    : 0;
  return selectedCount > 0;
};

function getCouncilPayload() {
  syncCouncilStateFromUi();
  const selected = Array.isArray(cbCouncilState.selectedKeys) ? cbCouncilState.selectedKeys : [];
  const hasCouncil = selected.length > 0;
  const payload = {};
  if (hasCouncil) {
    payload.agents = selected.slice();
    payload.agentsArmed = true;
  }
  return payload;
}

const cbNormalizeCouncilAxisState = (summary) => {
  const council = summary?.council || {};
  const mode = council.workspace_mode || council.mode || null;
  const byAxis = council.by_axis || council.byAxis || {};
  const axes = ["cbA", "cbB", "cbD", "cbP"];
  const readyByAxis = {};

  axes.forEach((axis) => {
    const value = byAxis[axis];
    readyByAxis[axis] = typeof value === "number" && value > 0 ? value : 0;
  });

  Object.keys(byAxis || {}).forEach((key) => {
    if (readyByAxis[key] === undefined) {
      const value = byAxis[key];
      readyByAxis[key] = typeof value === "number" && value > 0 ? value : 0;
    }
  });

  return { mode, readyByAxis };
};

function bucketCouncilCount(n) {
  if (!n || n <= 0) return 0;
  if (n <= 1) return 1;
  if (n <= 2) return 2;
  if (n <= 4) return 4;
  if (n <= 8) return 8;
  if (n <= 13) return 13;
  if (n <= 21) return 21;
  return 34;
}

// ---- Council pill wiring v2 ----
function cbInitCouncilUI() {
  console.log("[CB_COUNCIL]", "init");
  cbSyncCouncilStateFromLegacy();

  const rows = document.querySelectorAll("[data-council-id]");
  rows.forEach((row) => {
    const id = row.getAttribute("data-council-id");
    const checkbox = row.querySelector(".cb-council-checkbox");
    if (!id || !checkbox) return;

    checkbox.checked = cbCouncilSelectedIds.has(id);

    checkbox.addEventListener("change", function () {
      cbOnCouncilCheckboxChange(id, this.checked);
    });
  });

  // Ensure pill shows correct count/active state
  cbUpdateCouncilPill();
  syncCouncilStateFromUi();
}

function getCouncilModal() {
  return (
    document.getElementById("cb-council-popover") ||
    document.querySelector('[data-role="council-modal"]')
  );
}

function cbOnCouncilToggle(id, checked) {
  // legacy path; delegate to new handler
  cbOnCouncilCheckboxChange(id, checked);
}

function _cbOpenCouncilModalInternal() {
  console.log("[CB_COUNCIL]", "modal open");
  const modalId = "cb-council-popover";
  const modal = getCouncilModal();
  if (!modal) {
    console.warn("[CB_COUNCIL]", "modal not found");
    return;
  }

  if (typeof openModal === "function") {
    openModal(modalId);
  } else {
    modal.classList.add("cb-modal-open");
    modal.setAttribute("aria-hidden", "false");
  }

  const set = window.cbCouncilSelectedIds || new Set();
  window.cbCouncilSelectedIds = set;

  const rows = modal.querySelectorAll("[data-council-id]");
  rows.forEach((row) => {
    const id = row.getAttribute("data-council-id");
    const input = row.querySelector('input[type="checkbox"]');
    if (!id || !input) return;

    input.checked = set.has(id);
    input.onchange = () => {
      cbOnCouncilCheckboxChange(id, input.checked);
    };
  });
}

// expose for inline onclick
window.cbOpenCouncilModal = _cbOpenCouncilModalInternal;

function cbOnCouncilModalClose() {
  console.log("[CB_COUNCIL]", "modal close");
  const modalId = "cb-council-popover";
  const modal = getCouncilModal();
  if (!modal) return;
  if (typeof closeModal === "function") {
    closeModal(modalId, { silentFocus: true });
  } else {
    modal.classList.remove("cb-modal-open");
    modal.setAttribute("aria-hidden", "true");
  }
  syncCouncilStateFromUi();
}

function cbUpdateCouncilPill() {
  const { wrapper, labelEl, countEl } = cbGetCouncilElements();
  if (!wrapper || !labelEl || !countEl) {
    console.warn("[CB_COUNCIL] pill elements missing");
    return;
  }

  const selectedCount = Array.isArray(cbCouncilState.selectedKeys)
    ? cbCouncilState.selectedKeys.length
    : 0;

  cbSyncLegacyCouncilFromState();

  const isActive = selectedCount > 0;
  labelEl.textContent = "Council";
  countEl.textContent = isActive ? ` +${selectedCount}` : "";
  wrapper.setAttribute("aria-pressed", isActive ? "true" : "false");
  wrapper.setAttribute(
    "title",
    isActive
      ? "Council active – selected agents will join this message."
      : "No agents selected"
  );

  wrapper.classList.toggle("cb-council-armed", isActive);
  wrapper.classList.toggle("cb-council-pill--armed", isActive);
  wrapper.classList.toggle("cb-pill-armed-on", isActive);
  
  // Clear any inline styles
  wrapper.style.background = "";
  wrapper.style.boxShadow = "";
  wrapper.style.color = "";
  wrapper.style.transform = "";

  console.log("[CB_COUNCIL] pill update", {
    count: selectedCount,
    active: isActive,
    selected: cbCouncilState.selectedKeys.slice(),
    classes: wrapper.className,
    computed: window.getComputedStyle(wrapper).background
  });
  cbUpdateChatHeader();
}

// --- Council compatibility shim (older callers expect this) ---
function cbSyncCouncilUI() {
  try {
    if (typeof cbUpdateCouncilPill === "function") {
      cbUpdateCouncilPill();
    }
  } catch (err) {
    console.warn("[CB_COUNCIL] cbSyncCouncilUI failed", err);
  }
}
window.cbSyncCouncilUI = cbSyncCouncilUI;

function cbOnCouncilPillClick() {
  cbOpenCouncilModal();
}

// Checkbox change handler (used by inline and legacy)
function cbOnCouncilCheckboxChange(id, checked) {
  cbSyncCouncilStateFromLegacy();

  if (checked) {
    cbCouncilSelectedIds.add(id);
  } else {
    cbCouncilSelectedIds.delete(id);
  }

  cbCouncilState.selectedKeys = Array.from(cbCouncilSelectedIds);
  cbSyncLegacyCouncilFromState();

  cbUpdateCouncilPill();
  syncCouncilStateFromUi();
}

window.cbOnCouncilCheckboxChange = cbOnCouncilCheckboxChange;
window.cbOnCouncilPillClick = cbOnCouncilPillClick;

// CB202: Modern pill toggle function for council panel
function cbToggleCouncilMember(id, buttonElement) {
  cbSyncCouncilStateFromLegacy();

  const wasSelected = cbCouncilSelectedIds.has(id);
  if (wasSelected) {
    cbCouncilSelectedIds.delete(id);
    if (buttonElement) {
      buttonElement.classList.remove('is-selected');
      buttonElement.classList.remove('cb-council-toggle--selected');
      buttonElement.setAttribute('aria-pressed', 'false');
    }
  } else {
    cbCouncilSelectedIds.add(id);
    if (buttonElement) {
      buttonElement.classList.add('is-selected');
      buttonElement.classList.add('cb-council-toggle--selected');
      buttonElement.setAttribute('aria-pressed', 'true');
    }
  }

  cbCouncilState.selectedKeys = Array.from(cbCouncilSelectedIds);

  cbSyncLegacyCouncilFromState();
  cbUpdateCouncilPill();
  syncCouncilStateFromUi();
}

window.cbToggleCouncilMember = cbToggleCouncilMember;
// expose close handler for inline button
window.cbOnCouncilModalClose = cbOnCouncilModalClose;

function cbInitCouncilChip() {
  const chip = document.getElementById("cb-council-chip");
  if (!chip || chip.dataset.bound === "true") return;
  chip.dataset.bound = "true";
  chip.addEventListener("click", (e) => {
    e.stopPropagation();
    cbOnCouncilPillClick();
  });
}

const CB_PLAN_MODAL_SEEN_KEY = "cb_seenPlanModal";
const cbPlanModalState = {
  loading: false,
  error: null,
  summary: null,
  source: "menu",
  highlightPlan: null,
};
const cbPlanUpgradeLoading = {};
const cbAgentsState = {
  registry: [],
  registryLoaded: false,
  registryLoading: false,
  selectedScenarioId: "",
  initialized: false,
  running: false,
  lastResult: null,
};
window.cbLatestBillingSummary =
  typeof window.cbLatestBillingSummary !== "undefined"
    ? window.cbLatestBillingSummary
    : null;
let cbLatestBillingSummary = window.cbLatestBillingSummary;
let cbLastBillingSummaryAt = 0;
let cbPendingBillingSuccessMessage = false;
let cbBillingToastTimeout = null;
const CB_BILLING_SUMMARY_TTL = 60 * 1000;
const cbEnterpriseFormState = {
  loading: false,
  errors: {},
  submitError: "",
};
let cbContactContext = {
  context: "enterprise",
  origin: "coolbits-account-billing-enterprise",
  planCode: "enterprise",
  returnTo: "plans",
};
const CB_MESSAGE_TYPE_COUNCIL_DECISION = "council_decision";

const cbFormatTokenFullText = (remaining, included) => {
  if (typeof remaining === "number" && typeof included === "number") {
    return `${formatTokens(Math.max(0, remaining))} / ${formatTokens(Math.max(0, included))} tokens`;
  }
  if (typeof remaining === "number") {
    return `${formatTokens(Math.max(0, remaining))} tokens left`;
  }
  return "Tokens: n/a";
};

const cbFormatTokenShortText = (remaining) => {
  if (typeof remaining !== "number" || !Number.isFinite(remaining)) {
    return "Tokens: n/a";
  }
  if (remaining >= 1000) {
    const short = Math.round(remaining / 1000);
    return `${short}k tokens left`;
  }
  return `${Math.max(0, remaining)} tokens left`;
};

const cbFormatPeriodRange = (startIso, endIso) => {
  if (!startIso || !endIso) return "";
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";
  const opts = { day: "numeric", month: "short" };
  return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`;
};

const cbDeriveUsageMetrics = (summary) => {
  const planNode = summary?.plan || {};
  const usageNode = summary?.usage || {};
  const limitsNode = summary?.limits || {};

  const tokensIncluded =
    typeof limitsNode.tokensPerMonth === "number"
      ? limitsNode.tokensPerMonth
      : typeof planNode.tokensPerMonth === "number"
      ? planNode.tokensPerMonth
      : typeof planNode.monthlyTokens === "number"
      ? planNode.monthlyTokens
      : null;

  let tokensRemaining =
    typeof usageNode.tokensRemaining === "number"
      ? usageNode.tokensRemaining
      : typeof usageNode.remainingTokens === "number"
      ? usageNode.remainingTokens
      : null;

  let tokensUsed =
    typeof usageNode.tokensUsedThisPeriod === "number"
      ? usageNode.tokensUsedThisPeriod
      : typeof usageNode.usedTokens === "number"
      ? usageNode.usedTokens
      : typeof usageNode.used === "number"
      ? usageNode.used
      : null;

  const stripeStatus = (
    summary?.stripe?.status ||
    summary?.stripe?.subscription_status ||
    ""
  )
    .toString()
    .toLowerCase();
  const noUsageYet =
    tokensIncluded !== null &&
    (tokensUsed === null || Number.isNaN(tokensUsed)) &&
    (tokensRemaining === null || tokensRemaining === 0) &&
    stripeStatus === "inactive";
  if (noUsageYet) {
    tokensUsed = 0;
    tokensRemaining = tokensIncluded;
  }
  if (
    tokensIncluded !== null &&
    typeof tokensRemaining === "number" &&
    tokensUsed === null
  ) {
    tokensUsed = Math.max(0, tokensIncluded - tokensRemaining);
  }
  if (
    tokensIncluded !== null &&
    typeof tokensUsed === "number" &&
    tokensRemaining === null
  ) {
    tokensRemaining = Math.max(0, tokensIncluded - tokensUsed);
  }
  if (typeof tokensRemaining === "number" && tokensRemaining < 0) {
    tokensRemaining = 0;
  }
  if (typeof tokensUsed === "number" && tokensUsed < 0) {
    tokensUsed = 0;
  }
  const progressRatio =
    typeof tokensIncluded === "number" &&
    typeof tokensUsed === "number" &&
    tokensIncluded > 0
      ? Math.min(1, Math.max(0, tokensUsed / tokensIncluded))
      : 0;
  const lowTokenThreshold =
    typeof tokensIncluded === "number" ? 0.2 * tokensIncluded : null;
  const showLowTokens =
    typeof tokensRemaining === "number" &&
    lowTokenThreshold !== null &&
    tokensRemaining < lowTokenThreshold;
  return {
    tokensIncluded,
    tokensRemaining,
    tokensUsed,
    progressRatio,
    showLowTokens,
    noUsageYet,
    periodStart: usageNode.periodStart || usageNode.period_start || usageNode.start || null,
    periodEnd: usageNode.periodEnd || usageNode.period_end || usageNode.end || null,
  };
};

const cbNormalizePlanCode = (planValue) => {
  if (planValue && typeof planValue === "string") {
    return planValue.toLowerCase();
  }
  if (planValue && typeof planValue.code === "string") {
    return planValue.code.toLowerCase();
  }
  return "starter";
};

const cbFormatPlanPrice = (plan) => {
  const planCode = cbNormalizePlanCode(
    plan?.code || plan?.id || plan?.plan || plan?.name
  );
  const planDef = PLAN_DEFINITIONS[planCode] || null;
  const amount =
    typeof planDef?.price === "number"
      ? planDef.price
      : typeof plan?.price?.amount === "number"
        ? plan.price.amount
        : null;
  const currencyRaw =
    planDef?.currency?.toUpperCase() ||
    (typeof plan?.price?.currency === "string"
      ? plan.price.currency.toUpperCase()
      : "EUR");
  const currency = currencyRaw || "EUR";
  if (amount === null) {
    return "-";
  }
  const interval =
    typeof plan?.price?.interval === "string"
      ? plan.price.interval
      : "month";
  const symbol = CURRENCY_SYMBOLS[currency] || `${currency} `;
  return `${symbol}${formatTokens(amount)} / ${interval}`;
};

const cbIsAccountBillingOpen = () => {
  const panel = document.getElementById("cb-account-billing");
  return !!(panel && panel.hidden === false);
};

const cbIsTokenExhaustedFromSummary = () => {
  const summary =
    (typeof window !== "undefined" && window.cbLatestBillingSummary) ||
    cbLatestBillingSummary;
  if (!summary || typeof summary !== "object" || !summary.usage) {
    return false;
  }
  const remaining = summary.usage.tokensRemaining;
  if (typeof remaining !== "number") {
    return false;
  }
  return remaining <= 0;
};

const cbSetTokenLimitBannerVisible = (visible) => {
  const el = document.getElementById("cb-token-limit-banner");
  if (!el) return;
  el.style.display = visible ? "" : "none";
};

const cbUpdateHeaderEmail = (value) => {
  const emailEl = document.getElementById("cb-header-user-email");
  if (!emailEl) return;
  emailEl.textContent = value || "";
};

const cbSetBillingSummary = (summary) => {
  cbLatestBillingSummary = summary || null;
  window.cbLatestBillingSummary = cbLatestBillingSummary;
  cbLastBillingSummaryAt = summary ? Date.now() : 0;
  const exhausted = cbIsTokenExhaustedFromSummary();
  cbSetTokenLimitBannerVisible(exhausted);
  if (summary) {
    console.log("[CBT_QUOTA]", exhausted ? "exhausted" : "ok", summary.usage);
  }
  cbCouncilAxisState = cbNormalizeCouncilAxisState(summary);
  window.cbCouncilAxisState = cbCouncilAxisState;
  cbRenderPlanAndUsageFromSummary(cbLatestBillingSummary);
  cbSyncCouncilUI();
  if (cbIsAccountBillingOpen()) {
    cbRenderAccountBilling(cbLatestBillingSummary);
  }
  cbUpdatePromptMeter();
  cbUpdateChatHeader();
};

const cbRenderPlanAndUsageFromSummary = (summary) => {
  const planLabelEl = document.getElementById("cb-user-menu-name");
  const planTokensEl = document.getElementById("cb-user-menu-plan-short");
  const headerPlanEl = document.getElementById("cb-header-user-plan");
  const headerTokensEl = document.getElementById("cb-header-user-tokens");
  const planCode = cbNormalizePlanCode(summary?.plan);
  const fallbackLabel = PLAN_DEFINITIONS[planCode]?.label || "Starter";
  const planLabel = PLAN_DEFINITIONS[planCode]?.label || fallbackLabel;
  const usageMetrics = summary ? cbDeriveUsageMetrics(summary) : null;
  const tokensIncluded = usageMetrics?.tokensIncluded ?? null;
  const tokensRemaining =
    typeof usageMetrics?.tokensRemaining === "number"
      ? usageMetrics.tokensRemaining
      : null;
  const hasUsageTotals =
    typeof tokensIncluded === "number" &&
    tokensIncluded > 0 &&
    typeof tokensRemaining === "number" &&
    tokensRemaining >= 0;
  const normalizedTokensFull =
    hasUsageTotals && summary
      ? `${Math.max(0, tokensRemaining).toLocaleString()} / ${tokensIncluded.toLocaleString()} tokens`
      : "";
  const tokensShort = cbFormatTokenShortText(tokensRemaining);

  if (planLabelEl) {
    planLabelEl.textContent = summary?.user?.name || summary?.user?.email || "Guest";
  }
  if (planTokensEl) {
    planTokensEl.textContent = summary ? planLabel : "Starter";
  }

  if (headerPlanEl) {
    headerPlanEl.textContent = summary ? planLabel : "";
  }
  if (headerTokensEl) {
    headerTokensEl.textContent = summary ? normalizedTokensFull : "";
  }
  const planModal = document.getElementById("cb-plan-modal");
  if (planModal && !planModal.hidden) {
    cbRenderPlansModal();
  }
};

const cbGetChatHeaderElements = () => {
  const modelValue = document.getElementById("cb-active-model");
  const contextValue = document.getElementById("cb-active-context");
  const usageValue = document.getElementById("cb-active-usage");
  return {
    agentTile: document.getElementById("cb-active-agent-tile"),
    agentName: document.getElementById("cb-active-agent-name"),
    agentMeta: document.getElementById("cb-active-agent-meta"),
    modelTile: modelValue ? modelValue.closest(".cb-smart-tile") : null,
    modelValue,
    modelMeta: document.getElementById("cb-active-model-meta"),
    contextTile: contextValue ? contextValue.closest(".cb-smart-tile") : null,
    contextValue,
    contextMeta: document.getElementById("cb-active-context-meta"),
    usageTile: usageValue ? usageValue.closest(".cb-smart-tile") : null,
    usageValue,
    usageMeta: document.getElementById("cb-active-usage-meta"),
  };
};

const cbResolveCouncilSelections = () => {
  cbSyncCouncilStateFromLegacy();
  const selected =
    Array.isArray(cbCouncilState?.selectedKeys) && cbCouncilState.selectedKeys.length
      ? cbCouncilState.selectedKeys.slice()
      : [];
  if (!selected.length && cbCouncilSelectedIds && cbCouncilSelectedIds.size) {
    return Array.from(cbCouncilSelectedIds);
  }
  return selected;
};

const cbResolveCouncilAgentProfile = (agentId) => {
  const agent =
    cbFindAgentByKey(agentId, cbCurrentWorkspaceId) || cbFindAgentByKey(agentId);
  if (agent) {
    return {
      label: agent.label || agent.key || agentId,
      description: agent.shortDescription || "",
    };
  }
  const legacy = CB_COUNCIL_MEMBERS.find((member) => member.id === agentId);
  if (legacy) {
    return {
      label: legacy.label || legacy.shortLabel || legacy.id,
      description: legacy.description || "",
    };
  }
  const fallback = String(agentId || "Agent").replace(/[_-]+/g, " ").trim();
  return { label: fallback || "Agent", description: "" };
};

const cbBuildActiveAgentSummary = () => {
  if (cbActiveContextState.context) {
    const label = cbFormatActiveAgentName(cbActiveContextState.context);
    const status =
      cbActiveContextState.status === "active"
        ? "Active"
        : cbActiveContextState.status === "pending"
          ? "Pending"
          : cbActiveContextState.status === "error"
            ? "Error"
            : "Idle";
    const tooltip = `Active context: ${label}\n${cbBuildActiveContextTooltip(cbActiveContextState.context)}`;
    return { label, meta: status, tooltip };
  }
  const selected = cbResolveCouncilSelections();
  if (!selected.length) {
    return {
      label: "Solo chat",
      meta: "Council off",
      tooltip: "Active context: Solo chat\nCouncil off\nNo agents selected. Open Council to add agents.",
    };
  }
  const resolved = selected.map((id) => cbResolveCouncilAgentProfile(id));
  const primary = resolved[0];
  const extraCount = Math.max(0, resolved.length - 1);
  const label = extraCount ? `${primary.label} +${extraCount}` : primary.label;
  const meta = `Council on - ${resolved.length} agent${resolved.length === 1 ? "" : "s"}`;
  const detailLines = resolved
    .map((item) => (item.description ? `${item.label}: ${item.description}` : item.label))
    .join("\n");
  const tooltip = `Active context: ${label}\n${meta}${detailLines ? `\n${detailLines}` : ""}`;
  return { label, meta, tooltip };
};

const cbBuildModelSummary = () => {
  if (cbActiveContextState.context) {
    const providerLabel = cbFormatProviderLabel(cbActiveContextState.context.provider || "auto");
    const modelLabel = cbFormatModelLabel(cbActiveContextState.context.model || "");
    const meta = modelLabel ? `Model: ${modelLabel}` : "Model: auto";
    return { label: providerLabel, meta };
  }
  const providerSelect = document.getElementById("cb-model-selector");
  const searchInput = document.getElementById("cb-model-search");
  const providerValue = providerSelect?.value || "auto";
  const providerLabel =
    providerSelect?.selectedOptions?.[0]?.textContent || providerValue || "Auto";
  const modelHint = searchInput?.value ? searchInput.value.trim() : "";
  let meta = "";
  if (providerValue === "auto") {
    meta = modelHint ? `Model hint: ${modelHint}` : "Routing: auto";
  } else {
    meta = modelHint ? `Model hint: ${modelHint}` : "Model hint: none";
  }
  return { label: providerLabel, meta };
};

const cbBuildContextSummary = () => {
  const workspace =
    cbWorkspaces.find((item) => item.id === cbCurrentWorkspaceId) || cbWorkspaces[0];
  const activeProject =
    cbCurrentProjectId && cbProjects.find((proj) => proj && proj.id === cbCurrentProjectId);
  const value = `${workspace?.label || "Workspace"} / ${activeProject?.name || "All projects"}`;
  const connected = Object.keys(cbConnectorState || {})
    .filter((key) => (cbConnectorState[key]?.status || "").toLowerCase() === "connected")
    .map((key) => cbResolveConnectorByKey(key))
    .filter(Boolean)
    .map((connector) => connector.label || connector.key);
  const connectorLabel = connected.length
    ? `Connectors: ${connected.join(", ")}`
    : "Connectors: none";
  const councilState = cbResolveCouncilSelections().length ? "Council on" : "Council off";
  return { value, meta: `${councilState} | ${connectorLabel}` };
};

const cbBuildUsageSummary = () => {
  const summary = cbLatestBillingSummary || null;
  const usageMetrics = summary ? cbDeriveUsageMetrics(summary) : null;
  const tokensLine = usageMetrics
    ? cbFormatTokenShortText(usageMetrics.tokensRemaining)
    : "Tokens: n/a";
  const promptTokens = Math.max(0, Math.round(cbPromptMeterState.tokensEffective || 0));
  const size = cbPromptMeterState.sizeClass
    ? cbPromptMeterState.sizeClass.toUpperCase()
    : "";
  const outcome = cbPromptMeterState.outcomeHint || "";
  const promptMeta = promptTokens
    ? `Prompt: ${promptTokens.toLocaleString()} tokens${size ? ` (${size})` : ""}${
        outcome ? ` - ${outcome}` : ""
      }`
    : "Prompt: empty";
  return { value: tokensLine, meta: promptMeta };
};

const cbUpdateChatHeader = () => {
  const elements = cbGetChatHeaderElements();
  if (!elements.agentName && !elements.modelValue && !elements.contextValue) {
    return;
  }

  const agentSummary = cbBuildActiveAgentSummary();
  if (elements.agentName) {
    elements.agentName.textContent = agentSummary.label;
  }
  if (elements.agentMeta) {
    elements.agentMeta.textContent = agentSummary.meta;
  }
  if (elements.agentTile) {
    elements.agentTile.title = agentSummary.tooltip;
  }

  const modelSummary = cbBuildModelSummary();
  if (elements.modelValue) {
    elements.modelValue.textContent = modelSummary.label;
  }
  if (elements.modelMeta) {
    elements.modelMeta.textContent = modelSummary.meta;
  }
  if (elements.modelTile) {
    elements.modelTile.title = `Model: ${modelSummary.label}\n${modelSummary.meta}`;
  }

  const contextSummary = cbBuildContextSummary();
  if (elements.contextValue) {
    elements.contextValue.textContent = contextSummary.value;
  }
  if (elements.contextMeta) {
    elements.contextMeta.textContent = contextSummary.meta;
  }
  if (elements.contextTile) {
    elements.contextTile.title = `Context: ${contextSummary.value}\n${contextSummary.meta}`;
  }

  const usageSummary = cbBuildUsageSummary();
  if (elements.usageValue) {
    elements.usageValue.textContent = usageSummary.value;
  }
  if (elements.usageMeta) {
    elements.usageMeta.textContent = usageSummary.meta;
  }
  if (elements.usageTile) {
    elements.usageTile.title = `Usage: ${usageSummary.value}\n${usageSummary.meta}`;
  }
};

window.cbUpdateChatHeader = cbUpdateChatHeader;

const cbGetAgentsElements = () => ({
  view: document.getElementById("cb-agents-view"),
  select: document.getElementById("cb-agents-scenario-select"),
  description: document.getElementById("cb-agents-scenario-description"),
  inputs: document.getElementById("cb-agents-inputs"),
  error: document.getElementById("cb-agents-error"),
  runBtn: document.getElementById("cb-agents-run-btn"),
  resultSection: document.getElementById("cb-agents-result"),
  resultSummaryTitle: document.getElementById("cb-agents-result-summary-title"),
  resultSummaryText: document.getElementById("cb-agents-result-summary-text"),
  actionsContainer: document.getElementById("cb-agents-actions"),
  stepsContainer: document.getElementById("cb-agents-steps"),
  usageContainer: document.getElementById("cb-agents-usage"),
  guestNotice: document.getElementById("cb-agents-guest"),
  content: document.querySelector(".cb-agents-content"),
});

const cbGetSelectedAgentScenario = () => {
  if (!cbAgentsState.registry || !cbAgentsState.registry.length) {
    return null;
  }
  const currentId = cbAgentsState.selectedScenarioId;
  return (
    cbAgentsState.registry.find((scenario) => {
      const scenarioId = scenario?.scenario || scenario?.id;
      return scenarioId === currentId;
    }) || null
  );
};

const cbShowAgentsError = (message) => {
  const { error } = cbGetAgentsElements();
  if (!error) return;
  if (message) {
    error.textContent = message;
    error.hidden = false;
  } else {
    error.textContent = "";
    error.hidden = true;
  }
};

const cbUpdateAgentsAuthState = () => {
  const elements = cbGetAgentsElements();
  const isAuthenticated = cbIsAuthenticated();
  if (elements.guestNotice) {
    elements.guestNotice.hidden = isAuthenticated;
  }
  if (elements.content) {
    elements.content.hidden = !isAuthenticated;
  }
  if (elements.runBtn) {
    elements.runBtn.disabled = !isAuthenticated || cbAgentsState.running;
  }
  if (!isAuthenticated && elements.resultSection) {
    elements.resultSection.hidden = true;
  }
  if (!isAuthenticated) {
    cbShowAgentsError("");
  }
};

const cbRenderAgentsRegistry = () => {
  const { select } = cbGetAgentsElements();
  if (!select) return;
  select.innerHTML = "";
  const scenarios = cbAgentsState.registry || [];
  if (!scenarios.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No scenarios available";
    select.appendChild(option);
    select.disabled = true;
    cbAgentsState.selectedScenarioId = "";
    cbUpdateAgentsScenarioDetails();
    return;
  }
  select.disabled = false;
  scenarios.forEach((scenario) => {
    const scenarioId = scenario?.scenario || scenario?.id;
    if (!scenarioId) {
      return;
    }
    const option = document.createElement("option");
    option.value = scenarioId;
    option.textContent = scenario?.label || scenario?.name || scenarioId;
    select.appendChild(option);
  });
  const desiredId =
    cbAgentsState.selectedScenarioId ||
    scenarios[0]?.scenario ||
    scenarios[0]?.id ||
    "";
  cbAgentsState.selectedScenarioId = desiredId;
  select.value = desiredId;
  cbUpdateAgentsScenarioDetails();
};

const cbRenderAgentsInputField = (field) => {
  const wrapper = document.createElement("div");
  wrapper.className = "cb-agents-input-field";
  const label = document.createElement("label");
  const inputKey =
    field.name ||
    field.id ||
    `agent-input-${Math.random().toString(36).slice(2)}`;
  const inputId = `cb-agent-input-${inputKey}`;
  label.setAttribute("for", inputId);
  label.textContent = field.label || field.name || "Input";
  wrapper.appendChild(label);
  let input;
  if (field.type === "textarea") {
    input = document.createElement("textarea");
  } else {
    input = document.createElement("input");
    input.type = field.type === "number" ? "number" : "text";
  }
  input.id = inputId;
  input.dataset.agentInput = "true";
  input.dataset.inputName = inputKey;
  if (field.placeholder) {
    input.placeholder = field.placeholder;
  }
  if (field.required) {
    input.required = true;
  }
  wrapper.appendChild(input);
  if (field.helpText) {
    const help = document.createElement("p");
    help.className = "cb-agents-input-help";
    help.textContent = field.helpText;
    wrapper.appendChild(help);
  }
  return wrapper;
};

const cbRenderAgentsInputs = () => {
  const { inputs } = cbGetAgentsElements();
  if (!inputs) return;
  inputs.innerHTML = "";
  const scenario = cbGetSelectedAgentScenario();
  const fields = Array.isArray(scenario?.inputs) ? scenario.inputs : [];
  if (!fields.length) {
    const noInputs = document.createElement("p");
    noInputs.className = "cb-agents-input-placeholder";
    noInputs.textContent = "No additional input required.";
    inputs.appendChild(noInputs);
    return;
  }
  fields.forEach((field) => {
    const rendered = cbRenderAgentsInputField(field || {});
    inputs.appendChild(rendered);
  });
};

const cbUpdateAgentsScenarioDetails = () => {
  const { description } = cbGetAgentsElements();
  const scenario = cbGetSelectedAgentScenario();
  if (description) {
    description.textContent = scenario?.description || "";
  }
  cbRenderAgentsInputs();
};

const cbCollectAgentsInputValues = () => {
  const { inputs } = cbGetAgentsElements();
  if (!inputs) return {};
  const values = {};
  inputs.querySelectorAll("[data-agent-input='true']").forEach((field) => {
    const name = field.dataset.inputName;
    if (!name) return;
    const value = field.value;
    if (value !== "" && value !== undefined) {
      values[name] = value;
    }
  });
  return values;
};

const cbHandleAgentsRunError = (status, data) => {
  switch (status) {
    case 400:
      cbShowAgentsError(
        data?.message ||
          "This scenario is not available or the input is invalid.",
      );
      break;
    case 401:
      cbShowAgentsError("You need to sign in again.");
      break;
    case 402:
      cbShowAgentsError("Quota exceeded. Please review your billing plan.");
      break;
    case 429:
      cbShowAgentsError(
        "You are sending requests too quickly. Please wait a bit and try again.",
      );
      break;
    default:
      cbShowAgentsError("Something went wrong. Please try again later.");
      break;
  }
};

const cbRenderAgentsActions = (actions = []) => {
  const { actionsContainer } = cbGetAgentsElements();
  if (!actionsContainer) return;
  actionsContainer.innerHTML = "";
  if (!Array.isArray(actions) || !actions.length) {
    actionsContainer.hidden = true;
    return;
  }
  actionsContainer.hidden = false;
  const list = document.createElement("ul");
  list.className = "cb-agents-actions-list";
  actions.forEach((action) => {
    const item = document.createElement("li");
    item.className = "cb-agents-action";
    const title = action?.title || action?.name || "Recommended action";
    const detail = action?.description || action?.details || "";
    const priority = action?.priority || action?.severity || "";
    const header = document.createElement("div");
    header.className = "cb-agents-action-header";
    header.textContent = title;
    item.appendChild(header);
    if (priority) {
      const badge = document.createElement("span");
      badge.className = "cb-agents-action-priority";
      badge.textContent = priority;
      header.appendChild(badge);
    }
    if (detail) {
      const body = document.createElement("p");
      body.textContent = detail;
      item.appendChild(body);
    }
    list.appendChild(item);
  });
  actionsContainer.appendChild(list);
};

const cbRenderAgentsSteps = (steps = []) => {
  const { stepsContainer } = cbGetAgentsElements();
  if (!stepsContainer) return;
  stepsContainer.innerHTML = "";
  if (!Array.isArray(steps) || !steps.length) {
    stepsContainer.hidden = true;
    return;
  }
  stepsContainer.hidden = false;
  const list = document.createElement("div");
  list.className = "cb-agents-steps-list";
  steps.forEach((step, index) => {
    const details = document.createElement("details");
    details.className = "cb-agents-step";
    if (index === 0) {
      details.open = true;
    }
    const summary = document.createElement("summary");
    summary.innerHTML = `<strong>${step?.title || `Step ${index + 1}`}</strong>${
      step?.agent ? ` · ${step.agent}` : ""
    }`;
    details.appendChild(summary);
    if (step?.text) {
      const body = document.createElement("p");
      body.textContent = step.text;
      details.appendChild(body);
    }
    if (step?.usage) {
      const usage = document.createElement("p");
      usage.className = "cb-agents-step-usage";
      const tokens = step.usage.tokens
        ? `${step.usage.tokens} tokens`
        : null;
      const cost = step.usage.cost
        ? `${step.usage.cost} ${step.usage.currency || ""}`.trim()
        : null;
      usage.textContent = `Usage: ${
        [tokens, cost].filter(Boolean).join(" · ") || "n/a"
      }`;
      details.appendChild(usage);
    }
    list.appendChild(details);
  });
  stepsContainer.appendChild(list);
};

const cbRenderAgentsUsage = (usage = {}) => {
  const { usageContainer } = cbGetAgentsElements();
  if (!usageContainer) return;
  usageContainer.innerHTML = "";
  usageContainer.hidden = false;
  const tokens =
    typeof usage.tokens === "number" ? `${usage.tokens} tokens` : null;
  const credits =
    typeof usage.credits === "number"
      ? `${usage.credits} credits`
      : usage.cost && usage.currency
        ? `${usage.cost} ${usage.currency}`
        : null;
  const summary = document.createElement("p");
  summary.textContent =
    tokens || credits
      ? `This run consumed ${[tokens, credits].filter(Boolean).join(" and ")}.`
      : "Usage data was not provided for this run.";
  usageContainer.appendChild(summary);
};

const cbRenderAgentsResult = (result) => {
  const {
    resultSection,
    resultSummaryTitle,
    resultSummaryText,
  } = cbGetAgentsElements();
  if (!resultSection || !resultSummaryTitle || !resultSummaryText) {
    return;
  }
  const summaryContent = result?.summary;
  if (summaryContent && typeof summaryContent === "object") {
    resultSummaryTitle.textContent =
      summaryContent.title || "Run summary";
    resultSummaryText.textContent =
      summaryContent.text || summaryContent.details || "";
  } else {
    resultSummaryTitle.textContent =
      result?.scenario || "Run summary";
    resultSummaryText.textContent =
      typeof summaryContent === "string"
        ? summaryContent
        : result?.status || "Completed";
  }
  cbRenderAgentsActions(result?.actions);
  cbRenderAgentsSteps(result?.steps);
  cbRenderAgentsUsage(result?.usage || {});
  resultSection.hidden = false;
};

const cbFetchAgentsRegistry = async () => {
  if (!cbIsAuthenticated()) {
    cbAgentsState.registryLoaded = false;
    return;
  }
  if (cbAgentsState.registryLoading || cbAgentsState.registryLoaded) {
    return;
  }
  cbAgentsState.registryLoading = true;
  cbShowAgentsError("");
  try {
    const response = await fetch(API_AGENTS_REGISTRY, {
      method: "GET",
      headers: cbGetAuthHeaders(),
      credentials: "include",
    });
    const data = await safeJson(response);
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        clearAuthState({ showOnboarding: true });
        cbShowAgentsError("You need to sign in again.");
        return;
      }
      cbHandleAgentsRunError(response.status, data);
      return;
    }
    const scenarios = Array.isArray(data?.scenarios)
      ? data.scenarios
      : Array.isArray(data)
        ? data
        : [];
    cbAgentsState.registry = scenarios;
    cbAgentsState.registryLoaded = true;
    cbRenderAgentsRegistry();
  } catch (error) {
    console.error("[AGENTS] registry fetch failed", error);
    cbShowAgentsError("Unable to load agents. Please try again later.");
  } finally {
    cbAgentsState.registryLoading = false;
  }
};

const cbRunSelectedAgent = async () => {
  if (cbAgentsState.running) return;
  const scenarioId = cbAgentsState.selectedScenarioId;
  const { runBtn, resultSection } = cbGetAgentsElements();
  if (!cbIsAuthenticated()) {
    cbShowAgentsError("You need to sign in again.");
    cbUpdateAgentsAuthState();
    return;
  }
  if (!scenarioId) {
    cbShowAgentsError("Select a scenario before running the agent.");
    return;
  }
  const payload = { scenario: scenarioId };
  const inputs = cbCollectAgentsInputValues();
  if (Object.keys(inputs).length) {
    payload.input = inputs;
  }
  cbShowAgentsError("");
  cbAgentsState.running = true;
  cbUpdateAgentsAuthState();
  if (resultSection) {
    resultSection.hidden = true;
  }
  if (runBtn) {
    runBtn.disabled = true;
    runBtn.textContent = "Running...";
  }
  try {
    const response = await fetch(API_AGENTS_RUN, {
      method: "POST",
      headers: cbGetAuthHeaders({ "Content-Type": "application/json" }),
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const data = await safeJson(response);
    if (response.status === 401 || response.status === 403) {
      clearAuthState({ showOnboarding: true });
      cbShowAgentsError("You need to sign in again.");
      return;
    }
    if (!response.ok) {
      cbHandleAgentsRunError(response.status, data);
      return;
    }
    cbAgentsState.lastResult = data;
    cbRenderAgentsResult(data);
  } catch (error) {
    console.error("[AGENTS] run failed", error);
    cbShowAgentsError("Something went wrong. Please try again later.");
  } finally {
    cbAgentsState.running = false;
    cbUpdateAgentsAuthState();
    if (runBtn) {
      runBtn.disabled = false;
      runBtn.textContent = "Run agent";
    }
  }
};

const ALLOWED_TAGS = new Set([
  "P",
  "BR",
  "UL",
  "OL",
  "LI",
  "EM",
  "STRONG",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "PRE",
  "CODE",
  "BLOCKQUOTE",
  "A",
]);

const ALLOWED_ATTRS = {
  A: ["href", "title"],
};

const SAFE_PROTOCOLS = ["http:", "https:", "mailto:", "tel:"];
const CB_MOBILE_BREAKPOINT = 900;
const CB_COMPOSER_MAX_LINES = 10;

const debounce = (fn, wait = 150) => {
  let timeoutId;
  return (...args) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
    }, wait);
  };
};

const cbIsMobileViewport = () => window.innerWidth <= CB_MOBILE_BREAKPOINT;

marked.setOptions({
  gfm: true,
  breaks: true,
  headerIds: false,
  mangle: false,
});

const isSafeHref = (href) => {
  if (!href) return false;
  const trimmed = href.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("#")) return true;
  try {
    const url = new URL(trimmed, window.location.origin);
    return SAFE_PROTOCOLS.includes(url.protocol);
  } catch {
    return false;
  }
};

const sanitizeNode = (node) => {
  if (!node || !node.childNodes) return;
  Array.from(node.childNodes).forEach((child) => {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const tag = child.tagName.toUpperCase();
      if (!ALLOWED_TAGS.has(tag)) {
        while (child.firstChild) {
          node.insertBefore(child.firstChild, child);
        }
        child.remove();
        return;
      }
      const allowed = ALLOWED_ATTRS[tag] || [];
      Array.from(child.attributes).forEach((attr) => {
        const attrName = attr.name.toLowerCase();
        if (!allowed.includes(attrName)) {
          child.removeAttribute(attr.name);
          return;
        }
        if (tag === "A" && attrName === "href" && !isSafeHref(attr.value)) {
          child.removeAttribute(attr.name);
        }
      });
      sanitizeNode(child);
    } else if (child.nodeType === Node.COMMENT_NODE) {
      child.remove();
    }
  });
};

const sanitizeHtml = (html) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  sanitizeNode(doc.body);
  return doc.body.innerHTML;
};

const renderMarkdown = (value) => {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }
  try {
    const rendered = marked.parse(value);
    return sanitizeHtml(rendered);
  } catch (error) {
    console.warn("Markdown render failed", error);
    return "";
  }
};

const elements = {
  messages: document.querySelector("[data-chat-messages]"),
  chatBody: document.querySelector(".chat-body"),
  chatContainer: document.getElementById("chat-scroll"),
  suggestions: document.querySelector("[data-chat-suggestions]"),
  suggestionsHeading: document.querySelector("[data-suggestions-heading]"),
  form: document.querySelector("[data-chat-form]"),
  levelBanner: document.querySelector("[data-level-banner]"),
  levelPill: document.querySelector("[data-level-pill]"),
  levelMode: document.querySelector("[data-level-mode]"),
  levelUnlock: document.querySelector("[data-level-unlock]"),
  reasoningBadge: document.querySelector("[data-reasoning-badge]"),
  campaignButton: document.querySelector("[data-campaign-button]"),
  error: document.querySelector("[data-chat-error]"),
};

elements.input =
  document.getElementById("chat-input") ||
  elements.form?.querySelector("textarea") ||
  elements.form?.querySelector("input");
elements.button = elements.form?.querySelector('button[type="submit"]') || elements.form?.querySelector("button");

const shellElements = {
  sidebar: document.querySelector("[data-sidebar]"),
  sidebarToggle: document.querySelector("[data-sidebar-toggle]"),
  sidebarLogo: document.querySelector("[data-sidebar-logo]"),
  mobileSidebarToggle: document.querySelector("[data-sidebar-mobile-toggle]"),
  sidebarClose: document.querySelector("[data-sidebar-close]"),
  sidebarBackdrop: document.querySelector("[data-sidebar-backdrop]"),
  newChatButton: document.querySelector("[data-sidebar-new-chat]"),
  agentsButton: document.querySelector("[data-sidebar-agents]"),
  chatsList: document.querySelector("[data-sidebar-chat-list]"),
  featureButtons: Array.from(document.querySelectorAll("[data-sidebar-feature]")),
  accountViewButtons: Array.from(document.querySelectorAll("[data-account-view-btn]")),
  accountViews: Array.from(document.querySelectorAll("[data-account-view]")),
  connectorsCategories: document.getElementById("cb-connectors-categories"),
  connectorsSection: document.querySelector("[data-sidebar-connectors]"),
  connectorsToggle: document.getElementById("cb-connectors-toggle"),
  connectorsMenu: document.getElementById("cb-connectors-menu"),
  userSlot: document.getElementById("cb-sidebar-user-slot"),
  topBarRight: document.querySelector(".top-bar-right"),
  projectSection: document.querySelector("[data-projects-section]"),
  projectSelector: document.getElementById("cb-project-selector"),
  projectCurrentLabel: document.getElementById("cb-project-current-label"),
  projectMenu: document.getElementById("cb-project-menu"),
  projectsGuestHint: document.getElementById("cb-projects-guest-hint"),
  projectsError: document.getElementById("cb-projects-error"),
  deleteModal: document.getElementById("cb-delete-modal"),
  deleteCancelButton: document.getElementById("cb-delete-cancel"),
  deleteConfirmButton: document.getElementById("cb-delete-confirm"),
  projectModal: document.getElementById("cb-project-modal"),
  projectNameInput: document.getElementById("cb-project-name-input"),
  projectCreateButton: document.getElementById("cb-project-create"),
  projectCancelButton: document.getElementById("cb-project-cancel"),
  projectModalError: document.getElementById("cb-project-modal-error"),
  workspaceSection: document.querySelector(".cb-sidebar-workspace"),
  workspaceSelector: document.getElementById("cb-workspace-selector"),
  workspaceLabel: document.getElementById("cb-workspace-current-label"),
  workspaceMenu: document.getElementById("cb-workspace-menu"),
  renameModal: document.getElementById("cb-rename-modal"),
  renameInput: document.getElementById("cb-rename-input"),
  renameCancelButton: document.getElementById("cb-rename-cancel"),
  renameConfirmButton: document.getElementById("cb-rename-confirm"),
  renameError: document.getElementById("cb-rename-error"),
  composerForm: document.getElementById("cb-composer"),
  chatInput: document.getElementById("chat-input"),
  councilButton: document.getElementById("cb-council-pill"),
  councilAgentsButton: document.getElementById("cb-council-agents-btn"),
  councilActive: document.getElementById("cb-council-active"),
  councilPopover: document.getElementById("cb-council-popover"),
  councilList: document.getElementById("cb-council-list"),
  payloadStack: document.getElementById("cb-payload-stack"),
  payloadStackBtn: document.getElementById("cb-payload-stack-btn"),
  payloadStackBadge: document.getElementById("cb-payload-stack-badge"),
  payloadStackBars: document.getElementById("cb-payload-stack-bars"),
  payloadStackRisk: document.getElementById("cb-payload-stack-risk"),
  payloadPopover: document.getElementById("cb-payload-popover"),
  payloadPopoverList: document.getElementById("cb-payload-popover-list"),
  payloadPopoverManage: document.getElementById("cb-payload-popover-manage"),
  payloadPopoverClear: document.getElementById("cb-payload-popover-clear"),
};

const SIDEBAR_COLLAPSE_KEY = "coolbits:sidebar-collapsed";

const generateVisitorId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `visitor-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
};

const getVisitorId = () => {
  try {
    const existing = localStorage.getItem(VISITOR_KEY);
    if (existing) {
      return existing;
    }
    const fresh = generateVisitorId();
    localStorage.setItem(VISITOR_KEY, fresh);
    return fresh;
  } catch {
    return generateVisitorId();
  }
};

const visitorId = getVisitorId();
window.coolbitsVisitorId = visitorId;

let messages = [];
let history = [];
const defaultProfile = {
  level: "level-0",
  capabilities: { tier: "guest", label: "Guest tier" },
  unlocks: ["Share more intent to unlock Level 1."],
  reasoning: { active: false, expiresAt: null },
  flags: {},
};
let profile = defaultProfile;
let profileLoaded = false;
let profilePromise = null;
let isSending = false;
let reasoningPollInterval = null;
let reasoningActive = false;
window.coolbitsProfile = { ...defaultProfile };

const GUEST_PLAN = "Free trial";
const STARTER_PLAN = "Starter";
const PRO_PLAN = "Pro";
const STARTER_TOKENS = 1000;
const PRO_TOKENS = 10000;
const AUTH_TOKEN_KEY = "cb_auth_token";
const AUTH_USER_KEY = "coolbits.currentUser";
const STAGED_PAYLOAD_STORAGE_KEY = "cb_staged_payloads";
const STAGED_PAYLOAD_IDS_KEY = "cb_staged_payload_ids";
let cbAuthToken = null;
let cbCurrentUser = null;
let cbCouncilAxisState = { mode: null, readyByAxis: {} };
let userMenuOpen = false;
let cbGooglePopup = null;
let cbStagedPayloadIds = [];
let cbStagedPayloads = [];
const cbWorkspaceChats = new Map();
const cbWorkspaceProjects = new Map();
const cbChatsInitializedByWorkspace = new Map();
const cbProjectsInitializedByWorkspace = new Map();
const cbProjectsLoadingByWorkspace = new Map();
let cbChats = [];
let cbProjects = [];
const cbCouncilState = {
  selectedKeys: [],
};

function cbSetAuthToken(token) {
  cbAuthToken = token || null;
  try {
    if (cbAuthToken) {
      window.localStorage.setItem(AUTH_TOKEN_KEY, cbAuthToken);
    } else {
      window.localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch (error) {
    console.debug("[AUTH_TOKEN] storage error", error);
  }
}

function cbGetAuthToken() {
  if (cbAuthToken) {
    return cbAuthToken;
  }
  try {
    const stored = window.localStorage.getItem(AUTH_TOKEN_KEY);
    cbAuthToken = stored || null;
  } catch (error) {
    console.debug("[AUTH_TOKEN] read error", error);
  }
  return cbAuthToken;
}
let cbActiveChatId = null;
let cbActiveChatMessages = [];
let cbHasManualChatSelection = false;
let cbChatsUnsupported = false;
let cbCurrentProjectId = null;
let cbProjectMenuOpen = false;
let cbSidebarMenuOutsideBound = false;
const cbActiveContextState = {
  status: "idle",
  context: null,
  error: null,
  pendingReason: null,
};
let cbActiveContextRequestId = 0;
let cbActiveContextDebounce = null;
let cbSuppressContextActivation = false;
const WORKSPACE_STORAGE_KEY = "coolbits:workspace";
const cbWorkspaces = [
  { id: "business", label: "Business" },
  { id: "agency", label: "Agency" },
  { id: "developer", label: "Developer" },
];
let cbCurrentWorkspaceId = "business";
let cbWorkspaceMenuOpen = false;
let cbConnectorsMenuOpen = false;
let cbPendingDeleteChatId = null;
let cbPendingRenameChatId = null;
const cbManualChatTitles = new Set();
const cbAutoTitledChats = new Set();
const cbFeatureFlags = {
  panelsBusiness: true,
  panelsAgency: false,
  panelsDeveloper: false,
  connectors: true,
  orchestrator: false,
};

let cbPendingFirstMessage = null;
const cbNormalizeWorkspaceId = (workspaceId) => {
  if (typeof workspaceId === "string" && workspaceId.trim()) {
    return workspaceId;
  }
  return "business";
};

const CB_PROVIDER_API_MAP = {
  auto: "auto",
  chatgpt: "openai",
  claude: "anthropic",
  gemini: "google",
  grok: "xai",
  copilot: "openai",
  openai: "openai",
  anthropic: "anthropic",
  google: "google",
  xai: "xai",
  deepseek: "deepseek",
};

const CB_PROVIDER_UI_MAP = {
  openai: "chatgpt",
  anthropic: "claude",
  google: "gemini",
  xai: "grok",
  deepseek: "auto",
  auto: "auto",
};

const CB_PROVIDER_LABELS = {
  auto: "Auto",
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  grok: "Grok",
  copilot: "Copilot",
  openai: "ChatGPT",
  anthropic: "Claude",
  google: "Gemini",
  xai: "Grok",
  deepseek: "DeepSeek",
};

const cbNormalizeProviderForApi = (value) => {
  if (!value) return "auto";
  const key = String(value).trim().toLowerCase();
  return CB_PROVIDER_API_MAP[key] || "auto";
};

const cbNormalizeProviderForUi = (value) => {
  if (!value) return "auto";
  const key = String(value).trim().toLowerCase();
  return CB_PROVIDER_UI_MAP[key] || (CB_PROVIDER_API_MAP[key] ? key : "auto");
};

const cbFormatProviderLabel = (value) => {
  if (!value) return "Auto";
  const key = String(value).trim().toLowerCase();
  return CB_PROVIDER_LABELS[key] || value;
};

const cbFormatModelLabel = (value) => {
  if (!value) return "Auto";
  const trimmed = String(value).trim();
  return trimmed.replace(/^vertex-/, "").replace(/^openai-/, "");
};

const cbGetActiveContextElements = () => ({
  bar: document.getElementById("cb-active-context-bar"),
  led: document.getElementById("cb-active-context-led"),
  mode: document.getElementById("cb-active-context-mode"),
  primary: document.getElementById("cb-active-context-primary"),
  chips: document.getElementById("cb-active-context-chips"),
  detail: document.getElementById("cb-active-context-detail"),
});

const cbUpdateComposerSendState = () => {
  const sendButton = elements.button;
  if (!sendButton) return;
  const shouldDisable = isSending || cbActiveContextState.status !== "active";
  if (shouldDisable) {
    sendButton.setAttribute("disabled", "true");
  } else {
    sendButton.removeAttribute("disabled");
  }
};

const cbShortPayloadLabel = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "payload";
  if (raw.length <= 10) return raw;
  return `${raw.slice(0, 4)}...${raw.slice(-4)}`;
};

const cbShortHash = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.length <= 12) return raw;
  return `${raw.slice(0, 4)}...${raw.slice(-4)}`;
};

const cbNormalizePayloadIds = (ids) => {
  if (!Array.isArray(ids)) return [];
  const cleaned = ids
    .map((id) => (typeof id === "string" ? id.trim() : ""))
    .filter(Boolean);
  return Array.from(new Set(cleaned));
};

const cbNormalizeStagedPayloads = (payloads) => {
  if (!Array.isArray(payloads)) return [];
  const filtered = payloads
    .map((item) => (item && typeof item === "object" ? item : null))
    .filter(Boolean)
    .map((item) => {
      const hash = typeof item.hash === "string" ? item.hash.trim() : "";
      let hashShort = typeof item.hashShort === "string" ? item.hashShort.trim() : "";
      if (!hashShort && hash) {
        hashShort = cbShortHash(hash);
      }
      return {
        id: typeof item.id === "string" ? item.id.trim() : "",
        name: typeof item.name === "string" ? item.name.trim() : "",
        kind: typeof item.kind === "string" ? item.kind.trim() : "selection",
        hash,
        hashShort,
        bytes: Number.isFinite(item.bytes) ? item.bytes : null,
        summary: item.summary && typeof item.summary === "object" ? { ...item.summary } : null,
      };
    })
    .filter((item) => item.id);
  const unique = new Map();
  filtered.forEach((item) => {
    if (!unique.has(item.id)) {
      unique.set(item.id, item);
    }
  });
  return Array.from(unique.values());
};

const cbBuildFallbackPayload = (id) => ({
  id,
  name: `Payload ${cbShortPayloadLabel(id)}`,
  kind: "selection",
  hash: "",
  hashShort: cbShortPayloadLabel(id),
  bytes: null,
  summary: null,
});

const cbGetPayloadSummary = (content) => {
  const selection = content?.selection || {};
  const ads = selection.googleads || null;
  const ga4 = selection.ga4 || null;
  const range = ads || ga4 || {};
  const blocks = Array.isArray(range.blocks) ? range.blocks : [];
  const payload = content?.payload || {};
  const metrics = Array.isArray(payload.metrics)
    ? payload.metrics
    : Array.isArray(payload.columns)
      ? payload.columns
      : Array.isArray(payload.dimensions)
        ? payload.dimensions
        : [];
  const metricsCount = metrics.length;
  const hasWriteIntent =
    Boolean(payload.hasWriteIntent) ||
    payload.write === true ||
    payload.mode === "write" ||
    content?.kind === "commit_intent";

  return {
    customerId: ads?.customerId || null,
    propertyId: ga4?.propertyId || null,
    from: range.from || null,
    to: range.to || null,
    compareMode: range.compareMode || null,
    compareFrom: range.compareFrom || null,
    compareTo: range.compareTo || null,
    blocksCount: blocks.length,
    metricsCount,
    hasWriteIntent,
  };
};

const cbComputePayloadBytes = (content) => {
  try {
    const raw = JSON.stringify(content || {});
    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(raw).length;
    }
    return raw.length;
  } catch (_err) {
    return null;
  }
};

const cbBuildStagedPayloadMeta = (payload) => {
  const content = payload?.contentJson || {};
  const hash = payload?.hash || content?.hash || "";
  const summary = cbGetPayloadSummary(content);
  const bytes = cbComputePayloadBytes(content);
  return {
    id: payload?.id,
    name: payload?.name || "",
    kind: payload?.kind || content?.kind || "selection",
    hash,
    hashShort: cbShortHash(hash),
    bytes: Number.isFinite(bytes) ? bytes : null,
    summary,
  };
};

const cbGetStagedPayloadIds = () => cbStagedPayloadIds.slice();

const cbSetStagedPayloads = (payloads, { persist = true } = {}) => {
  cbStagedPayloads = cbNormalizeStagedPayloads(payloads);
  cbStagedPayloadIds = cbNormalizePayloadIds(cbStagedPayloads.map((item) => item.id));
  if (persist) {
    try {
      if (cbStagedPayloads.length) {
        window.localStorage.setItem(
          STAGED_PAYLOAD_STORAGE_KEY,
          JSON.stringify(cbStagedPayloads),
        );
      } else {
        window.localStorage.removeItem(STAGED_PAYLOAD_STORAGE_KEY);
      }
      if (cbStagedPayloadIds.length) {
        window.localStorage.setItem(
          STAGED_PAYLOAD_IDS_KEY,
          JSON.stringify(cbStagedPayloadIds),
        );
      } else {
        window.localStorage.removeItem(STAGED_PAYLOAD_IDS_KEY);
      }
    } catch (_err) {
      // Ignore storage errors.
    }
  }
  cbRenderPayloadStack();
};

const cbClearStagedPayloads = () => {
  cbSetStagedPayloads([], { persist: true });
  cbClosePayloadPopover();
};

const cbReadStagedPayloads = () => {
  try {
    const raw = window.localStorage.getItem(STAGED_PAYLOAD_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const normalized = cbNormalizeStagedPayloads(parsed);
      if (normalized.length) return normalized;
    }
    const idsRaw = window.localStorage.getItem(STAGED_PAYLOAD_IDS_KEY);
    if (!idsRaw) return [];
    const idsParsed = JSON.parse(idsRaw);
    const ids = cbNormalizePayloadIds(idsParsed);
    return ids.map(cbBuildFallbackPayload);
  } catch (_err) {
    return [];
  }
};

const cbComputePayloadWeight = (payloads) => {
  let totalBytes = 0;
  let fallbackBytes = 0;
  payloads.forEach((payload) => {
    if (Number.isFinite(payload.bytes)) {
      totalBytes += payload.bytes;
    } else if (payload.summary) {
      const blocks = Number(payload.summary.blocksCount) || 0;
      const metrics = Number(payload.summary.metricsCount) || 0;
      fallbackBytes += (blocks * 1024) + (metrics * 512);
    }
  });
  const bytes = totalBytes + fallbackBytes;
  if (bytes <= 0) return 0;
  if (bytes < 25 * 1024) return 1;
  if (bytes <= 150 * 1024) return 2;
  return 3;
};

const cbHasPayloadWriteIntent = (payloads) =>
  payloads.some((payload) => payload.summary && payload.summary.hasWriteIntent);

const cbBuildPayloadDetailText = (payload) => {
  const summary = payload.summary || {};
  const scope =
    summary.customerId
      ? `Customer ${summary.customerId}`
      : summary.propertyId
        ? `Property ${summary.propertyId}`
        : "Scope -";
  const range = summary.from && summary.to ? `${summary.from} to ${summary.to}` : "Dates -";
  let compare = "Compare -";
  if (summary.compareMode) {
    compare = `Compare ${summary.compareMode}`;
    if (summary.compareFrom && summary.compareTo) {
      compare = `${compare} (${summary.compareFrom} to ${summary.compareTo})`;
    }
  }
  const blocks = Number.isFinite(summary.blocksCount)
    ? `Blocks ${summary.blocksCount}`
    : "Blocks -";
  const metrics = Number.isFinite(summary.metricsCount)
    ? `Metrics ${summary.metricsCount}`
    : "Metrics -";
  const bytes = Number.isFinite(payload.bytes) ? `${Math.round(payload.bytes / 1024)} KB` : "Size -";
  return `${scope} | ${range} | ${compare} | ${blocks} | ${metrics} | ${bytes}`;
};

const cbRenderPayloadStack = () => {
  const {
    payloadStack,
    payloadStackBadge,
    payloadStackRisk,
    payloadPopoverList,
    payloadStackBtn,
    payloadStackBars,
  } = shellElements;
  if (!payloadStack || !payloadPopoverList || !payloadStackBadge) return;

  const count = cbStagedPayloads.length;
  payloadStackBadge.hidden = count === 0;
  if (count > 0) {
    payloadStackBadge.textContent = `+${count}`;
  }
  if (payloadStackBtn) {
    const label = count ? `Payloads (${count})` : "Payloads";
    payloadStackBtn.title = label;
    payloadStackBtn.setAttribute("aria-label", label);
  }
  const weight = cbComputePayloadWeight(cbStagedPayloads);
  payloadStack.dataset.weight = String(weight || 0);

  if (payloadStackRisk) {
    payloadStackRisk.hidden = !cbHasPayloadWriteIntent(cbStagedPayloads);
  }
  if (payloadStackBars) {
    payloadStackBars.hidden = count === 0;
  }

  payloadPopoverList.innerHTML = "";
  if (!count) {
    const empty = document.createElement("div");
    empty.className = "cb-payload-popover-empty";
    empty.textContent = "No payloads staged.";
    payloadPopoverList.appendChild(empty);
    return;
  }

  cbStagedPayloads.forEach((payload) => {
    const wrapper = document.createElement("div");
    const row = document.createElement("div");
    row.className = "cb-payload-popover-row";
    const main = document.createElement("div");
    main.className = "cb-payload-popover-row-main";
    const name = document.createElement("div");
    name.className = "cb-payload-popover-row-name";
    name.title = payload.name || payload.id;
    name.textContent = payload.name || `Payload ${cbShortPayloadLabel(payload.id)}`;
    const meta = document.createElement("div");
    meta.className = "cb-payload-popover-row-meta";
    const hashShort = payload.hashShort || cbShortHash(payload.hash) || cbShortPayloadLabel(payload.id);
    meta.textContent = `${payload.kind || "selection"} · ${hashShort}`;
    main.append(name, meta);
    const actions = document.createElement("div");
    actions.className = "cb-payload-popover-row-actions";

    const viewBtn = document.createElement("button");
    viewBtn.type = "button";
    viewBtn.className = "cb-icon-btn";
    viewBtn.title = "View details";
    viewBtn.setAttribute("aria-label", "View details");
    viewBtn.innerHTML = `
      <svg viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="6" stroke="currentColor" stroke-width="1.5" fill="none"></circle>
        <path d="M16 16l4 4" stroke="currentColor" stroke-width="1.5" fill="none"></path>
      </svg>
    `;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "cb-icon-btn";
    removeBtn.title = "Remove payload";
    removeBtn.setAttribute("aria-label", "Remove payload");
    removeBtn.innerHTML = `
      <svg viewBox="0 0 24 24">
        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"></path>
      </svg>
    `;

    actions.append(viewBtn, removeBtn);
    row.append(main, actions);

    const detail = document.createElement("div");
    detail.className = "cb-payload-popover-row-detail";
    detail.hidden = true;
    detail.textContent = cbBuildPayloadDetailText(payload);

    viewBtn.addEventListener("click", (event) => {
      event.preventDefault();
      detail.hidden = !detail.hidden;
    });

    removeBtn.addEventListener("click", (event) => {
      event.preventDefault();
      cbSetStagedPayloads(cbStagedPayloads.filter((item) => item.id !== payload.id));
    });

    wrapper.append(row, detail);
    payloadPopoverList.appendChild(wrapper);
  });
};

const cbOpenPayloadPopover = () => {
  const { payloadPopover, payloadStack, payloadStackBtn } = shellElements;
  if (!payloadPopover || !payloadStack) return;
  payloadPopover.hidden = false;
  payloadStack.dataset.open = "true";
  if (payloadStackBtn) {
    payloadStackBtn.setAttribute("aria-expanded", "true");
  }
  cbFetchStagedPayloadMeta();
};

const cbClosePayloadPopover = () => {
  const { payloadPopover, payloadStack, payloadStackBtn } = shellElements;
  if (!payloadPopover || !payloadStack) return;
  payloadPopover.hidden = true;
  payloadStack.dataset.open = "false";
  if (payloadStackBtn) {
    payloadStackBtn.setAttribute("aria-expanded", "false");
  }
};

const cbTogglePayloadPopover = () => {
  const { payloadPopover } = shellElements;
  if (!payloadPopover) return;
  if (payloadPopover.hidden) {
    cbOpenPayloadPopover();
  } else {
    cbClosePayloadPopover();
  }
};

const cbFetchStagedPayloadMeta = async () => {
  if (!cbIsAuthenticated()) return;
  const missing = cbStagedPayloads.filter((payload) => !payload.name || !payload.kind || !payload.hash);
  if (!missing.length) return;
  const workspaceId = cbNormalizeWorkspaceId(cbCurrentWorkspaceId || "business");
  for (const payload of missing) {
    try {
      const response = await fetch(`${API_PAYLOADS}/${encodeURIComponent(payload.id)}?workspaceId=${encodeURIComponent(workspaceId)}`, {
        method: "GET",
        headers: cbGetAuthHeaders(),
        credentials: "include",
      });
      const data = await safeJson(response);
      if (!response.ok || !data?.payload) {
        continue;
      }
      const meta = cbBuildStagedPayloadMeta(data.payload);
      cbStagedPayloads = cbStagedPayloads.map((item) => (item.id === payload.id ? { ...item, ...meta } : item));
    } catch (_err) {
      continue;
    }
  }
  cbSetStagedPayloads(cbStagedPayloads, { persist: true });
};

const cbInitStagedPayloads = () => {
  cbSetStagedPayloads(cbReadStagedPayloads(), { persist: false });
  const {
    payloadStackBtn,
    payloadPopover,
    payloadPopoverManage,
    payloadPopoverClear,
  } = shellElements;
  if (payloadStackBtn && !payloadStackBtn.dataset.bound) {
    payloadStackBtn.addEventListener("click", (event) => {
      event.preventDefault();
      cbTogglePayloadPopover();
    });
    payloadStackBtn.dataset.bound = "true";
  }
  if (payloadPopoverManage && !payloadPopoverManage.dataset.bound) {
    payloadPopoverManage.addEventListener("click", (event) => {
      event.preventDefault();
      cbClosePayloadPopover();
      window.location.href = "/payload/";
    });
    payloadPopoverManage.dataset.bound = "true";
  }
  if (payloadPopoverClear && !payloadPopoverClear.dataset.bound) {
    payloadPopoverClear.addEventListener("click", (event) => {
      event.preventDefault();
      cbClearStagedPayloads();
    });
    payloadPopoverClear.dataset.bound = "true";
  }
  if (payloadPopover && !payloadPopover.dataset.bound) {
    document.addEventListener("click", (event) => {
      if (!payloadPopover || payloadPopover.hidden) return;
      const target = event.target;
      if (target && shellElements.payloadStack?.contains(target)) return;
      cbClosePayloadPopover();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        cbClosePayloadPopover();
      }
    });
    payloadPopover.dataset.bound = "true";
  }
};

const cbFormatActiveAgentName = (context) => {
  if (!context) return "Not active";
  const name = context.customName || context.defaultName || context.role || context.agentId || "Agent";
  const role = context.role && context.role !== name ? context.role : "";
  return role ? `${role} · ${name}` : name;
};

const cbBuildShortAgentLabel = (label) => {
  const raw = String(label || "").trim();
  if (!raw) return "";
  const normalized = cbNormalizeAgentLabel(raw) || raw;
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    const first = words[0];
    if (/^[A-Z0-9]{2,5}$/.test(first)) {
      return first;
    }
    const acronym = words.map((word) => word[0]).join("").toUpperCase();
    if (acronym.length >= 2 && acronym.length <= 5) {
      return acronym;
    }
  }
  return normalized;
};

const cbResolveCouncilDisplayAgent = (agentKey) => {
  if (!agentKey) return null;
  const agent =
    cbFindAgentByKey(agentKey, cbCurrentWorkspaceId) || cbFindAgentByKey(agentKey);
  const registry = cbResolvePublicRegistryAgent(agent);
  const legacy = CB_COUNCIL_MEMBERS.find((member) => member.id === agentKey);
  const fullLabel =
    registry?.label || agent?.label || legacy?.label || legacy?.shortLabel || agentKey;
  const shortSource =
    registry?.shortLabel ||
    registry?.role ||
    registry?.label ||
    agent?.label ||
    legacy?.shortLabel ||
    legacy?.label ||
    agentKey;
  const shortLabel = cbBuildShortAgentLabel(shortSource || fullLabel);
  return {
    key: agentKey,
    shortLabel: shortLabel || String(fullLabel || agentKey),
    fullLabel: String(fullLabel || shortLabel || agentKey),
  };
};

const cbBuildActiveContextTooltip = (context, extraLines = []) => {
  const lines = Array.isArray(extraLines) ? extraLines.filter(Boolean) : [];
  if (!context) {
    return lines.length ? lines.join("\n") : "Active context not confirmed yet.";
  }
  const providerLabel = cbFormatProviderLabel(context.provider || "auto");
  const modelLabel = cbFormatModelLabel(context.model || "auto");
  const billingLabel = context.billingSource === "byok" ? "BYOK" : "CoolBits";
  lines.push(`Provider: ${providerLabel}`);
  lines.push(`Model: ${modelLabel}`);
  lines.push(`Billing: ${billingLabel}`);
  return lines.join("\n");
};

const cbUpdateActiveContextBar = () => {
  const { bar, led, mode, primary, chips, detail } = cbGetActiveContextElements();
  if (!bar || !led) return;
  const status = cbActiveContextState.status || "idle";
  const context = cbActiveContextState.context;
  const confirmed = status === "active" && context?.contextId;
  const ledStatus =
    status === "error" ? "error" : status === "pending" ? "pending" : confirmed ? "active" : "idle";
  led.setAttribute("data-status", ledStatus);

  const selected = cbResolveCouncilSelections();
  const councilArmed = !!cbCouncilState?.armed;
  const councilEnabled = selected.length > 0 || councilArmed;
  const agents = selected.map((key) => cbResolveCouncilDisplayAgent(key)).filter(Boolean);
  const primaryAgent = agents[0] || null;

  if (mode) {
    mode.textContent = councilEnabled
      ? agents.length
        ? "Council mode"
        : "Council (no agents selected)"
      : "Solo mode";
  }

  if (primary) {
    if (councilEnabled) {
      primary.textContent = primaryAgent ? `Primary: ${primaryAgent.shortLabel}` : "Primary: -";
      primary.title = primaryAgent?.fullLabel || "";
    } else {
      const activeName = context ? cbFormatActiveAgentName(context) : "-";
      primary.textContent = `Agent: ${activeName}`;
      primary.title = activeName === "-" ? "" : activeName;
    }
  }

  if (chips) {
    chips.textContent = "";
    if (agents.length) {
      const visible = agents.slice(0, 4);
      visible.forEach((agent) => {
        const chip = document.createElement("span");
        chip.className = "cb-active-context-chip";
        chip.textContent = agent.shortLabel;
        chip.title = agent.fullLabel || agent.shortLabel;
        chips.appendChild(chip);
      });
      const remaining = agents.length - visible.length;
      if (remaining > 0) {
        const more = document.createElement("span");
        more.className = "cb-active-context-chip cb-active-context-chip--more";
        more.textContent = `+${remaining}`;
        more.title = `${remaining} more`;
        chips.appendChild(more);
      }
      chips.hidden = false;
    } else {
      chips.hidden = true;
    }
  }

  let detailLine = "";
  if (agents.length) {
    detailLine = agents
      .map((agent) => agent.fullLabel || agent.shortLabel)
      .filter(Boolean)
      .join(", ");
  }
  if (detail) {
    detail.textContent = detailLine;
    detail.hidden = !detailLine;
  }

  const tooltipLines = [];
  if (councilEnabled) {
    tooltipLines.push(
      agents.length ? `Council: ${detailLine}` : "Council: no agents selected"
    );
  }
  bar.title = cbBuildActiveContextTooltip(context, tooltipLines);
};

const cbApplyActiveContextToUi = (context) => {
  if (!context) return;
  const providerSelect = document.getElementById("cb-model-selector");
  const searchInput = document.getElementById("cb-model-search");
  const listEl = document.getElementById("cb-model-search-list");
  if (!providerSelect && !searchInput) return;
  cbSuppressContextActivation = true;
  const uiProvider = cbNormalizeProviderForUi(context.provider);
  if (providerSelect && uiProvider && providerSelect.value !== uiProvider) {
    providerSelect.value = uiProvider;
  }
  if (searchInput) {
    const label = cbFormatModelLabel(context.model || "");
    if (label && searchInput.value !== label) {
      searchInput.value = label;
    }
  }
  if (providerSelect && searchInput && listEl) {
    cbUpdateModelSearch(providerSelect.value || "auto", searchInput, listEl);
  }
  cbSuppressContextActivation = false;
};

const cbSetActiveContextState = ({ status, context = null, error = null, reason = null } = {}) => {
  if (status) cbActiveContextState.status = status;
  cbActiveContextState.context = context;
  cbActiveContextState.error = error;
  cbActiveContextState.pendingReason = reason;
  if (context) {
    cbApplyActiveContextToUi(context);
  }
  cbUpdateActiveContextBar();
  cbUpdateChatHeader();
  cbUpdateComposerSendState();
};

const cbBuildActiveContextRequestFromUi = (overrides = {}) => {
  const selected = cbResolveCouncilSelections();
  const primaryKey = selected.length ? selected[0] : null;
  const agentProfile = primaryKey ? cbFindAgentByKey(primaryKey, cbCurrentWorkspaceId) : null;
  const agentId = agentProfile?.cbAgentId || agentProfile?.agentId || null;
  const providerSelect = document.getElementById("cb-model-selector");
  const searchInput = document.getElementById("cb-model-search");
  const providerValue = providerSelect?.value || "auto";
  const provider = cbNormalizeProviderForApi(providerValue);
  const modelHint = searchInput?.value ? searchInput.value.trim() : "";
  const model = modelHint || "auto";

  return {
    workspace: cbNormalizeWorkspaceId(cbCurrentWorkspaceId),
    agentId,
    provider,
    model,
    billingSource: "coolbits",
    ...overrides,
  };
};

const cbActivateContext = async (requested = {}, { reason = null } = {}) => {
  if (!cbIsAuthenticated()) {
    return null;
  }
  const requestId = ++cbActiveContextRequestId;
  cbSetActiveContextState({ status: "pending", context: cbActiveContextState.context, error: null, reason });
  const { ok, status, json } = await cbFetchJson(API_CONTEXT_ACTIVATE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requested || {}),
  });
  if (requestId !== cbActiveContextRequestId) {
    return null;
  }
  if (!ok || !json?.ok) {
    const message = json?.error?.message || json?.error || "Unable to activate context.";
    cbSetActiveContextState({
      status: "error",
      context: cbActiveContextState.context,
      error: json?.error || { message },
      reason,
    });
    showComposerError(message);
    return null;
  }
  cbSetActiveContextState({ status: "active", context: json.context, error: null, reason });
  clearComposerError();
  return json.context;
};

const cbActivateContextFromUi = (reason) => {
  if (cbSuppressContextActivation) return;
  const payload = cbBuildActiveContextRequestFromUi();
  return cbActivateContext(payload, { reason });
};

const cbQueueActivateContextFromUi = (reason, delay = 350) => {
  if (cbSuppressContextActivation) return;
  if (cbActiveContextDebounce) {
    clearTimeout(cbActiveContextDebounce);
  }
  cbActiveContextDebounce = setTimeout(() => {
    cbActivateContextFromUi(reason);
  }, delay);
};

const cbLoadActiveContext = async () => {
  if (!cbIsAuthenticated()) {
    cbSetActiveContextState({ status: "idle", context: null, error: null });
    return null;
  }
  const { ok, json } = await cbFetchJson(API_CONTEXT_ACTIVE, { method: "GET" });
  if (ok && json?.context) {
    cbSetActiveContextState({ status: json.context.status || "active", context: json.context, error: null });
    return json.context;
  }
  cbSetActiveContextState({ status: "idle", context: null, error: null });
  cbActivateContextFromUi("context-bootstrap");
  return null;
};

window.cbActivateContext = cbActivateContext;
window.cbActiveContextState = cbActiveContextState;

const CB_AGENTS_WORKSPACE_PARAM = {
  business: "cbB",
  agency: "cbA",
  developer: "cbD",
  personal: "cbP",
};

const cbBuildAgentsDirectoryUrl = ({ includeWorkspace = false, workspaceId = null } = {}) => {
  const base = "/agents/";
  if (!includeWorkspace) {
    return base;
  }
  const resolved = cbNormalizeWorkspaceId(workspaceId || cbCurrentWorkspaceId);
  const param = CB_AGENTS_WORKSPACE_PARAM[resolved];
  if (!param) {
    return base;
  }
  const params = new URLSearchParams({ workspace: param });
  return `${base}?${params.toString()}`;
};

const cbBuildAgentProfileUrl = (profile, { fromCouncil = false } = {}) => {
  if (!profile || !profile.agentId) {
    return cbBuildAgentsDirectoryUrl({ includeWorkspace: true, workspaceId: profile?.workspaceSlug });
  }
  const nameSegment = cbEncodeAgentNameSegment(profile.defaultName);
  const base = `/agents/${profile.workspaceSlug}/${profile.roleSlug}/${profile.agentId}/${nameSegment}`;
  if (!fromCouncil) {
    return base;
  }
  const params = new URLSearchParams({ fromCouncil: "true" });
  return `${base}?${params.toString()}`;
};

const cbSyncCurrentWorkspaceChatsCache = () => {
  cbWorkspaceChats.set(
    cbNormalizeWorkspaceId(cbCurrentWorkspaceId),
    Array.isArray(cbChats) ? cbChats.slice() : []
  );
};

const cbGetEffectiveSelectedWorkspaces = (user) => {
  if (Array.isArray(user?.workspacesSelected) && user.workspacesSelected.length) {
    return user.workspacesSelected.slice();
  }
  if (Array.isArray(user?.workspacesAllowed) && user.workspacesAllowed.length) {
    return user.workspacesAllowed.slice();
  }
  if (Array.isArray(user?.capabilities?.workspacesAllowed) && user.capabilities.workspacesAllowed.length) {
    return user.capabilities.workspacesAllowed.slice();
  }
  return ["business"];
};

const cbEnsureWorkspaceSelectionFromUser = (userOverride) => {
  const user = userOverride || cbCurrentUser;
  if (!user) {
    return;
  }
  const effective = cbGetEffectiveSelectedWorkspaces(user);
  if (!effective.length) {
    return;
  }
  if (!effective.includes(cbCurrentWorkspaceId)) {
    cbOnWorkspaceChanged(effective[0]);
  }
};

const cbUpdateUsageState = (payload, { reset = false } = {}) => {
  if (reset) {
    if (cbCurrentUser) {
      delete cbCurrentUser.includedCbtRemaining;
      delete cbCurrentUser.includedCbtPerMonth;
    }
    return;
  }
  const target = payload || cbCurrentUser;
  if (!target) {
    return;
  }
  if (Number.isFinite(target.includedCbtRemaining)) {
    target.includedCbtRemaining = Math.floor(target.includedCbtRemaining);
  } else if (target === cbCurrentUser) {
    delete cbCurrentUser.includedCbtRemaining;
  }
  if (Number.isFinite(target.includedCbtPerMonth)) {
    target.includedCbtPerMonth = Math.floor(target.includedCbtPerMonth);
  } else if (target === cbCurrentUser) {
    delete cbCurrentUser.includedCbtPerMonth;
  }
};

const cbApplyAuthPayload = (data, { persist = true } = {}) => {
  if (!data || typeof data !== "object") {
    return;
  }
  const merged = { ...(cbCurrentUser || {}), ...data };
  merged.id = data.id ?? merged.id ?? null;
  merged.email = data.email ?? merged.email ?? null;
  merged.planId = data.planId || merged.planId || "STARTER_FREE";
  merged.planLabel = data.planLabel || merged.planLabel || "Starter (free)";

  if (Array.isArray(data.workspacesAllowed) && data.workspacesAllowed.length) {
    merged.workspacesAllowed = data.workspacesAllowed.slice();
  } else if (!Array.isArray(merged.workspacesAllowed)) {
    merged.workspacesAllowed = [];
  }

  if (Array.isArray(data.workspacesSelected) && data.workspacesSelected.length) {
    merged.workspacesSelected = data.workspacesSelected.slice();
  } else if (!Array.isArray(merged.workspacesSelected)) {
    merged.workspacesSelected = [];
  }

  const existingCaps = { ...(cbCurrentUser?.capabilities || {}) };
  const nextCaps = merged.capabilities && typeof merged.capabilities === "object" ? merged.capabilities : {};
  const payloadCaps = data.capabilities && typeof data.capabilities === "object" ? data.capabilities : {};
  merged.capabilities = { ...existingCaps, ...nextCaps, ...payloadCaps };

  if (typeof data.includedCbtPerMonth === "number") {
    merged.includedCbtPerMonth = data.includedCbtPerMonth;
  }
  if (typeof data.includedCbtRemaining === "number") {
    merged.includedCbtRemaining = data.includedCbtRemaining;
  }
  if (typeof data.tokensRemaining === "number") {
    merged.tokensRemaining = data.tokensRemaining;
  }
  if (typeof data.totalUsed === "number") {
    merged.totalUsed = data.totalUsed;
  }
  if (typeof data.showLowBalanceBanner === "boolean") {
    merged.showLowBalanceBanner = data.showLowBalanceBanner;
  }

  cbCurrentUser = merged;
  cbUpdateUsageState(cbCurrentUser);
  if (typeof cbEnsureWorkspaceSelectionFromUser === "function") {
    cbEnsureWorkspaceSelectionFromUser(cbCurrentUser);
  }

  if (persist) {
    try {
      window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(cbCurrentUser));
    } catch (error) {
      console.warn("[AUTH] Unable to persist auth user", error);
    }
  }
  updateUserBadge();
  syncWorkspaceShell();
  cbAgentsState.registryLoaded = false;
  cbUpdateAgentsAuthState();
  if (cbAgentsState.initialized) {
    cbFetchAgentsRegistry();
  }
  closeOnboardingModal();
  cbLoadActiveContext().catch((error) => console.warn("[ACTIVE_CONTEXT] load failed", error));
};

async function cbFetchAndApplyAuthMe() {
  const headers = { Accept: "application/json" };
  const token = cbGetAuthToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(API_AUTH_ME, {
      method: "GET",
      headers,
      credentials: "include",
    });
  } catch (error) {
    console.warn("[AUTH_ME] network error", error);
    return null;
  }

  if (response.status === 401 || response.status === 403) {
    console.warn("[AUTH_ME] unauthorized", response.status);
    clearAuthState({ showOnboarding: true });
    return null;
  }

  if (!response.ok) {
    console.warn("[AUTH_ME] unexpected status", response.status);
    return null;
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    console.warn("[AUTH_ME] invalid JSON", error);
    return null;
  }

  const payload = data && typeof data === "object" && data.user && typeof data.user === "object" ? data.user : data;

  cbUpdateBadgeFromAuthPayload(payload);
  cbApplyAuthPayload(payload);
  return payload;
}

const cbFormatUsageLabel = (user) => {
  if (
    !user ||
    typeof user.includedCbtRemaining !== "number" ||
    typeof user.includedCbtPerMonth !== "number"
  ) {
    return "1,000 tokens left";
  }
  const remaining = user.includedCbtRemaining.toLocaleString();
  const monthly = user.includedCbtPerMonth.toLocaleString();
  return `${remaining} / ${monthly} cbT left this month`;
};

function cbUpdateBadgeFromAuthPayload(data) {
  if (!data || typeof data !== "object") return;

  const emailEl = document.querySelector(".cb-user-badge-email");

  if (!emailEl) {
    console.debug("[USER_BADGE] elements not found");
    return;
  }

  const email = data.email || data.userEmail || null;

  if (email) {
    emailEl.textContent = email;
  }
  console.debug("[USER_BADGE] updated", {
    email: emailEl.textContent,
  });
}

const cbRenderAccountFooter = ({ emailLine }) => {
  const badge = document.getElementById("cb-user-badge");
  if (!badge) return;
  const emailEl = badge.querySelector(".cb-user-badge-email");
  if (emailEl) {
    emailEl.textContent = emailLine || "";
  }
};

const cbGetUserEmail = (user) => {
  if (!user) return null;
  return (
    user.email ||
    (user.profile && user.profile.email) ||
    user.userEmail ||
    user.username ||
    null
  );
};

const COUNCIL_BY_WORKSPACE = {
  business: [
    {
      id: "ceo",
      label: "CEO",
      badge: "Strategy",
      desc: "High-level decisions, priorities, and trade-offs for the business.",
    },
    {
      id: "cto",
      label: "CTO",
      badge: "Tech",
      desc: "Architecture, technical decisions, and integration trade-offs.",
    },
    {
      id: "cfo",
      label: "CFO",
      badge: "Finance",
      desc: "Costs, ROI, pricing structure, and financial risk.",
    },
    {
      id: "cmo",
      label: "CMO",
      badge: "Growth",
      desc: "Marketing strategy, channels, and messaging.",
    },
    {
      id: "ops",
      label: "COO",
      badge: "Ops",
      desc: "Processes, automation, and operational efficiency.",
    },
  ],
  agency: [
    {
      id: "ppc",
      label: "PPC Lead",
      badge: "Ads",
      desc: "Google Ads / Meta Ads structure, bids, and optimizations.",
    },
    {
      id: "seo",
      label: "SEO Lead",
      badge: "SEO",
      desc: "Search strategy, content, and on-site optimizations.",
    },
    {
      id: "content",
      label: "Content Lead",
      badge: "Content",
      desc: "Angles, hooks, and creative briefs.",
    },
    {
      id: "analytics",
      label: "Analytics",
      badge: "Data",
      desc: "Tracking, attribution, and reporting views.",
    },
    {
      id: "am",
      label: "Account Lead",
      badge: "Client",
      desc: "Expectations, communication, and packaging.",
    },
  ],
  developer: [
    {
      id: "arch",
      label: "System Architect",
      badge: "Arch",
      desc: "System design, boundaries, and trade-offs.",
    },
    {
      id: "backend",
      label: "Backend Dev",
      badge: "Backend",
      desc: "APIs, DB, performance, and integrations.",
    },
    {
      id: "frontend",
      label: "Frontend Dev",
      badge: "Frontend",
      desc: "UI/UX, components, and state management.",
    },
    {
      id: "devops",
      label: "DevOps",
      badge: "Infra",
      desc: "Deployment, monitoring, and scaling.",
    },
    {
      id: "ai",
      label: "AI Engineer",
      badge: "AI",
      desc: "Models, prompts, and orchestration.",
    },
  ],
};

let cbActiveCouncilMembers = [];

const cbIsAuthenticated = () => {
  const token = cbGetAuthToken();
  if (typeof token === "string" && token.trim().length > 0) {
    return true;
  }
  const tokenLike =
    (cbCurrentUser && typeof cbCurrentUser === "object" && (cbCurrentUser.jwt || cbCurrentUser.token || cbCurrentUser.accessToken)) || "";
  return typeof tokenLike === "string" && tokenLike.trim().length > 0;
};

const cbLoadWorkspaceFromStorage = () => {
  try {
    const stored = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (stored && cbWorkspaces.some((ws) => ws.id === stored)) {
      return stored;
    }
  } catch (error) {
    console.warn("[WORKSPACE] Unable to read stored workspace", error);
  }
  return "business";
};

const cbSaveWorkspaceToStorage = (workspaceId) => {
  try {
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, workspaceId);
  } catch (error) {
    console.warn("[WORKSPACE] Unable to persist workspace", error);
  }
};

cbCurrentWorkspaceId = cbLoadWorkspaceFromStorage();

function cbRequireAuthForChat(actionLabel = "chat-action") {
  if (cbIsAuthenticated()) {
    return true;
  }

  console.warn(`[AUTH] Blocked ${actionLabel}: user not authenticated. Opening onboarding.`);
  if (typeof openOnboardingModal === "function") {
    openOnboardingModal();
  } else {
    const modalFallback = document.querySelector("[data-onboarding-modal]");
    modalFallback?.classList?.add("is-open");
  }

  if (typeof window.cbShowInfoToast === "function") {
    window.cbShowInfoToast("Please sign in with Google to start a CoolBits session.");
  }

  return false;
}

const cbUpdateGuestHint = () => {
  const hint = document.getElementById("cb-guest-hint");
  if (!hint) {
    return;
  }
  const hasUser = Boolean(cbCurrentUser && cbCurrentUser.email);
  const badgeEmail = document
    .querySelector(".cb-user-badge-email")
    ?.textContent?.trim()
    .toLowerCase();
  const hasBadgeUser = Boolean(badgeEmail && badgeEmail !== "guest");
  hint.hidden = cbIsAuthenticated() || hasUser || hasBadgeUser;
};

const cbMaybeSendPendingSeed = () => {
  if (!cbPendingFirstMessage || !cbIsAuthenticated()) {
    return;
  }
  const pending = cbPendingFirstMessage;
  cbPendingFirstMessage = null;
  sendMessage(pending);
};

const PLAN_LABELS = {
  STARTER_FREE: "Starter",
  STARTER: "Starter",
  STARTER_BETA: "Starter",
  PRO: "Pro",
  AGENCY: "Agency",
};

const safeJson = async (response) => {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const normalizeProfile = (data = {}) => {
  return {
    ...defaultProfile,
    ...data,
    capabilities: {
      ...defaultProfile.capabilities,
      ...(data.capabilities || {}),
    },
    unlocks: Array.isArray(data.unlocks) && data.unlocks.length ? data.unlocks : defaultProfile.unlocks,
    reasoning: {
      ...defaultProfile.reasoning,
      ...(data.reasoning || {}),
    },
    flags: {
      ...(defaultProfile.flags || {}),
      ...(data.flags || {}),
    },
  };
};

const boolFromValue = (value) => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return ["1", "true", "yes", "on"].includes(normalized);
  }
  return false;
};

const suggestionsEnabled = (() => {
  if (typeof window === "undefined") {
    return false;
  }
  const candidates = [
    window.COOLBITS_ENABLE_SUGGESTIONS,
    window.coolbitsConfig?.ENABLE_SUGGESTIONS,
    document.body?.dataset?.enableSuggestions,
  ];
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null) {
      return boolFromValue(candidate);
    }
  }
  return true;
})();

const setSuggestionsState = (isActive) => {
  if (elements.suggestions) {
    elements.suggestions.dataset.enabled = isActive ? "true" : "false";
  }
  if (elements.suggestionsHeading) {
    elements.suggestionsHeading.hidden = false;
  }
};

setSuggestionsState(suggestionsEnabled);

const updateLevelBadge = () => {
  if (elements.levelPill) {
    elements.levelPill.textContent = profile.capabilities?.label || "Guest tier";
  }
  if (elements.levelMode) {
    const levelLabel = (profile.level || "level-0").toUpperCase();
    elements.levelMode.textContent = `Status: ${levelLabel}`;
  }
  if (elements.levelUnlock) {
    elements.levelUnlock.textContent = profile.unlocks?.[0] || defaultProfile.unlocks[0];
  }
  if (elements.levelBanner) {
    if (profile.flags?.wantsPlan) {
      elements.levelBanner.textContent = "Exploring full campaign plan potential.";
      elements.levelBanner.hidden = false;
    } else {
      elements.levelBanner.hidden = true;
    }
  }
  if (elements.reasoningBadge) {
    if (profile.flags?.hasEmailIntent) {
      elements.reasoningBadge.textContent = "Lead intent detected via email.";
      elements.reasoningBadge.dataset.state = "active";
    } else {
      elements.reasoningBadge.textContent = "Tell us what you're trying to improve.";
      elements.reasoningBadge.dataset.state = "idle";
    }
  }
  
  // Gate campaign button based on profile level
  if (elements.campaignButton) {
    const currentLevel = profile.level || 'level-0';
    const levelNum = parseInt(currentLevel.replace('level-', '')) || 0;
    
    if (levelNum === 0) {
      elements.campaignButton.hidden = true;
    } else if (levelNum < 4) {
      elements.campaignButton.hidden = false;
      elements.campaignButton.disabled = true;
      elements.campaignButton.textContent = 'Campaign Plan (Level 4 Required)';
      elements.campaignButton.title = 'Reach Level 4 to unlock Ultimate Campaign Plans';
    } else {
      elements.campaignButton.hidden = false;
      elements.campaignButton.disabled = false;
      elements.campaignButton.textContent = 'Request Campaign Plan';
      elements.campaignButton.title = 'Generate your ultimate campaign strategy';
    }
  }
};

const setProfile = (data) => {
  profile = normalizeProfile(data);
  profile.tier = profile.capabilities?.tier || 'guest';
  profile.visitorId = visitorId;
  window.coolbitsProfile = { ...profile };
  updateLevelBadge();
};

const fetchProfile = async () => {
  try {
    const response = await fetch(`${API_PROFILE}?visitor=${encodeURIComponent(visitorId)}`, {
      headers: cbGetAuthHeaders(),
      credentials: "include",
    });
    const payload = response.ok ? await safeJson(response) : null;
    if (payload) {
      setProfile(payload);
    } else {
      setProfile(defaultProfile);
    }
  } catch (error) {
    console.warn("profile fetch failed", error);
    setProfile(defaultProfile);
  } finally {
    profileLoaded = true;
    profilePromise = null;
  }
  return profile;
};

const ensureProfile = async () => {
  if (profileLoaded) {
    return profile;
  }
  if (window.coolbitsProfile && !profilePromise) {
    setProfile(window.coolbitsProfile);
    profileLoaded = true;
    return profile;
  }
  if (profilePromise) {
    return profilePromise;
  }
  profilePromise = fetchProfile();
  return profilePromise;
};

updateLevelBadge();

const loadHistory = () => {
  try {
    const raw = localStorage.getItem(historyKey);
    const parsed = JSON.parse(raw || "[]");
    if (Array.isArray(parsed)) {
      history = [];
      return parsed
        .filter((msg) => typeof msg?.content === "string" && msg.content.trim().length)
        .map((msg) => {
          const normalizedRole = msg.role === "bot" ? "assistant" : msg.role;
          if (normalizedRole === "user" || normalizedRole === "assistant") {
            history.push({ role: normalizedRole, content: msg.content });
          }
          return { ...msg, role: normalizedRole };
        });
    }
  } catch {
    // ignore storage errors
  }
  return [];
};

const saveHistory = () => {
  try {
    localStorage.setItem(historyKey, JSON.stringify(messages));
  } catch {
    // ignore storage errors
  }
};

let cbChatForceScrollToBottom = false;

const cbGetChatScrollContainer = () =>
  (elements.chatBody && elements.chatBody instanceof HTMLElement
    ? elements.chatBody
    : document.querySelector(".chat-body")) ||
  (elements.messages && elements.messages instanceof HTMLElement ? elements.messages : null);

const cbIsChatNearBottom = (container, threshold = 120) => {
  if (!container) return true;
  const maxScrollTop = container.scrollHeight - container.clientHeight;
  const current = container.scrollTop;
  return maxScrollTop - current <= threshold;
};

const cbEnsureChatScrollToBottomButton = () => {
  const host =
    (elements.chatContainer && elements.chatContainer instanceof HTMLElement
      ? elements.chatContainer
      : document.getElementById("chat-scroll")) ||
    null;
  if (!host) return null;

  const existing = document.getElementById("cb-scroll-to-bottom");
  if (existing) return existing;

  const button = document.createElement("button");
  button.type = "button";
  button.id = "cb-scroll-to-bottom";
  button.className = "cb-scroll-to-bottom";
  button.setAttribute("aria-label", "Scroll to bottom");
  button.setAttribute("aria-hidden", "true");
  button.tabIndex = -1;
  button.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 10l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
  button.addEventListener("click", () => {
    cbChatForceScrollToBottom = true;
    scrollToBottom();
  });
  host.appendChild(button);
  return button;
};

const cbUpdateChatScrollToBottomButton = () => {
  const container = cbGetChatScrollContainer();
  const button = cbEnsureChatScrollToBottomButton();
  if (!container || !button) return;
  const shouldShow = !cbIsChatNearBottom(container, 140);
  button.classList.toggle("is-visible", shouldShow);
  button.setAttribute("aria-hidden", shouldShow ? "false" : "true");
  button.tabIndex = shouldShow ? 0 : -1;
};

const cbBindChatScrollToBottomButton = () => {
  cbEnsureChatScrollToBottomButton();
  const container = cbGetChatScrollContainer();
  if (!container) return;
  if (container.dataset.cbScrollBottomBound === "true") return;
  container.addEventListener(
    "scroll",
    debounce(() => cbUpdateChatScrollToBottomButton(), 60),
    { passive: true }
  );
  container.dataset.cbScrollBottomBound = "true";
};

const scrollToBottom = () => {
  const container = cbGetChatScrollContainer();
  if (!container) return;
  requestAnimationFrame(() => {
    container.scrollTop = container.scrollHeight;
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
      cbUpdateChatScrollToBottomButton();
    });
  });
};

const consumeSeedMessage = () => {
  try {
    const params = new URLSearchParams(window.location.search);
    const first = params.get("first");
    const trimmed = (first || "").trim();
    if (!trimmed) {
      return "";
    }
    const fingerprint = `${window.location.pathname}?first=${trimmed}`;
    const previous = sessionStorage.getItem(SEED_STORE_KEY);
    if (previous === fingerprint) {
      return "";
    }
    sessionStorage.setItem(SEED_STORE_KEY, fingerprint);
    return trimmed;
  } catch {
    return "";
  }
};

const shortEmail = (value) => {
  if (!value) return "";
  if (value.length <= 28) {
    return value;
  }
  const [name, domain] = value.split("@");
  if (!domain) {
    return `${value.slice(0, 24)}…`;
  }
  const trimmedName = name.length > 12 ? `${name.slice(0, 12)}…` : name;
  return `${trimmedName}@${domain}`;
};

const formatTokens = (value) => {
  try {
    return value.toLocaleString();
  } catch {
    return String(value);
  }
};

const cbHasSeenPlansModal = () => {
  try {
    return window.localStorage.getItem(CB_PLAN_MODAL_SEEN_KEY) === "1";
  } catch {
    return false;
  }
};

const cbMarkPlansModalSeen = () => {
  try {
    window.localStorage.setItem(CB_PLAN_MODAL_SEEN_KEY, "1");
  } catch (error) {
    console.warn("[PLANS] unable to persist modal flag", error);
  }
};

const cbPlanNoteCopy = {
  onboarding: "Start with Starter, or unlock more workspaces and tokens. All paid plans include a 15-day free trial.",
  billing: "Upgrade your plan to unlock more workspaces, projects, and tokens.",
  menu: "Choose the CoolBits plan that fits your workspace.",
};

const cbSetPlanModalView = (view = "plans") => {
  const plansView = document.getElementById("cb-plan-view-plans");
  const enterpriseView = document.getElementById("cb-plan-view-enterprise");
  const showPlans = view !== "contact";
  if (plansView) {
    plansView.classList.toggle("cb-plan-view-hidden", !showPlans);
  }
  if (enterpriseView) {
    enterpriseView.classList.toggle("cb-plan-view-hidden", showPlans);
  }
};

const cbUpdateContactFormCopy = () => {
  const subtitleEl = document.getElementById("cb-contact-subtitle");
  const titleEl = document.getElementById("cb-contact-title");
  const copyEl = document.getElementById("cb-contact-copy");
  const consentEl = document.getElementById("cb-contact-consent-label");
  const isSupport = cbContactContext.context === "support";
  if (subtitleEl) {
    subtitleEl.textContent = isSupport ? "Support" : "Enterprise";
  }
  if (titleEl) {
    titleEl.textContent = isSupport ? "Contact support" : "Contact us";
  }
  if (copyEl) {
    copyEl.textContent = isSupport
      ? "Tell us how we can help with your CoolBits account."
      : "Tell us a bit about your team. We'll follow up to tailor an enterprise plan.";
  }
  if (consentEl) {
    consentEl.textContent = "I agree to be contacted by CoolBits regarding my request.";
  }
};

const cbGetEnterpriseFormElements = () => ({
  container: document.getElementById("cb-plan-view-enterprise"),
  errorEl: document.getElementById("cb-enterprise-form-error"),
  sendingEl: document.getElementById("cb-enterprise-sending"),
  submitBtn: document.getElementById("cb-enterprise-submit"),
  cancelBtn: document.getElementById("cb-enterprise-cancel"),
  nameInput: document.getElementById("cb-enterprise-name"),
  emailInput: document.getElementById("cb-enterprise-email"),
  companyInput: document.getElementById("cb-enterprise-company"),
  websiteInput: document.getElementById("cb-enterprise-website"),
  spendSelect: document.getElementById("cb-enterprise-spend"),
  interestsContainer: document.getElementById("cb-enterprise-interests"),
  messageInput: document.getElementById("cb-enterprise-message"),
  captchaCheckbox: document.getElementById("cb-enterprise-captcha"),
  consentCheckbox: document.getElementById("cb-enterprise-consent"),
});

const cbResetEnterpriseForm = () => {
  const els = cbGetEnterpriseFormElements();
  if (!els.container) return;
  const {
    nameInput,
    emailInput,
    companyInput,
    websiteInput,
    spendSelect,
    interestsContainer,
    messageInput,
    captchaCheckbox,
    consentCheckbox,
    errorEl,
    sendingEl,
    submitBtn,
  } = els;
  if (nameInput) nameInput.value = "";
  if (emailInput) emailInput.value = "";
  if (companyInput) companyInput.value = "";
  if (websiteInput) websiteInput.value = "";
  if (spendSelect) spendSelect.value = "";
  if (messageInput) messageInput.value = "";
  if (captchaCheckbox) captchaCheckbox.checked = false;
  if (consentCheckbox) consentCheckbox.checked = false;
  if (interestsContainer) {
    interestsContainer.querySelectorAll("input[type='checkbox']").forEach((cb) => {
      cb.checked = false;
    });
  }
  if (errorEl) {
    errorEl.textContent = "";
    errorEl.hidden = true;
  }
  cbEnterpriseFormState.errors = {};
  cbEnterpriseFormState.submitError = "";
  cbEnterpriseFormState.loading = false;
  if (sendingEl) sendingEl.hidden = true;
  if (submitBtn) submitBtn.disabled = false;
  ["name", "email", "company", "website", "spend", "interests", "message", "captcha", "consent"].forEach((key) => {
    const errEl = document.getElementById(`cb-enterprise-${key}-error`);
    if (errEl) {
      errEl.textContent = "";
      errEl.hidden = true;
    }
  });
};

const cbOpenContactForm = (options = {}) => {
  const context = options.context === "support" ? "support" : "enterprise";
  const origin =
    typeof options.origin === "string" && options.origin.trim()
      ? options.origin.trim()
      : context === "support"
      ? "coolbits-support"
      : "coolbits-account-billing-enterprise";
  const planCode = context === "support" ? "support" : "enterprise";
  const returnTo = options.returnTo === "account" ? "account" : "plans";
  cbContactContext = { context, origin, planCode, returnTo };
  cbResetEnterpriseForm();
  cbUpdateContactFormCopy();
  cbSetPlanModalView("contact");
  openModal("cb-plan-modal");
};

const cbOpenEnterpriseContactForm = () => {
  cbOpenContactForm({
    context: "enterprise",
    origin: "coolbits-account-billing-enterprise",
    returnTo: "plans",
  });
};

const cbOpenSupportContactForm = () => {
  cbOpenContactForm({
    context: "support",
    origin: "coolbits-support",
    returnTo: "account",
  });
};

const cbCloseContactForm = ({ skipReopen } = {}) => {
  if (cbContactContext.returnTo === "account") {
    closeModal("cb-plan-modal", { silentFocus: true });
    cbSetPlanModalView("plans");
    if (!skipReopen) {
      cbOpenAccountBilling({ view: "overview" });
    }
    return;
  }
  cbSetPlanModalView("plans");
};

const cbShowContactSuccessBanner = () => {
  const banner = document.getElementById("cb-enterprise-success-banner");
  if (banner) {
    banner.hidden = false;
    banner.textContent =
      cbContactContext.context === "support"
        ? "Your support request was sent. We'll contact you soon."
        : "Your Enterprise request was sent. We'll contact you soon.";
  }
};

const cbCollectEnterpriseFormData = () => {
  const els = cbGetEnterpriseFormElements();
  const interests = [];
  if (els.interestsContainer) {
    els.interestsContainer.querySelectorAll("input[type='checkbox']").forEach((cb) => {
      if (cb.checked && cb.value) interests.push(cb.value);
    });
  }
  return {
    name: (els.nameInput?.value || "").trim(),
    email: (els.emailInput?.value || "").trim(),
    company: (els.companyInput?.value || "").trim(),
    website: (els.websiteInput?.value || "").trim(),
    monthlySpend: els.spendSelect?.value || "",
    interests,
    message: (els.messageInput?.value || "").trim(),
    captchaVerified: !!els.captchaCheckbox?.checked,
    consent: !!els.consentCheckbox?.checked,
  };
};

const cbValidateEnterpriseForm = (data) => {
  const errors = {};
  if (!data.name) errors.name = "Name is required.";
  if (!data.email || !data.email.includes("@")) errors.email = "Enter a valid email.";
  if (data.website) {
    const urlPattern = /^(https?:\/\/)?[^\s]+\.[^\s]+$/i;
    if (!urlPattern.test(data.website)) {
      errors.website = "Enter a valid URL (include domain).";
    }
  }
  if (!data.monthlySpend) errors.spend = "Select a spend range.";
  if (!Array.isArray(data.interests) || !data.interests.length) {
    errors.interests = "Select at least one interest.";
  }
  if (!data.message) {
    errors.message = "Message is required.";
  } else if (data.message.length > 1000) {
    errors.message = "Keep the message under 1000 characters.";
  }
  if (!data.captchaVerified) errors.captcha = "Please verify the CAPTCHA.";
  if (!data.consent) errors.consent = "Consent is required.";
  return errors;
};

const cbRenderEnterpriseFormState = () => {
  const els = cbGetEnterpriseFormElements();
  if (!els.container) return;
  const {
    errorEl,
    sendingEl,
    submitBtn,
    nameInput,
    emailInput,
    companyInput,
    websiteInput,
    spendSelect,
    interestsContainer,
    messageInput,
    captchaCheckbox,
    consentCheckbox,
  } = els;
  const { errors, submitError, loading } = cbEnterpriseFormState;
  const setError = (key, message) => {
    const el = document.getElementById(`cb-enterprise-${key}-error`);
    if (!el) return;
    if (message) {
      el.textContent = message;
      el.hidden = false;
    } else {
      el.textContent = "";
      el.hidden = true;
    }
  };
  setError("name", errors.name);
  setError("email", errors.email);
  setError("company", errors.company);
  setError("website", errors.website);
  setError("spend", errors.spend);
  setError("interests", errors.interests);
  setError("message", errors.message);
  setError("captcha", errors.captcha);
  setError("consent", errors.consent);

  if (errorEl) {
    if (submitError) {
      errorEl.textContent = submitError;
      errorEl.hidden = false;
    } else {
      errorEl.textContent = "";
      errorEl.hidden = true;
    }
  }
  if (sendingEl) sendingEl.hidden = !loading;
  if (submitBtn) submitBtn.disabled = !!loading;
  if (nameInput) nameInput.disabled = !!loading;
  if (emailInput) emailInput.disabled = !!loading;
  if (companyInput) companyInput.disabled = !!loading;
  if (websiteInput) websiteInput.disabled = !!loading;
  if (spendSelect) spendSelect.disabled = !!loading;
  if (messageInput) messageInput.disabled = !!loading;
  if (captchaCheckbox) captchaCheckbox.disabled = !!loading;
  if (consentCheckbox) consentCheckbox.disabled = !!loading;
  if (interestsContainer) {
    interestsContainer
      .querySelectorAll("input[type='checkbox']")
      .forEach((cb) => (cb.disabled = !!loading));
  }
};

const cbSubmitEnterpriseContactForm = async (event) => {
  event?.preventDefault?.();
  if (cbEnterpriseFormState.loading) return;
  const data = cbCollectEnterpriseFormData();
  const errors = cbValidateEnterpriseForm(data);
  cbEnterpriseFormState.errors = errors;
  cbEnterpriseFormState.submitError = "";
  if (Object.keys(errors).length) {
    cbEnterpriseFormState.loading = false;
    cbRenderEnterpriseFormState();
    return;
  }
  cbEnterpriseFormState.loading = true;
  cbRenderEnterpriseFormState();
  try {
    const response = await fetch("/api/contact/enterprise", {
      method: "POST",
      headers: cbGetAuthHeaders({ "Content-Type": "application/json" }),
      credentials: "include",
      body: JSON.stringify({
        ...data,
        planCode: cbContactContext.planCode || "enterprise",
        origin: cbContactContext.origin || "coolbits-account-billing-enterprise",
      }),
    });
    if (!response.ok) {
      const message = "We couldn't send your request right now. Please try again later.";
      cbEnterpriseFormState.submitError = message;
      cbEnterpriseFormState.loading = false;
      cbRenderEnterpriseFormState();
      return;
    }
    cbEnterpriseFormState.loading = false;
    cbEnterpriseFormState.submitError = "";
    cbEnterpriseFormState.errors = {};
    cbRenderEnterpriseFormState();
    cbCloseContactForm({ skipReopen: true });
    closeModal("cb-plan-modal");
    cbShowContactSuccessBanner();
    cbOpenAccountBilling({ view: "overview" });
  } catch (error) {
    console.error("[ENTERPRISE_CONTACT] submit failed", error);
    cbEnterpriseFormState.submitError =
      "We couldn't send your request right now. Please try again later.";
    cbEnterpriseFormState.loading = false;
    cbRenderEnterpriseFormState();
  }
};


const cbRenderPlansModal = () => {
  const modal = document.getElementById("cb-plan-modal");
  if (!modal) return;
  const noteEl = document.getElementById("cb-plan-modal-note");
  const errorEl = document.getElementById("cb-plan-modal-error");
  const cardsEl = document.getElementById("cb-plan-cards");
  if (noteEl) {
    noteEl.textContent = cbPlanNoteCopy[cbPlanModalState.source] || cbPlanNoteCopy.menu;
  }
  if (errorEl) {
    if (cbPlanModalState.error) {
      errorEl.textContent = cbPlanModalState.error;
      errorEl.hidden = false;
    } else {
      errorEl.textContent = "";
      errorEl.hidden = true;
    }
  }
  if (!cardsEl) return;
  cardsEl.classList.add("cb-plan-grid");
  if (cbPlanModalState.loading) {
    cardsEl.innerHTML = `<div class="cb-modal-section">Loading plans...</div>`;
    return;
  }
  const summaryPlan = cbNormalizePlanCode(cbPlanModalState.summary?.plan);
  const currentPlan = PLAN_DEFINITIONS[summaryPlan] ? summaryPlan : "starter";
  const highlightPlan = cbPlanModalState.highlightPlan || null;
  let cardsHtml = "";
  PLAN_CODES.forEach((code) => {
    const def = PLAN_DEFINITIONS[code];
    const isCurrent = currentPlan === code;
    const isHighlighted = highlightPlan === code;
    const isLoading = !!cbPlanUpgradeLoading[code];
    const badgeText = def.trialDays ? `${def.trialDays}-day free trial` : "Contact us";
    const featureItems = [
      def.workspaces,
      def.projects === "all" ? "All projects" : `${def.projects} projects`,
      def.agents === "all" ? "Unlimited AI agents" : `${def.agents} AI agents`,
      def.connectors === "all" ? "All connectors" : `${def.connectors} connectors`,
      `${formatTokens(def.tokensPerMonth)} tokens / month`,
    ];
    let actionMarkup = "";
    if (isCurrent) {
      actionMarkup = `<button type="button" class="cb-plan-current-pill" disabled>Current plan</button>`;
    } else if (code === "enterprise") {
      actionMarkup = `<button type="button" class="btn-secondary" data-plan-contact="${code}">Contact us</button>`;
    } else {
      const btnLabel = def.trialDays ? `Start ${def.trialDays}-day free trial` : "Select plan";
      const label = isLoading ? "Redirecting..." : btnLabel;
      const disabledAttr = isLoading ? "disabled" : "";
      actionMarkup = `<button type="button" class="btn btn-primary cb-plan-select-btn" data-plan-select="${code}" ${disabledAttr}>${label}</button>`;
    }
    const cardClasses = ["cb-modal-section", "cb-plan-card"];
    if (isCurrent) {
      cardClasses.push("is-current");
    } else if (isHighlighted) {
      cardClasses.push("is-highlighted");
    }
    cardsHtml += `
      <div class="${cardClasses.join(" ")}" data-plan-code="${code}">
        <div class="cb-plan-card-header">
          <div>
            <h3 class="cb-plan-card-title">${def.label}</h3>
            <p class="cb-plan-price">${def.currency === "EUR" ? "€" : ""}${def.price} / month</p>
          </div>
        </div>
        <ul class="cb-plan-bullets">
          ${featureItems.map((item) => `<li>${item}</li>`).join("")}
        </ul>
        <div class="cb-plan-badge">${badgeText}</div>
        <div class="cb-plan-card-action">
          ${actionMarkup}
        </div>
      </div>
    `;
  });
  cardsEl.innerHTML = cardsHtml;
  PLAN_CODES.forEach((code) => {
    const selectBtn = cardsEl.querySelector(`[data-plan-select="${code}"]`);
    if (selectBtn) {
      selectBtn.addEventListener("click", () => startPlanUpgrade(code));
      if (cbPlanUpgradeLoading[code]) {
        selectBtn.setAttribute("disabled", "disabled");
      }
    }
  });
  const contactBtn = cardsEl.querySelector("[data-plan-contact]");
  if (contactBtn) {
    contactBtn.addEventListener("click", cbOpenEnterpriseContactForm);
  }
};

const setupEnterpriseContactFormHandlers = () => {
  const { submitBtn, cancelBtn } = cbGetEnterpriseFormElements();
  if (submitBtn && submitBtn.dataset.bound !== "true") {
    submitBtn.addEventListener("click", cbSubmitEnterpriseContactForm);
    submitBtn.dataset.bound = "true";
  }
  if (cancelBtn && cancelBtn.dataset.bound !== "true") {
    cancelBtn.addEventListener("click", (event) => {
      event?.preventDefault?.();
      cbCloseContactForm();
    });
    cancelBtn.dataset.bound = "true";
  }
};

const cbOpenPlansModal = (options = {}) => {
  const { source = "menu", highlightPlan = null, summary = null } = options;
  const initialSummary = summary || cbLatestBillingSummary;
  if (summary) {
    cbSetBillingSummary(summary);
  }
  cbPlanModalState.source = source;
  cbPlanModalState.highlightPlan = highlightPlan;
  cbPlanModalState.error = null;
  cbPlanModalState.summary = initialSummary || null;
  cbPlanModalState.loading = !initialSummary;
  cbSetPlanModalView("plans");
  cbResetEnterpriseForm();
  cbContactContext = {
    context: "enterprise",
    origin: "coolbits-account-billing-enterprise",
    planCode: "enterprise",
    returnTo: "plans",
  };
  if (source === "onboarding") {
    cbMarkPlansModalSeen();
  }
  console.log("[PLANS] modal open", { source, highlightPlan });
  cbRenderPlansModal();
  openModal("cb-plan-modal");
  if (initialSummary) {
    cbPlanModalState.loading = false;
    cbRenderPlansModal();
    return;
  }
  fetchBillingSummary()
    .then((payload) => {
      cbPlanModalState.summary = payload || cbLatestBillingSummary;
    })
    .catch((error) => {
      console.error("[PLANS] summary fetch failed", error);
      cbPlanModalState.error = "Unable to load plan details. Please try again.";
    })
    .finally(() => {
      cbPlanModalState.loading = false;
      cbRenderPlansModal();
    });
};

const startPlanUpgrade = async (planCode) => {
  const normalized = typeof planCode === "string" ? planCode.toLowerCase() : "";
  if (!PLAN_DEFINITIONS[normalized]) {
    console.warn("[BILLING] unknown plan code", planCode);
    return;
  }
  if (cbPlanUpgradeLoading[normalized]) {
    return;
  }
  cbPlanUpgradeLoading[normalized] = true;
  cbPlanModalState.error = null;
  cbRenderPlansModal();
  console.log("[BILLING] upgrade click", { plan: normalized });
  try {
    const response = await fetch(API_BILLING_UPGRADE, {
      method: "POST",
      headers: cbGetAuthHeaders({ "Content-Type": "application/json" }),
      credentials: "include",
      body: JSON.stringify({ plan: normalized }),
    });
    console.log("[BILLING] upgrade status", response.status);
    const data = await safeJson(response);
    if (!response.ok) {
      const errText =
        typeof data?.error === "string" && data.error.trim()
          ? data.error.trim()
          : "Upgrade failed. Please try again.";
      console.warn("[BILLING] upgrade error", response.status, errText);
      cbPlanModalState.error = errText;
      cbRenderPlansModal();
      return;
    }
    const checkoutUrl =
      typeof data?.checkoutUrl === "string" ? data.checkoutUrl.trim() : "";
    if (!checkoutUrl) {
      const message = "Could not start checkout. Please try again.";
      console.warn("[BILLING] missing checkoutUrl", data);
      cbPlanModalState.error = message;
      cbRenderPlansModal();
      return;
    }
    console.log("[BILLING] upgrade redirect", { plan: normalized });
    window.location.href = checkoutUrl;
  } catch (error) {
    console.error("[BILLING] upgrade exception", error);
    cbPlanModalState.error = "Network error during upgrade. Please try again.";
    cbRenderPlansModal();
  } finally {
    cbPlanUpgradeLoading[normalized] = false;
  }
};

const cbMaybeShowPlansAfterLogin = (summary) => {
  if (!summary || cbHasSeenPlansModal()) {
    return;
  }
  const planCode = cbNormalizePlanCode(summary.plan);
  const subscriptionStatus = (summary?.stripe?.status || "")
    .toString()
    .toLowerCase();
  const shouldShow =
    planCode === "starter" &&
    (!subscriptionStatus ||
      subscriptionStatus === "trialing" ||
      subscriptionStatus === "incomplete" ||
      subscriptionStatus === "inactive");
  if (!shouldShow) {
    return;
  }
  cbOpenPlansModal({ source: "onboarding", highlightPlan: "starter", summary });
};
const getQueryParam = (name) => {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  } catch (error) {
    console.warn("[QUERY] unable to parse params", error);
    return null;
  }
};

const getPlanLabel = (user) => {
  if (!user) {
    return STARTER_PLAN;
  }
  if (typeof user.planLabel === "string" && user.planLabel.trim()) {
    return user.planLabel.trim();
  }
  if (typeof user.planId === "string" && PLAN_LABELS[user.planId]) {
    return PLAN_LABELS[user.planId];
  }
  return STARTER_PLAN;
};

const getNormalizedPlanId = (user) => {
  if (!user || typeof user.planId !== "string") {
    return "";
  }
  return user.planId.toUpperCase();
};

const isPaidPlan = (planId = "") => {
  const normalized = String(planId || "").toUpperCase();
  return normalized === "PRO" || normalized === "AGENCY";
};

const updateUserBadge = () => {
  const badge = document.getElementById("cb-user-badge");
  const emailNode = badge?.querySelector(".cb-user-badge-email");
  const planNode = badge?.querySelector(".cb-user-badge-plan");
  const usageNode = badge?.querySelector(".cb-user-badge-tokens");
  if (!badge || !emailNode || !planNode || !usageNode) {
    return;
  }

  const setGuestBadge = () => {
    emailNode.textContent = "Guest";
    planNode.textContent = "Free trial";
    usageNode.textContent = "1,000 tokens left";
    cbRenderAccountFooter({ emailLine: "Guest" });
    cbUpdateHeaderEmail("Guest");
    cbSetTokenLimitBannerVisible(false);
  };

  if (!cbCurrentUser || !cbCurrentUser.email) {
    setGuestBadge();
    console.debug("[USAGE_BADGE]", {
      email: "guest",
      planId: "guest",
      includedCbtRemaining: null,
      includedCbtPerMonth: null,
      usageLine: "1,000 tokens left",
    });
    return;
  }

  const email = cbCurrentUser.email || "";
  const planLabel = getPlanLabel(cbCurrentUser);
  const usageLine = cbFormatUsageLabel(cbCurrentUser);
  emailNode.textContent = shortEmail(email);
  planNode.textContent = planLabel;
  usageNode.textContent = usageLine;
  cbRenderAccountFooter({ emailLine: shortEmail(email) });
  cbUpdateHeaderEmail(email);
  console.debug("[USAGE_BADGE]", {
    email,
    planId: cbCurrentUser.planId || null,
    includedCbtRemaining: cbCurrentUser.includedCbtRemaining ?? null,
    includedCbtPerMonth: cbCurrentUser.includedCbtPerMonth ?? null,
    usageLine,
  });
  cbSetTokenLimitBannerVisible(cbIsTokenExhaustedFromSummary());
  cbUpdateGuestHint();
};

const loadSidebarCollapsedFromStorage = () => {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === "1";
  } catch (error) {
    console.warn("[SIDEBAR] Unable to read stored state", error);
    return false;
  }
};

const setSidebarCollapsed = (collapsed, { persist = true } = {}) => {
  const { sidebar, sidebarToggle } = shellElements;
  if (sidebar) {
    sidebar.setAttribute("data-collapsed", collapsed ? "true" : "false");
  }
  if (sidebarToggle) {
    sidebarToggle.setAttribute("aria-pressed", collapsed ? "true" : "false");
    sidebarToggle.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
  }
  const root = document.body;
  if (root) {
    root.classList.toggle("cb-sidebar-collapsed", collapsed);
  }
  cbRepositionSidebarMenus();
  if (persist) {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch (error) {
      console.warn("[SIDEBAR] Unable to persist state", error);
    }
  }
};

const isSidebarCollapsed = () => {
  return shellElements.sidebar?.getAttribute("data-collapsed") === "true";
};

const cbSetProjectsError = (message) => {
  const errorEl = shellElements.projectsError;
  if (!errorEl) {
    return;
  }
  if (message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  } else {
    errorEl.textContent = "";
    errorEl.hidden = true;
  }
};

const cbSetProjectModalError = (message) => {
  const errorEl = shellElements.projectModalError;
  if (!errorEl) {
    return;
  }
  if (message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  } else {
    errorEl.textContent = "";
    errorEl.hidden = true;
  }
};

const cbSetRenameModalError = (message) => {
  const errorEl = shellElements.renameError;
  if (!errorEl) {
    return;
  }
  if (message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  } else {
    errorEl.textContent = "";
    errorEl.hidden = true;
  }
};

const cbResetFloatingMenuStyles = (menu, { isUserMenu = false } = {}) => {
  if (!menu) return;
  if (!isUserMenu) {
    menu.classList.remove("is-floating");
    menu.style.removeProperty("--cb-menu-top");
    menu.style.removeProperty("--cb-menu-left");
    menu.style.removeProperty("--cb-menu-width");
  } else {
    menu.classList.remove("is-floating");
    menu.style.removeProperty("--cb-user-menu-top");
    menu.style.removeProperty("--cb-user-menu-left");
    menu.style.removeProperty("--cb-user-menu-width");
  }
  menu.style.visibility = "";
};

const cbPositionSidebarMenu = (menu, trigger) => {
  if (!menu || !trigger) {
    return;
  }
  menu.classList.add("is-floating");
  menu.style.visibility = "hidden";
  requestAnimationFrame(() => {
    if (menu.hidden || !trigger.isConnected) {
      menu.style.visibility = "";
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const collapsed = isSidebarCollapsed();
    const menuWidth = collapsed ? 220 : Math.max(220, rect.width);
    menu.style.setProperty("--cb-menu-width", `${menuWidth}px`);
    const menuRect = menu.getBoundingClientRect();
    const menuHeight = menuRect.height || menu.scrollHeight || 0;
    const margin = 12;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    let top = collapsed ? rect.top + rect.height / 2 - menuHeight / 2 : rect.bottom + 8;
    let left = collapsed ? rect.right + 12 : rect.left;
    if (!Number.isFinite(top)) {
      top = margin;
    }
    const maxTop = Math.max(margin, viewportHeight - menuHeight - margin);
    top = Math.max(margin, Math.min(top, maxTop));
    const maxLeft = Math.max(margin, viewportWidth - menuWidth - margin);
    left = Math.max(margin, Math.min(left, maxLeft));
    menu.style.setProperty("--cb-menu-top", `${Math.round(top)}px`);
    menu.style.setProperty("--cb-menu-left", `${Math.round(left)}px`);
    menu.style.visibility = "";
  });
};

const cbIsUserAreaInSidebar = () => {
  const userArea = document.getElementById("cb-user-area");
  const { userSlot } = shellElements;
  return !!(userArea && userSlot && userSlot.contains(userArea));
};

const cbPositionUserMenu = () => {
  const menu = document.getElementById("cb-user-menu");
  const button = document.getElementById("cb-user-button");
  if (!menu || !button) {
    return;
  }
  if (!cbIsUserAreaInSidebar()) {
    cbResetFloatingMenuStyles(menu, { isUserMenu: true });
    return;
  }
  menu.classList.add("is-floating");
  menu.style.visibility = "hidden";
  requestAnimationFrame(() => {
    if (!userMenuOpen || menu.hidden) {
      cbResetFloatingMenuStyles(menu, { isUserMenu: true });
      return;
    }
    const rect = button.getBoundingClientRect();
    const collapsed = isSidebarCollapsed();
    const menuWidth = 220;
    menu.style.setProperty("--cb-user-menu-width", `${menuWidth}px`);
    const menuRect = menu.getBoundingClientRect();
    const menuHeight = menuRect.height || menu.scrollHeight || 0;
    const margin = 12;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    let top = collapsed ? rect.top - 6 : rect.bottom + 8;
    const maxTop = Math.max(margin, viewportHeight - menuHeight - margin);
    top = Math.max(margin, Math.min(top, maxTop));
    let left = collapsed ? rect.right + 12 : rect.left;
    const maxLeft = Math.max(margin, viewportWidth - menuWidth - margin);
    left = Math.max(margin, Math.min(left, maxLeft));
    menu.style.setProperty("--cb-user-menu-top", `${Math.round(top)}px`);
    menu.style.setProperty("--cb-user-menu-left", `${Math.round(left)}px`);
    menu.style.visibility = "";
  });
};

const cbGetComposerInput = () => {
  return elements.input || document.getElementById("chat-input");
};

const cbEstimatePromptTokens = (text) => {
  if (!text) return 0;
  const chars = text.trim().length;
  if (!chars) return 0;
  return Math.max(0, Math.ceil(chars / 4));
};

const cbGetPromptContext = () => {
  const councilSelected = Array.isArray(cbCouncilState?.selectedKeys)
    ? cbCouncilState.selectedKeys.length > 0
    : false;
  const councilArmed = !!(cbCouncilState?.armed || councilSelected);
  const googleAdsConnected = (cbConnectorState?.googleads?.status || "").toLowerCase() === "connected";
  const ga4Connected = (cbConnectorState?.ga4?.status || "").toLowerCase() === "connected";
  return {
    councilArmed,
    usesConnectors: googleAdsConnected || ga4Connected,
  };
};

const cbEstimateEffectiveTokens = (baseTokens, ctx = {}) => {
  let estimate = Math.max(0, baseTokens || 0);
  if (!estimate) return 0;
  if (ctx.councilArmed) {
    estimate *= 1.5;
  }
  if (ctx.usesConnectors) {
    estimate *= 1.2;
  }
  return Math.ceil(estimate);
};

const cbClassifyPromptSize = (tokensEffective) => {
  const t = Math.max(0, tokensEffective || 0);
  if (t <= 120) return "xs";
  if (t <= 300) return "s";
  if (t <= 700) return "m";
  if (t <= 1500) return "l";
  return "xl";
};

const cbClassifyOutcomeHint = (text, ctx = {}) => {
  const length = text ? text.trim().length : 0;
  if (!length) return "General reasoning";
  if (length < 140) return "Quick Q&A";
  if (length < 320) return ctx.councilArmed ? "Council tap-in" : "Focused answer";
  if (length < 640) return ctx.usesConnectors ? "Data-aware summary" : "Multi-point summary";
  if (length < 1200) return ctx.councilArmed ? "Multi-agent analysis" : "Long narrative";
  return "Deep dive / long form";
};

const cbRenderPromptMeter = () => {
  const el = document.getElementById("cb-prompt-meter");
  if (!el) return;
  const s = cbPromptMeterState;
  if (!s.tokensBase) {
    el.innerHTML = "";
    return;
  }

  const labelMap = {
    xs: "XS · very light",
    s: "S · light",
    m: "M · medium",
    l: "L · heavy",
    xl: "XL · very heavy",
  };
  const payloadLabel = labelMap[s.sizeClass] || "—";
  const summary = cbLatestBillingSummary || null;
  const planNode = summary?.plan || {};
  const usageNode = summary?.usage || {};
  const monthlyTokens = Number(
    planNode.monthlyTokens ??
    planNode.tokensPerMonth ??
    usageNode.tokensAllowance ??
    usageNode.tokensPerMonth ??
    0
  );
  const usedTokens = Number(
    usageNode.usedTokens ??
    usageNode.tokensUsedThisPeriod ??
    usageNode.tokensUsed ??
    usageNode.totalUsed ??
    0
  );
  const hasBilling = Number.isFinite(monthlyTokens) && monthlyTokens > 0;

  const impactHtml = hasBilling
    ? `<div class="cb-prompt-meter-meta">
         ~${s.pctOfPlan.toFixed(2)}% of your monthly cbT · after send: ~${s.pctAfterSend.toFixed(2)}%
       </div>`
    : `<div class="cb-prompt-meter-meta">
         Billing summary unavailable · showing tokens only
       </div>`;

  el.innerHTML = `
    <div class="cb-card cb-prompt-meter">
      <div class="cb-prompt-meter-left">
        <div class="cb-prompt-meter-title">Prompt payload</div>
        <div class="cb-prompt-meter-bar">
          <div class="cb-prompt-meter-fill cb-prompt-meter-fill--${s.sizeClass}"></div>
        </div>
        <div class="cb-prompt-meter-meta">
          ${payloadLabel} · ~${s.tokensEffective.toLocaleString()} tokens
        </div>
      </div>
      <div class="cb-prompt-meter-middle">
        <div class="cb-prompt-meter-label">Estimated impact</div>
        ${impactHtml}
        ${hasBilling ? `<div class="cb-prompt-meter-meta">Plan tokens: ${monthlyTokens.toLocaleString()} · Used: ${usedTokens.toLocaleString()}</div>` : ""}
      </div>
      <div class="cb-prompt-meter-right">
        <div class="cb-prompt-meter-label">Outcome</div>
        <div class="cb-badge cb-badge--soft">${s.outcomeHint}</div>
      </div>
    </div>
  `;
};

const cbUpdatePromptMeter = () => {
  const input = cbGetComposerInput();
  const text = input?.value || "";
  const baseTokens = cbEstimatePromptTokens(text);
  if (!baseTokens) {
    cbPromptMeterState.tokensBase = 0;
    cbPromptMeterState.tokensEffective = 0;
    cbPromptMeterState.pctOfPlan = 0;
    cbPromptMeterState.pctAfterSend = 0;
    cbPromptMeterState.sizeClass = "xs";
    cbPromptMeterState.outcomeHint = "General reasoning";
    cbRenderPromptMeter();
    cbUpdateChatHeader();
    return;
  }

  const ctx = cbGetPromptContext();
  const effectiveTokens = cbEstimateEffectiveTokens(baseTokens, ctx);

  const summary = cbLatestBillingSummary || null;
  const planNode = summary?.plan || {};
  const usageNode = summary?.usage || {};
  const monthlyTokens = Number(
    planNode.monthlyTokens ??
    planNode.tokensPerMonth ??
    usageNode.tokensAllowance ??
    usageNode.tokensPerMonth ??
    0
  );
  const usedTokens = Number(
    usageNode.usedTokens ??
    usageNode.tokensUsedThisPeriod ??
    usageNode.tokensUsed ??
    usageNode.totalUsed ??
    0
  );

  let pctOfPlan = 0;
  let pctAfterSend = 0;
  if (monthlyTokens > 0 && Number.isFinite(monthlyTokens)) {
    pctOfPlan = (effectiveTokens / monthlyTokens) * 100;
    pctAfterSend = ((usedTokens + effectiveTokens) / monthlyTokens) * 100;
  }

  cbPromptMeterState.tokensBase = baseTokens;
  cbPromptMeterState.tokensEffective = effectiveTokens;
  cbPromptMeterState.pctOfPlan = pctOfPlan;
  cbPromptMeterState.pctAfterSend = pctAfterSend;
  cbPromptMeterState.sizeClass = cbClassifyPromptSize(effectiveTokens);
  cbPromptMeterState.outcomeHint = cbClassifyOutcomeHint(text, ctx);
  cbRenderPromptMeter();
  cbUpdateChatHeader();
};

const cbResizeComposerInput = () => {
  const input = cbGetComposerInput();
  if (!input) {
    return;
  }
  const styles = window.getComputedStyle(input);
  const lineHeight = parseFloat(styles.lineHeight) || 26;
  const paddingTop = parseFloat(styles.paddingTop) || 0;
  const paddingBottom = parseFloat(styles.paddingBottom) || 0;
  const cssMinHeight = parseFloat(styles.minHeight) || 52;
  const storedMax = parseFloat(input.dataset.composerMaxHeight || "");
  const baseMax = 260; // Match CSS max-height (10 lines)
  const maxHeight = Number.isFinite(storedMax) ? storedMax : baseMax;
  if (!Number.isFinite(storedMax)) {
    input.dataset.composerMaxHeight = String(Math.round(maxHeight));
  }
  const storedMin = parseFloat(input.dataset.composerMinHeight || "");
  const baseMin = cssMinHeight;
  const minHeight = Number.isFinite(storedMin) ? storedMin : baseMin;
  if (!Number.isFinite(storedMin)) {
    input.dataset.composerMinHeight = String(Math.round(minHeight));
  }
  input.style.height = "auto";
  const rawTarget = input.scrollHeight;
  const targetHeight = Math.max(minHeight, Math.min(maxHeight, rawTarget));
  input.style.height = `${Math.round(targetHeight)}px`;
  input.style.overflowY = rawTarget > maxHeight ? "auto" : "hidden";
  cbUpdatePromptMeter();
};

const cbHandleComposerKeydown = (event) => {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) {
    return;
  }
  const input = cbGetComposerInput();
  if (!input) {
    return;
  }
  event.preventDefault();
  if (!input.value || !input.value.trim()) {
    return;
  }
  sendMessage();
};

const cbSetupComposerInput = () => {
  const input = cbGetComposerInput();
  if (!input) {
    return;
  }
  if (!input.dataset.composerEnhanced) {
    input.addEventListener("input", cbResizeComposerInput);
    input.addEventListener("keydown", cbHandleComposerKeydown);
    input.dataset.composerEnhanced = "true";
  }
  cbResizeComposerInput();
};

const cbRepositionSidebarMenus = () => {
  const {
    projectMenu,
    projectSelector,
    workspaceMenu,
    workspaceSelector,
    connectorsMenu,
    connectorsToggle,
  } = shellElements;
  if (cbProjectMenuOpen && projectMenu && projectSelector && !projectMenu.hidden) {
    cbPositionSidebarMenu(projectMenu, projectSelector);
  }
  if (cbWorkspaceMenuOpen && workspaceMenu && workspaceSelector && !workspaceMenu.hidden) {
    cbPositionSidebarMenu(workspaceMenu, workspaceSelector);
  }
  if (cbConnectorsMenuOpen && connectorsMenu && connectorsToggle && !connectorsMenu.hidden) {
    cbPositionSidebarMenu(connectorsMenu, connectorsToggle);
  }
  if (userMenuOpen) {
    cbPositionUserMenu();
  }
};

const cbToggleProjectMenu = (open) => {
  if (typeof open === "boolean") {
    cbProjectMenuOpen = open;
  } else {
    cbProjectMenuOpen = !cbProjectMenuOpen;
  }
  const { projectMenu, projectSelector } = shellElements;
  if (projectMenu) {
    projectMenu.hidden = !cbProjectMenuOpen;
    if (cbProjectMenuOpen) {
      if (projectSelector) {
        cbPositionSidebarMenu(projectMenu, projectSelector);
      }
    } else {
      cbResetFloatingMenuStyles(projectMenu);
    }
  }
  if (projectSelector) {
    projectSelector.setAttribute("aria-expanded", cbProjectMenuOpen ? "true" : "false");
    projectSelector.setAttribute("data-open", cbProjectMenuOpen ? "true" : "false");
  }
};

const cbToggleWorkspaceMenu = (open) => {
  if (typeof open === "boolean") {
    cbWorkspaceMenuOpen = open;
  } else {
    cbWorkspaceMenuOpen = !cbWorkspaceMenuOpen;
  }
  const { workspaceMenu, workspaceSelector } = shellElements;
  if (workspaceMenu) {
    workspaceMenu.hidden = !cbWorkspaceMenuOpen;
    if (cbWorkspaceMenuOpen) {
      if (workspaceSelector) {
        cbPositionSidebarMenu(workspaceMenu, workspaceSelector);
      }
    } else {
      cbResetFloatingMenuStyles(workspaceMenu);
    }
  }
  if (workspaceSelector) {
    workspaceSelector.setAttribute("aria-expanded", cbWorkspaceMenuOpen ? "true" : "false");
    workspaceSelector.setAttribute("data-open", cbWorkspaceMenuOpen ? "true" : "false");
  }
};

const cbToggleConnectorsMenu = (open) => {
  if (typeof open === "boolean") {
    cbConnectorsMenuOpen = open;
  } else {
    cbConnectorsMenuOpen = !cbConnectorsMenuOpen;
  }
  const { connectorsMenu, connectorsToggle } = shellElements;
  if (connectorsMenu) {
    connectorsMenu.hidden = !cbConnectorsMenuOpen;
    if (cbConnectorsMenuOpen) {
      if (connectorsToggle) {
        cbPositionSidebarMenu(connectorsMenu, connectorsToggle);
      }
    } else {
      cbResetFloatingMenuStyles(connectorsMenu);
    }
  }
  if (connectorsToggle) {
    connectorsToggle.setAttribute("aria-expanded", cbConnectorsMenuOpen ? "true" : "false");
    connectorsToggle.setAttribute("data-open", cbConnectorsMenuOpen ? "true" : "false");
  }
};

const cbHandleSidebarMenuOutside = (event) => {
  const target = event.target;
  const { projectSection, workspaceSection, connectorsSection } = shellElements;
  if (cbProjectMenuOpen && projectSection && !projectSection.contains(target)) {
    cbToggleProjectMenu(false);
  }
  if (cbWorkspaceMenuOpen && workspaceSection && !workspaceSection.contains(target)) {
    cbToggleWorkspaceMenu(false);
  }
  if (cbConnectorsMenuOpen && connectorsSection && !connectorsSection.contains(target)) {
    cbToggleConnectorsMenu(false);
  }
};

const cbEnsureSidebarMenuOutsideBinding = () => {
  if (cbSidebarMenuOutsideBound) {
    return;
  }
  cbSidebarMenuOutsideBound = true;
  document.addEventListener("click", cbHandleSidebarMenuOutside);
};

const cbRenderProjects = () => {
  const {
    projectSection,
    projectSelector,
    projectCurrentLabel,
    projectNewButton,
    projectsGuestHint,
    projectMenu,
  } = shellElements;
  if (!projectSection) {
    return;
  }
  const isAuthed = cbIsAuthenticated();
  if (!isAuthed) {
    cbToggleProjectMenu(false);
    cbCurrentProjectId = null;
    cbSetProjectsError("");
  }
  if (projectsGuestHint) {
    projectsGuestHint.hidden = isAuthed;
  }
  if (projectNewButton) {
    if (isAuthed) {
      projectNewButton.removeAttribute("disabled");
    } else {
      projectNewButton.setAttribute("disabled", "disabled");
    }
  }
  if (projectSelector) {
    if (isAuthed) {
      projectSelector.removeAttribute("disabled");
    } else {
      projectSelector.setAttribute("disabled", "disabled");
    }
    projectSelector.setAttribute("data-open", cbProjectMenuOpen && isAuthed ? "true" : "false");
    projectSelector.setAttribute("aria-expanded", cbProjectMenuOpen && isAuthed ? "true" : "false");
  }
  const activeProject =
    cbCurrentProjectId && cbProjects.find((proj) => proj && proj.id === cbCurrentProjectId);
  if (projectCurrentLabel) {
    projectCurrentLabel.textContent = activeProject?.name || "All projects";
  }
  if (!projectMenu) {
    return;
  }
  projectMenu.hidden = !isAuthed || !cbProjectMenuOpen;
  if (projectMenu.hidden) {
    cbResetFloatingMenuStyles(projectMenu);
  }
  projectMenu.innerHTML = "";
  const options = [{ id: null, name: "All projects" }];
  cbProjects.forEach((project) => {
    if (project && typeof project === "object") {
      options.push(project);
    }
  });
  options.forEach((project) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "cb-sidebar-menu-button";
    const optionId = project.id || null;
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", optionId === cbCurrentProjectId ? "true" : "false");
    if (optionId === cbCurrentProjectId) {
      option.classList.add("is-active");
    }
    option.textContent = project.name || "Untitled project";
    option.addEventListener("click", () => cbSelectProject(optionId));
    projectMenu.appendChild(option);
  });
  if (isAuthed) {
    const newOption = document.createElement("button");
    newOption.type = "button";
    newOption.className = "cb-sidebar-menu-button cb-project-menu-new";
    newOption.innerHTML = `<span aria-hidden="true">+</span><span>New project</span>`;
    newOption.addEventListener("click", (event) => {
      event.preventDefault();
      cbOpenProjectModal();
    });
    projectMenu.appendChild(newOption);
  }
  if (cbProjectMenuOpen && !projectMenu.hidden && projectSelector) {
    cbPositionSidebarMenu(projectMenu, projectSelector);
  }
  cbUpdateChatHeader();
};

const cbApplyChatTitleLocally = (chatId, title) => {
  if (!chatId) return;
  const trimmedTitle = typeof title === "string" ? title.trim() : "";
  cbChats = cbChats.map((chat) => {
    if (!chat || chat.id !== chatId) {
      return chat;
    }
    return { ...chat, title: trimmedTitle };
  });
  cbRenderChatsList();
  cbSyncCurrentWorkspaceChatsCache();
};

const cbRenderWorkspaces = () => {
  const { workspaceLabel, workspaceMenu, workspaceSelector } = shellElements;
  const active =
    cbWorkspaces.find((workspace) => workspace.id === cbCurrentWorkspaceId) || cbWorkspaces[0];
  if (workspaceLabel) {
    workspaceLabel.textContent = active?.label || "Workspace";
  }
  if (workspaceSelector) {
    workspaceSelector.setAttribute("aria-expanded", cbWorkspaceMenuOpen ? "true" : "false");
    workspaceSelector.setAttribute("data-open", cbWorkspaceMenuOpen ? "true" : "false");
  }
  if (!workspaceMenu) {
    return;
  }
  workspaceMenu.innerHTML = "";
  const allowedList =
    (Array.isArray(cbCurrentUser?.capabilities?.workspacesAllowed) &&
      cbCurrentUser.capabilities.workspacesAllowed.length &&
      cbCurrentUser.capabilities.workspacesAllowed) ||
    (Array.isArray(cbCurrentUser?.workspacesAllowed) &&
      cbCurrentUser.workspacesAllowed.length &&
      cbCurrentUser.workspacesAllowed) ||
    cbWorkspaces.map((workspace) => workspace.id);
  const allowedSet = new Set(allowedList);

  cbWorkspaces.forEach((workspace) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cb-sidebar-menu-button";
    button.textContent = workspace.label;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", workspace.id === cbCurrentWorkspaceId ? "true" : "false");
    const isAllowed = allowedSet.has(workspace.id);
    if (workspace.id === cbCurrentWorkspaceId) {
      button.classList.add("is-active");
    }
    if (!isAllowed) {
      button.disabled = true;
      button.classList.add("cb-sidebar-item--locked");
      button.setAttribute("aria-disabled", "true");
      button.title = "Not available on your current plan.";
    } else {
      button.disabled = false;
      button.title = `Switch to ${workspace.label}`;
      button.addEventListener("click", () => cbSelectWorkspace(workspace.id));
    }
    workspaceMenu.appendChild(button);
  });
  workspaceMenu.hidden = !cbWorkspaceMenuOpen;
  if (workspaceMenu.hidden) {
    cbResetFloatingMenuStyles(workspaceMenu);
  } else if (workspaceSelector && cbWorkspaceMenuOpen) {
    cbPositionSidebarMenu(workspaceMenu, workspaceSelector);
  }
  cbUpdateChatHeader();
};

const cbRenderCouncilActive = () => {
  const container = shellElements.councilActive;
  const button = shellElements.councilButton;
  if (!container) {
    return;
  }
  container.innerHTML = "";
  container.hidden = true;
  if (button) {
    delete button.dataset.hasSelection;
  }
};

const cbToggleCouncilPopover = (open) => {
  const targetId = "cb-council-popover";
  const button = shellElements.councilButton || document.getElementById("cb-attach-button");
  if (open) {
    openModal(targetId);
    if (button) {
      button.setAttribute("aria-expanded", "true");
    }
  } else {
    cbOnCouncilModalClose();
    closeModal(targetId, { silentFocus: true });
    if (button) {
      button.setAttribute("aria-expanded", "false");
    }
  }
};

let cbCouncilInfoDismissBound = false;

const cbCloseCouncilInfoTooltips = () => {
  document.querySelectorAll(".cb-council-info.is-open").forEach((element) => {
    element.classList.remove("is-open");
    const btn = element.querySelector(".cb-council-info-btn");
    if (btn) {
      btn.setAttribute("aria-expanded", "false");
    }
  });
  document.querySelectorAll(".cb-council-row--tooltip").forEach((row) => {
    row.classList.remove("cb-council-row--tooltip");
  });
};

const cbBindCouncilInfoDismiss = () => {
  if (cbCouncilInfoDismissBound) {
    return;
  }
  cbCouncilInfoDismissBound = true;
  document.addEventListener("click", (event) => {
    if (event.target && event.target.closest(".cb-council-info")) {
      return;
    }
    cbCloseCouncilInfoTooltips();
  });
};

const cbRenderCouncilList = () => {
  const container =
    shellElements.councilList ||
    document.getElementById("cb-council-list") ||
    document.querySelector('[data-role="council-list"]');
  if (container) {
    cbBindCouncilInfoDismiss();
    cbCloseCouncilInfoTooltips();
    let agents = cbGetAgentsForWorkspace(cbCurrentWorkspaceId).filter(
      (agent) => agent.showInCouncil !== false
    );
    if (!agents.length) {
      agents = AGENTS_CONFIG.filter((agent) => agent.showInCouncil !== false);
    }
    container.innerHTML = "";
    agents.forEach((agent) => {
      const row = document.createElement("div");
      row.className = "cb-council-row";
      row.setAttribute("data-council-id", agent.key);
      row.setAttribute("data-agent-key", agent.key);

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "cb-council-pill-toggle cb-council-toggle";
      toggle.setAttribute("data-council-id", agent.key);
      toggle.setAttribute("data-agent-key", agent.key);
      const isActive = cbCouncilSelectedIds.has(agent.key);
      if (isActive) {
        toggle.classList.add("is-selected", "cb-council-toggle--selected");
        toggle.setAttribute("aria-pressed", "true");
      } else {
        toggle.setAttribute("aria-pressed", "false");
      }
      toggle.addEventListener("click", () => cbToggleCouncilMember(agent.key, toggle));

      const descText = agent.shortDescription || "Preview agent";
      const role = document.createElement("span");
      role.className = "cb-council-pill-role";
      role.textContent = agent.label?.split(" – ")[0] || agent.label || agent.key;
      toggle.appendChild(role);

      const actions = document.createElement("div");
      actions.className = "cb-council-row-actions";

      const info = document.createElement("span");
      info.className = "cb-council-info";
      const infoBtn = document.createElement("button");
      infoBtn.type = "button";
      infoBtn.className = "cb-council-info-btn";
      infoBtn.setAttribute("aria-label", "Show agent description");
      infoBtn.setAttribute("aria-expanded", "false");
      infoBtn.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" fill="none"></circle>' +
        '<path d="M12 10v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>' +
        '<circle cx="12" cy="7.5" r="1" fill="currentColor"></circle>' +
        "</svg>";
      const infoTip = document.createElement("span");
      infoTip.className = "cb-council-info-tooltip";
      infoTip.textContent = descText;
      info.appendChild(infoBtn);
      info.appendChild(infoTip);
      actions.appendChild(info);

      infoBtn.addEventListener("click", (event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        const isOpen = info.classList.contains("is-open");
        cbCloseCouncilInfoTooltips();
        if (!isOpen) {
          info.classList.add("is-open");
          row.classList.add("cb-council-row--tooltip");
          infoBtn.setAttribute("aria-expanded", "true");
        }
      });
      infoBtn.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        event.preventDefault();
        infoBtn.click();
      });

      const registryAgent = cbResolvePublicRegistryAgent(agent);
      const profile = cbBuildCouncilAgentProfile(agent, registryAgent);
      const preview = cbBuildCouncilHoverPreview(agent, registryAgent);
      if (preview) {
        toggle.title = preview;
      }

      const detailsBtn = document.createElement("button");
      detailsBtn.type = "button";
      detailsBtn.className = "cb-council-detail-btn";
      detailsBtn.setAttribute("aria-label", "Open agent profile");
      detailsBtn.title = "Open agent profile";
      detailsBtn.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<path d="M14 5h5v5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>' +
        '<path d="M10 14l9-9" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>' +
        '<path d="M19 14v5H5V5h5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>' +
        "</svg>";
      detailsBtn.addEventListener("click", (event) => {
        event?.preventDefault?.();
        const url = cbBuildAgentProfileUrl(profile, { fromCouncil: true });
        if (typeof cbOnCouncilModalClose === "function") {
          cbOnCouncilModalClose();
        }
        window.location.href = url;
      });

      actions.appendChild(detailsBtn);
      row.appendChild(toggle);
      row.appendChild(actions);
      container.appendChild(row);
    });
  }
  cbUpdateCouncilPill();
  cbRenderCouncilActive();
  cbRenderCouncilBar();
  syncCouncilStateFromUi();
};

const cbSelectProject = (projectId) => {
  cbCurrentProjectId = projectId || null;
  cbToggleProjectMenu(false);
  cbRenderProjects();
  cbRenderChatsList();
};

const cbSelectWorkspace = (workspaceId) => {
  const nextWorkspaceId =
    cbWorkspaces.find((workspace) => workspace.id === workspaceId)?.id || cbWorkspaces[0].id;
  cbToggleWorkspaceMenu(false);
  cbOnWorkspaceChanged(nextWorkspaceId);
};

const cbOnWorkspaceChanged = (nextWorkspaceId) => {
  const targetWorkspace = cbNormalizeWorkspaceId(nextWorkspaceId);
  if (targetWorkspace === cbCurrentWorkspaceId) {
    cbRenderWorkspaces();
    cbRenderCouncilList();
    return;
  }
  cbCurrentWorkspaceId = targetWorkspace;
  cbSaveWorkspaceToStorage(cbCurrentWorkspaceId);
  cbRenderWorkspaces();
  cbRenderCouncilList();

  const cachedChats = cbWorkspaceChats.get(targetWorkspace);
  if (Array.isArray(cachedChats)) {
    cbChats = cachedChats;
    cbRenderChatsList();
  } else {
    cbChats = [];
    cbRenderChatsList();
    cbFetchChatsForWorkspace(targetWorkspace).catch(console.error);
  }

  const cachedProjects = cbWorkspaceProjects.get(targetWorkspace);
  if (Array.isArray(cachedProjects)) {
    cbProjects = cachedProjects;
    if (cbCurrentProjectId && !cbProjects.some((proj) => proj && proj.id === cbCurrentProjectId)) {
      cbCurrentProjectId = null;
    }
    cbRenderProjects();
  } else {
    cbProjects = [];
    cbRenderProjects();
    cbFetchProjectsForWorkspace(targetWorkspace).catch(console.error);
  }
};

const cbResetProjectsState = () => {
  cbProjects = [];
  cbWorkspaceProjects.clear();
  cbProjectsInitializedByWorkspace.clear();
  cbProjectsLoadingByWorkspace.clear();
  cbCurrentProjectId = null;
  cbToggleProjectMenu(false);
  cbSetProjectsError("");
  cbSetProjectModalError("");
  cbRenderProjects();
};

const cbLoadProjects = ({ force = false } = {}) =>
  cbFetchProjectsForWorkspace(cbCurrentWorkspaceId, { force });

async function cbFetchProjectsForWorkspace(workspaceId, { force = false } = {}) {
  if (!cbIsAuthenticated()) {
    cbResetProjectsState();
    return;
  }
  const targetWorkspace = cbNormalizeWorkspaceId(workspaceId);
  if (cbProjectsLoadingByWorkspace.get(targetWorkspace) && !force) {
    return;
  }
  if (!force && cbProjectsInitializedByWorkspace.get(targetWorkspace)) {
    if (targetWorkspace === cbCurrentWorkspaceId) {
      cbProjects = cbWorkspaceProjects.get(targetWorkspace) || [];
      if (cbCurrentProjectId && !cbProjects.some((proj) => proj && proj.id === cbCurrentProjectId)) {
        cbCurrentProjectId = null;
      }
      cbRenderProjects();
    }
    return;
  }
  cbProjectsLoadingByWorkspace.set(targetWorkspace, true);
  if (targetWorkspace === cbCurrentWorkspaceId) {
    cbSetProjectsError("");
  }
  try {
    const params = new URLSearchParams({ workspaceId: targetWorkspace });
    const response = await fetch(`${API_PROJECTS}?${params.toString()}`, {
      method: "GET",
      headers: cbGetAuthHeaders(),
      credentials: "include",
    });
    const data = await safeJson(response);
    if (!response.ok) {
      throw new Error(data?.error || "Failed to load projects");
    }
    const list = Array.isArray(data) ? data : Array.isArray(data?.projects) ? data.projects : [];
    cbWorkspaceProjects.set(targetWorkspace, list.filter(Boolean));
    cbProjectsInitializedByWorkspace.set(targetWorkspace, true);
    if (targetWorkspace === cbCurrentWorkspaceId) {
      cbProjects = cbWorkspaceProjects.get(targetWorkspace) || [];
      if (cbCurrentProjectId && !cbProjects.some((proj) => proj && proj.id === cbCurrentProjectId)) {
        cbCurrentProjectId = null;
      }
      cbRenderProjects();
    }
  } catch (error) {
    console.warn("[PROJECTS] load failed", error);
    if (targetWorkspace === cbCurrentWorkspaceId && !cbWorkspaceProjects.has(targetWorkspace)) {
      cbProjects = [];
      cbRenderProjects();
    }
  } finally {
    cbProjectsLoadingByWorkspace.set(targetWorkspace, false);
  }
}

const cbCreateProjectWithName = async (name) => {
  cbSetProjectsError("");
  cbSetProjectModalError("");
  const trimmed = (name || "").trim();
  if (!trimmed) {
    cbSetProjectModalError("Please enter a project name.");
    return false;
  }
  try {
    const workspaceKey = cbNormalizeWorkspaceId(cbCurrentWorkspaceId);
    const payload = {
      name: trimmed,
      workspaceId: workspaceKey,
    };
    const response = await fetch(API_PROJECTS, {
      method: "POST",
      headers: cbGetAuthHeaders({ "Content-Type": "application/json" }),
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const data = await safeJson(response);
    if (!response.ok) {
      if (response.status === 402 && data?.errorCode === "MAX_PROJECTS_REACHED") {
        const limitMessage = "You've reached the project limit for this workspace on your current plan.";
        cbSetProjectsError(limitMessage);
        cbSetProjectModalError(limitMessage);
      } else {
        const message = data?.error || "Unable to create project.";
        cbSetProjectsError(message);
        cbSetProjectModalError(message);
      }
      return false;
    }
    const project = data?.project || data;
    if (project && project.id) {
      cbCurrentProjectId = project.id;
      const workspaceId = cbNormalizeWorkspaceId(project.workspaceId || workspaceKey);
      const existing = cbWorkspaceProjects.get(workspaceId) || [];
      cbWorkspaceProjects.set(workspaceId, [...existing, project]);
      cbProjectsInitializedByWorkspace.set(workspaceId, true);
      if (workspaceId === cbCurrentWorkspaceId) {
        cbProjects = cbWorkspaceProjects.get(workspaceId) || [];
        cbRenderProjects();
      }
    }
    cbSetProjectsError("");
    cbSetProjectModalError("");
    return true;
  } catch (error) {
    console.warn("[PROJECTS] create failed", error);
    cbSetProjectsError("Unable to create project. Please try again.");
    cbSetProjectModalError("Unable to create project. Please try again.");
    return false;
  }
};

const cbOpenProjectModal = () => {
  cbToggleProjectMenu(false);
  cbSetProjectsError("");
  cbSetProjectModalError("");
  openModal("cb-project-modal");
  const { projectNameInput } = shellElements;
  if (projectNameInput) {
    projectNameInput.value = "";
    setTimeout(() => projectNameInput.focus(), 0);
  }
};

const cbCloseProjectModal = () => {
  closeModal("cb-project-modal");
};

const cbHandleProjectModalSubmit = async () => {
  if (!cbIsAuthenticated()) {
    cbRequireAuthForChat("create-project");
    cbCloseProjectModal();
    return;
  }
  const { projectNameInput } = shellElements;
  const name = projectNameInput ? projectNameInput.value : "";
  const success = await cbCreateProjectWithName(name);
  if (success) {
    cbCloseProjectModal();
  }
};

const cbOpenDeleteModal = (chatId) => {
  if (!cbIsAuthenticated()) {
    return;
  }
  cbPendingDeleteChatId = chatId;
  openModal("cb-delete-modal");
};

const cbCloseDeleteModal = () => {
  cbPendingDeleteChatId = null;
  closeModal("cb-delete-modal", { silentFocus: true });
};

const cbOpenRenameModal = (chatId) => {
  if (!cbIsAuthenticated()) {
    return;
  }
  cbPendingRenameChatId = chatId;
  cbSetRenameModalError("");
  const { renameInput } = shellElements;
  const chat = cbChats.find((item) => item && item.id === chatId);
  const currentTitle = chat?.title?.trim() || "";
  if (renameInput) {
    renameInput.value = currentTitle;
  }
  openModal("cb-rename-modal");
  if (renameInput) {
    setTimeout(() => renameInput.focus(), 0);
  }
};

const cbCloseRenameModal = () => {
  cbPendingRenameChatId = null;
  cbSetRenameModalError("");
  const { renameInput } = shellElements;
  if (renameInput) {
    renameInput.value = "";
  }
  closeModal("cb-rename-modal", { silentFocus: true });
};

const cbRemoveChatFromList = (chatId) => {
  if (!chatId) {
    return;
  }
  cbChats = cbChats.filter((chat) => chat && chat.id !== chatId);
  const activeWorkspaceKey = cbNormalizeWorkspaceId(cbCurrentWorkspaceId);
  cbWorkspaceChats.set(activeWorkspaceKey, cbChats.slice());
  cbWorkspaceChats.forEach((list, workspaceId) => {
    if (workspaceId === activeWorkspaceKey) {
      return;
    }
    if (Array.isArray(list)) {
      cbWorkspaceChats.set(
        workspaceId,
        list.filter((chat) => chat && chat.id !== chatId)
      );
    }
  });
  cbManualChatTitles.delete(chatId);
  cbAutoTitledChats.delete(chatId);
  cbRenderChatsList();
};

const cbHandleChatDeletedSelectionFallback = (chatId) => {
  if (cbActiveChatId !== chatId) {
    return;
  }
  cbActiveChatId = null;
  cbActiveChatMessages = [];
  messages = [];
  history = [];
  saveHistory();
  renderMessages();
  if (cbChats.length) {
    const nextChat = cbChats[0];
    if (nextChat && nextChat.id) {
      cbOpenChat(nextChat.id, { userInitiated: false });
    }
  }
};

const cbConfirmDeleteChat = async () => {
  if (!cbPendingDeleteChatId) {
    cbCloseDeleteModal();
    return;
  }
  const chatId = cbPendingDeleteChatId;
  try {
    const response = await fetch(`${API_CHATS}/${encodeURIComponent(chatId)}`, {
      method: "DELETE",
      headers: cbGetAuthHeaders(),
      credentials: "include",
    });
    if (!response.ok && response.status !== 404) {
      const data = await safeJson(response);
      throw new Error(data?.error || "Unable to delete chat.");
    }
    cbRemoveChatFromList(chatId);
    cbHandleChatDeletedSelectionFallback(chatId);
  } catch (error) {
    console.error("[CHATS] delete failed", error);
    showComposerError("Unable to delete chat. Please try again.");
  } finally {
    cbCloseDeleteModal();
  }
};

const cbPatchChatTitle = async (chatId, title) => {
  const response = await fetch(`${API_CHATS}/${encodeURIComponent(chatId)}`, {
    method: "PATCH",
    headers: cbGetAuthHeaders({ "Content-Type": "application/json" }),
    credentials: "include",
    body: JSON.stringify({ title }),
  });
  const data = await safeJson(response);
  if (!response.ok) {
    throw new Error(data?.error || "Unable to rename chat.");
  }
  return data?.chat || null;
};

const cbConfirmRenameChat = async () => {
  if (!cbPendingRenameChatId) {
    return;
  }
  const { renameInput } = shellElements;
  const nextTitle = renameInput ? renameInput.value.trim() : "";
  if (!nextTitle) {
    cbSetRenameModalError("Please enter a chat name.");
    renameInput?.focus();
    return;
  }
  try {
    await cbPatchChatTitle(cbPendingRenameChatId, nextTitle);
    cbApplyChatTitleLocally(cbPendingRenameChatId, nextTitle);
    cbManualChatTitles.add(cbPendingRenameChatId);
    cbAutoTitledChats.delete(cbPendingRenameChatId);
    cbCloseRenameModal();
  } catch (error) {
    console.error("[CHATS] rename failed", error);
    cbSetRenameModalError(error?.message || "Unable to rename chat. Please try again.");
  }
};

const cbGenerateTitleFromAssistant = (text) => {
  if (typeof text !== "string") {
    return "";
  }
  let cleaned = text
    .replace(/`+/g, " ")
    .replace(/\*\*/g, " ")
    .replace(/[_#>]+/g, " ")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/<\/?[^>]+(>|$)/g, " ");
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return "";
  }
  const words = cleaned.split(" ").slice(0, 10).join(" ");
  let candidate = words.trim();
  if (!candidate) {
    return "";
  }
  candidate = candidate.charAt(0).toUpperCase() + candidate.slice(1);
  if (candidate.length > 80) {
    candidate = `${candidate.slice(0, 77).trim()}…`;
  }
  return candidate;
};

const cbMaybeAutoRenameFromAssistant = (chatId, assistantText) => {
  if (!chatId || !cbIsAuthenticated()) return;
  if (cbManualChatTitles.has(chatId) || cbAutoTitledChats.has(chatId)) {
    return;
  }
  const chat = cbChats.find((item) => item && item.id === chatId);
  if (!chat) {
    return;
  }
  if (typeof chat.title === "string" && chat.title.trim()) {
    cbManualChatTitles.add(chatId);
    return;
  }
  const candidate = cbGenerateTitleFromAssistant(assistantText || "");
  if (!candidate) {
    return;
  }
  cbApplyChatTitleLocally(chatId, candidate);
  cbAutoTitledChats.add(chatId);
  cbPatchChatTitle(chatId, candidate).catch((error) => {
    console.warn("[CHATS] auto rename failed", error);
  });
};

let cbResponsiveResizeBound = false;
let cbMobileSidebarOpen = false;

const cbCloseMobileSidebarMenus = () => {
  cbToggleProjectMenu(false);
  cbToggleWorkspaceMenu(false);
  cbToggleConnectorsMenu(false);
  hideUserMenu();
};

const cbSyncMobileSidebarState = () => {
  const isMobile = cbIsMobileViewport();
  const root = document.body;
  const { sidebar, sidebarBackdrop, mobileSidebarToggle } = shellElements;
  const isOpen = isMobile && cbMobileSidebarOpen;

  if (root) {
    root.classList.toggle("cb-mobile", isMobile);
    root.classList.toggle("cb-mobile-sidebar-open", isOpen);
  }

  if (sidebar) {
    const shouldHide = isMobile && !cbMobileSidebarOpen;
    sidebar.setAttribute("aria-hidden", shouldHide ? "true" : "false");
  }

  if (sidebarBackdrop) {
    sidebarBackdrop.hidden = !isOpen;
    sidebarBackdrop.setAttribute("aria-hidden", isOpen ? "false" : "true");
  }

  if (mobileSidebarToggle) {
    mobileSidebarToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    mobileSidebarToggle.setAttribute("aria-label", isOpen ? "Close navigation menu" : "Open navigation menu");
  }

  if (isMobile) {
    if (!isOpen) {
      cbCloseMobileSidebarMenus();
    } else {
      cbRepositionSidebarMenus();
    }
  }
};

const cbCloseMobileSidebar = () => {
  if (!cbMobileSidebarOpen && cbIsMobileViewport()) {
    cbSyncMobileSidebarState();
    return;
  }
  cbMobileSidebarOpen = false;
  cbSyncMobileSidebarState();
};

const cbOpenMobileSidebar = () => {
  if (!cbIsMobileViewport()) {
    return;
  }
  cbMobileSidebarOpen = true;
  cbSyncMobileSidebarState();
};

const cbToggleMobileSidebar = () => {
  if (!cbIsMobileViewport()) {
    return;
  }
  cbMobileSidebarOpen = !cbMobileSidebarOpen;
  cbSyncMobileSidebarState();
};

const cbApplyResponsiveSidebarState = () => {
  const isMobile = cbIsMobileViewport();
  if (isMobile) {
    setSidebarCollapsed(false, { persist: false });
  } else {
    cbMobileSidebarOpen = false;
    const storedCollapsed = loadSidebarCollapsedFromStorage();
    setSidebarCollapsed(storedCollapsed, { persist: false });
  }
  cbSyncMobileSidebarState();
};

const cbResponsiveSidebarResizeHandler = debounce(() => {
  cbApplyResponsiveSidebarState();
}, 150);

const cbEnsureResponsiveSidebarBinding = () => {
  if (cbResponsiveResizeBound) {
    return;
  }
  cbResponsiveResizeBound = true;
  window.addEventListener("resize", cbResponsiveSidebarResizeHandler);
};

const moveUserAreaToSidebar = () => {
  const userArea = document.getElementById("cb-user-area");
  const { userSlot } = shellElements;
  if (!userArea || !userSlot) {
    return;
  }
  if (!userSlot.contains(userArea)) {
    userSlot.appendChild(userArea);
  }
  userSlot.hidden = false;
  if (userMenuOpen) {
    cbPositionUserMenu();
  }
};

const moveUserAreaToTopbar = () => {
  const userArea = document.getElementById("cb-user-area");
  const { topBarRight, userSlot } = shellElements;
  if (!userArea || !topBarRight) {
    return;
  }
  if (!topBarRight.contains(userArea)) {
    topBarRight.appendChild(userArea);
  }
  const menu = document.getElementById("cb-user-menu");
  if (menu) {
    cbResetFloatingMenuStyles(menu, { isUserMenu: true });
  }
};

const syncWorkspaceShell = () => {
  const isAuthenticated = cbIsAuthenticated();
  const root = document.body;
  if (root) {
    root.classList.add("cb-shell-active");
    root.classList.toggle("cb-shell-user", isAuthenticated);
    root.classList.toggle("cb-shell-guest", !isAuthenticated);
  }
  cbApplyResponsiveSidebarState();
  cbUpdateGuestHint();
  if (isAuthenticated) {
    moveUserAreaToSidebar();
    const workspaceKey = cbNormalizeWorkspaceId(cbCurrentWorkspaceId);
    if (!cbChatsInitializedByWorkspace.get(workspaceKey)) {
      cbChatsInitializedByWorkspace.set(workspaceKey, true);
      cbLoadChats({ autoSelect: true });
    } else {
      cbChats = cbWorkspaceChats.get(workspaceKey) || [];
      cbRenderChatsList();
    }
    if (!cbProjectsInitializedByWorkspace.get(workspaceKey)) {
      cbLoadProjects();
    } else {
      cbProjects = cbWorkspaceProjects.get(workspaceKey) || [];
      if (cbCurrentProjectId && !cbProjects.some((proj) => proj && proj.id === cbCurrentProjectId)) {
        cbCurrentProjectId = null;
      }
      cbRenderProjects();
    }
  } else {
    moveUserAreaToTopbar();
    cbChatsInitializedByWorkspace.clear();
    cbWorkspaceChats.clear();
    cbHasManualChatSelection = false;
    cbChats = [];
    cbActiveChatId = null;
    cbActiveChatMessages = [];
    cbManualChatTitles.clear();
    cbAutoTitledChats.clear();
    cbRenderChatsList();
    cbResetProjectsState();
  }
};

const cbShouldShowShellEmptyState = () =>
  Boolean(cbCurrentUser && !cbActiveChatId && document.body?.classList.contains("cb-shell-active"));

const cbSetCouncilStatus = (ids, status) => {
  if (!Array.isArray(ids)) return;
  ids.forEach((id) => {
    cbCouncilSendStatus[id] = status;
  });
  cbRenderCouncilBar();
};

const cbResetCouncilStatusSoon = (ids, delay = 1500) => {
  if (!Array.isArray(ids) || !ids.length) return;
  setTimeout(() => {
    ids.forEach((id) => {
      cbCouncilSendStatus[id] = CB_COUNCIL_STATUS_IDLE;
    });
    cbRenderCouncilBar();
  }, delay);
};

const legacyRequestChatReply = async (message, payloadIds = []) => {
  await ensureProfile();
  const councilPayload = getCouncilPayload();
  const hasCouncil = Array.isArray(councilPayload.agents) && councilPayload.agents.length > 0;
  const councilMembers = hasCouncil ? councilPayload.agents.slice() : [];
  const useCouncil = hasCouncil;
  if (hasCouncil) {
    cbSetCouncilStatus(councilMembers, CB_COUNCIL_STATUS_PENDING);
  }
  const payload = {
    message,
    history: history.map((entry) => ({ ...entry })),
    tier: profile?.capabilities?.tier || profile?.tier || "guest",
    visitorId,
  };
  if (Array.isArray(payloadIds) && payloadIds.length) {
    payload.payloadIds = payloadIds;
  }
  if (hasCouncil) {
    payload.agents = councilMembers;
    payload.agentsArmed = true;
    payload.council = { enabled: true, members: councilMembers };
  }
  console.log("[CB_COUNCIL] payload", councilPayload, payload);
  cbUpdateCouncilPill();
  let response;
  try {
    response = await fetch(API_CHAT, {
      method: "POST",
      headers: cbGetAuthHeaders({ "Content-Type": "application/json" }),
      credentials: "include",
      body: JSON.stringify(payload),
    });
  } catch (networkError) {
    console.error("[CHAT] legacy send failed", networkError);
    throw new Error("Unable to reach the CoolBits backend.");
  }
  if (response.status === 402 || response.status === 429) {
    const errPayload = await safeJson(response);
    let inlineMessage = "Request could not be completed.";
    if (response.status === 402) {
      inlineMessage = "Token quota reached for your current plan. Please upgrade or wait for a reset.";
      cbSetTokenLimitBannerVisible(true);
    } else if (response.status === 429) {
      const scope = (errPayload?.scope || "").toLowerCase();
      if (scope === "guest") {
        inlineMessage = "Too many requests as guest. Please slow down.";
      } else {
        inlineMessage = "System is rate limited. Please wait before sending more messages.";
      }
    }
    if (useCouncil) cbSetCouncilStatus(councilMembers, CB_COUNCIL_STATUS_ERROR);
    const quotaError = new Error(inlineMessage);
    quotaError.inlineOnly = true;
    throw quotaError;
  }
  const body = await safeJson(response);
  if (!response.ok) {
    if (useCouncil) cbSetCouncilStatus(councilMembers, CB_COUNCIL_STATUS_ERROR);
    const reason = typeof body?.error === "string" && body.error.trim()
      ? body.error.trim()
      : "Chat service temporarily unavailable.";
    throw new Error(reason);
  }
  if (body?.user) {
    cbApplyAuthPayload(body.user);
  }
  if (useCouncil) {
    cbSetCouncilStatus(councilMembers, CB_COUNCIL_STATUS_ACK);
    cbResetCouncilStatusSoon(councilMembers);
  }
  return body;
};

const extractReply = (payload) => {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  if (typeof payload.reply === "string" && payload.reply.trim()) {
    return payload.reply.trim();
  }
  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message.trim();
  }
  return "";
};

const cbGetChatDisplayName = (chat) => {
  if (!chat) return "New chat";
  if (typeof chat.title === "string" && chat.title.trim()) {
    return chat.title.trim();
  }
  if (typeof chat.last_message === "string" && chat.last_message.trim()) {
    const trimmed = chat.last_message.trim();
    return trimmed.length > 42 ? `${trimmed.slice(0, 39)}…` : trimmed;
  }
  return "New chat";
};

const cbGetAuthHeaders = (base = {}) => {
  const headers = { Accept: "application/json", ...base };
  const token = cbGetAuthToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

const cbFetchJson = async (input, init = {}) => {
  try {
    const response = await fetch(input, {
      ...init,
      headers: cbGetAuthHeaders(init.headers || {}),
      credentials: "include",
    });
    let json = null;
    try {
      json = await response.json();
    } catch (_err) {
      json = null;
    }
    return { ok: response.ok, status: response.status, json };
  } catch (error) {
    console.error("[CONNECTOR_FETCH]", error);
    return { ok: false, status: 0, json: null };
  }
};

const cbSetActiveChatMessages = (messageList = []) => {
  const normalizedList = Array.isArray(messageList) ? [...messageList] : [];
  cbActiveChatMessages = normalizedList;
  messages = [];
  history = [];
  normalizedList.forEach((msg) => {
    if (!msg || typeof msg.content !== "string") {
      return;
    }
    const roleKey = typeof msg.role === "string" ? msg.role.toLowerCase() : "";
    const role = roleKey === "assistant" ? "assistant" : roleKey === "user" ? "user" : "system";
    messages.push({
      role,
      content: msg.content,
      timestamp: new Date(msg.created_at || Date.now()).getTime(),
    });
    if (role === "user" || role === "assistant") {
      history.push({ role, content: msg.content });
    }
  });
  saveHistory();
  cbChatForceScrollToBottom = true;
  renderMessages();
};

function cbRenderChatsList() {
  const listEl = shellElements.chatsList;
  if (!listEl) return;
  listEl.innerHTML = "";
  if (cbChatsUnsupported) {
    return;
  }
  const hasProjectFilter = Boolean(cbCurrentProjectId);
  const visibleChats = hasProjectFilter
    ? cbChats.filter((chat) => chat && chat.projectId === cbCurrentProjectId)
    : cbChats.slice();
  if (!visibleChats.length) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "cb-sidebar-empty";
    emptyItem.textContent = hasProjectFilter ? "No chats in this project yet." : "No chats yet.";
    listEl.appendChild(emptyItem);
    return;
  }
  visibleChats.forEach((chat) => {
    const listItem = document.createElement("li");
    listItem.className = "cb-sidebar-chat-row";
    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "cb-sidebar-chat";
    if (chat.id === cbActiveChatId) {
      openButton.classList.add("is-active");
    }
    openButton.setAttribute("data-chat-id", chat.id);
    const chatLabel = cbGetChatDisplayName(chat);
    openButton.setAttribute("aria-label", `Open chat ${chatLabel}`);
    openButton.addEventListener("click", () => cbOpenChat(chat.id, { userInitiated: true }));

    const infoWrap = document.createElement("span");
    infoWrap.className = "cb-chat-info";

    const icon = document.createElement("span");
    icon.className = "cb-sidebar-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = `
      <svg viewBox="0 0 24 24">
        <path d="M4 6h16v9H9l-5 5z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"></path>
      </svg>
    `;

    const label = document.createElement("span");
    label.className = "cb-sidebar-label";
    label.textContent = chatLabel;

    infoWrap.appendChild(icon);
    infoWrap.appendChild(label);

    const actions = document.createElement("span");
    actions.className = "cb-chat-actions";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "cb-chat-edit";
    editButton.setAttribute("aria-label", `Rename chat ${chatLabel}`);
    editButton.textContent = "✎";
    editButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      cbOpenRenameModal(chat.id);
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "cb-chat-delete";
    deleteButton.setAttribute("aria-label", `Delete chat ${chatLabel}`);
    deleteButton.textContent = "×";
    deleteButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      cbOpenDeleteModal(chat.id);
    });

    actions.appendChild(editButton);
    actions.appendChild(deleteButton);

    openButton.appendChild(infoWrap);
    openButton.appendChild(actions);
    listItem.appendChild(openButton);
    listEl.appendChild(listItem);
  });
}

const cbHandleFeatureButtonClick = (key) => {
  if (key === "connectors") {
    cbToggleConnectorsMenu(false);
    cbSetAccountView("connectors");
    cbRenderConnectorsPanel();
    cbOpenAccountBilling({ view: "connectors" });
    cbCloseMobileSidebar();
    return;
  }
  console.log(`[FEATURE] ${key} placeholder action triggered`);
};

function cbApplyFeatureFlags() {
  const buttons = shellElements.featureButtons || [];
  buttons.forEach((button) => {
    if (!button) return;
    const featureKey = button.getAttribute("data-sidebar-feature");
    const enabled = featureKey ? Boolean(cbFeatureFlags[featureKey]) : true;
    const pill = button.querySelector(".cb-sidebar-pill");
    if (enabled) {
      button.classList.remove("is-disabled");
      button.removeAttribute("disabled");
      button.setAttribute("aria-disabled", "false");
      button.removeAttribute("title");
      if (pill) {
        pill.setAttribute("hidden", "true");
      }
    } else {
      button.classList.add("is-disabled");
      button.setAttribute("disabled", "disabled");
      button.setAttribute("aria-disabled", "true");
      const tooltip = button.getAttribute("data-sidebar-tooltip") || "Coming soon";
      button.setAttribute("title", tooltip);
      if (pill) {
        pill.removeAttribute("hidden");
      }
    }
    if (!button.dataset.featureBound) {
      button.addEventListener("click", () => {
        if (!button.classList.contains("is-disabled") && featureKey) {
          cbHandleFeatureButtonClick(featureKey);
        }
      });
      button.dataset.featureBound = "true";
    }
  });
}

const setupProjectControls = () => {
  const {
    projectSelector,
    projectCreateButton,
    projectCancelButton,
    projectNameInput,
    workspaceSelector,
    connectorsToggle,
  } = shellElements;
  if (projectSelector && !projectSelector.dataset.projectSelectorBound) {
    projectSelector.addEventListener("click", (event) => {
      event.preventDefault();
      if (!cbIsAuthenticated()) {
        cbRequireAuthForChat("select-project");
        return;
      }
      if (projectSelector.hasAttribute("disabled")) {
        return;
      }
      cbToggleProjectMenu();
    });
    projectSelector.dataset.projectSelectorBound = "true";
  }
  if (projectCreateButton && !projectCreateButton.dataset.projectModalBound) {
    projectCreateButton.addEventListener("click", (event) => {
      event.preventDefault();
      cbHandleProjectModalSubmit();
    });
    projectCreateButton.dataset.projectModalBound = "true";
  }
  if (projectCancelButton && !projectCancelButton.dataset.projectModalBound) {
    projectCancelButton.addEventListener("click", (event) => {
      event.preventDefault();
      cbCloseProjectModal();
    });
    projectCancelButton.dataset.projectModalBound = "true";
  }
  if (projectNameInput && !projectNameInput.dataset.projectModalBound) {
    projectNameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        cbHandleProjectModalSubmit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        cbCloseProjectModal();
      }
    });
    projectNameInput.dataset.projectModalBound = "true";
  }
  if (workspaceSelector && !workspaceSelector.dataset.workspaceSelectorBound) {
    workspaceSelector.addEventListener("click", (event) => {
      event.preventDefault();
      cbToggleWorkspaceMenu();
    });
    workspaceSelector.dataset.workspaceSelectorBound = "true";
  }
  if (connectorsToggle && !connectorsToggle.dataset.connectorsToggleBound) {
    connectorsToggle.addEventListener("click", (event) => {
      event.preventDefault();
      cbToggleConnectorsMenu();
    });
    connectorsToggle.dataset.connectorsToggleBound = "true";
  }
  cbRenderProjects();
  cbRenderWorkspaces();
  cbEnsureSidebarMenuOutsideBinding();
};

const setupDeleteModalHandlers = () => {
  const { deleteCancelButton, deleteConfirmButton } = shellElements;
  if (deleteConfirmButton && !deleteConfirmButton.dataset.deleteModalBound) {
    deleteConfirmButton.addEventListener("click", (event) => {
      event.preventDefault();
      cbConfirmDeleteChat();
    });
    deleteConfirmButton.dataset.deleteModalBound = "true";
  }
  if (deleteCancelButton && !deleteCancelButton.dataset.deleteModalBound) {
    deleteCancelButton.addEventListener("click", (event) => {
      event.preventDefault();
      cbCloseDeleteModal();
    });
    deleteCancelButton.dataset.deleteModalBound = "true";
  }
};

const setupRenameModalHandlers = () => {
  const { renameConfirmButton, renameCancelButton, renameInput } = shellElements;
  if (renameConfirmButton && !renameConfirmButton.dataset.renameModalBound) {
    renameConfirmButton.addEventListener("click", (event) => {
      event.preventDefault();
      cbConfirmRenameChat();
    });
    renameConfirmButton.dataset.renameModalBound = "true";
  }
  if (renameCancelButton && !renameCancelButton.dataset.renameModalBound) {
    renameCancelButton.addEventListener("click", (event) => {
      event.preventDefault();
      cbCloseRenameModal();
    });
    renameCancelButton.dataset.renameModalBound = "true";
  }
  if (renameInput && !renameInput.dataset.renameModalBound) {
    renameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        cbConfirmRenameChat();
      } else if (event.key === "Escape") {
        event.preventDefault();
        cbCloseRenameModal();
      }
    });
    renameInput.dataset.renameModalBound = "true";
  }
};

const cbLoadChats = ({ autoSelect = false } = {}) =>
  cbFetchChatsForWorkspace(cbCurrentWorkspaceId, { autoSelect });

async function cbFetchChatsForWorkspace(workspaceId, { autoSelect = false } = {}) {
  if (!cbIsAuthenticated()) {
    cbWorkspaceChats.clear();
    cbChatsInitializedByWorkspace.clear();
    cbChats = [];
    if (cbNormalizeWorkspaceId(workspaceId) === cbCurrentWorkspaceId) {
      cbRenderChatsList();
    }
    return;
  }
  const targetWorkspace = cbNormalizeWorkspaceId(workspaceId);
  try {
    const params = new URLSearchParams({ workspaceId: targetWorkspace });
    const response = await fetch(`${API_CHATS}?${params.toString()}`, {
      method: "GET",
      headers: cbGetAuthHeaders(),
      credentials: "include",
    });
    const data = await safeJson(response);
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        clearAuthState({ showOnboarding: true });
      }
      if (response.status === 404) {
        cbChatsUnsupported = true;
        console.warn("[CHATS] API unavailable, falling back to legacy /api/chat endpoint.");
        if (workspaceId === cbCurrentWorkspaceId) {
          cbChats = [];
          cbRenderChatsList();
        }
        return;
      }
      console.error("[CHATS] load failed", response.status, response.statusText);
      throw new Error(data?.error || "Unable to load chats.");
    }
    const list = Array.isArray(data?.chats) ? data.chats.slice() : [];
    list.sort((a, b) => {
      const aTime = new Date(a?.updated_at || a?.created_at || 0).getTime();
      const bTime = new Date(b?.updated_at || b?.created_at || 0).getTime();
      return bTime - aTime;
    });
    cbWorkspaceChats.set(targetWorkspace, list);
    cbChatsInitializedByWorkspace.set(targetWorkspace, true);
    list.forEach((chat) => {
      if (chat && typeof chat.title === "string" && chat.title.trim()) {
        cbManualChatTitles.add(chat.id);
      }
    });
    if (targetWorkspace === cbCurrentWorkspaceId) {
      cbChats = list;
      cbRenderChatsList();
      if (autoSelect && !cbActiveChatId && cbChats.length && !cbHasManualChatSelection) {
        cbOpenChat(cbChats[0].id);
      }
    }
  } catch (error) {
    console.error("[CHATS] load failed", error);
  }
}

async function cbOpenChat(chatId, { userInitiated = false } = {}) {
  if (!chatId) {
    return;
  }
  if (userInitiated) {
    cbHasManualChatSelection = true;
    const params = new URLSearchParams(window.location.search || "");
    if (params.get("view")) {
      cbSetDashboardView("chat");
    }
  }
  try {
    const response = await fetch(`${API_CHATS}/${encodeURIComponent(chatId)}`, {
      method: "GET",
      headers: cbGetAuthHeaders(),
      credentials: "include",
    });
    const data = await safeJson(response);
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        clearAuthState({ showOnboarding: true });
      }
      console.error("[CHATS] open failed", response.status, response.statusText);
      throw new Error(data?.error || "Unable to load chat history.");
    }
    cbActiveChatId = chatId;
    cbSetActiveChatMessages(Array.isArray(data?.messages) ? data.messages : []);
    cbRenderChatsList();
    focusChatInput();
  } catch (error) {
    console.error("[CHATS] open chat failed", error);
    showComposerError(error?.message || "Unable to open chat.");
  }
}

function cbHandleStartNewChat() {
  cbHasManualChatSelection = true;
  cbActiveChatId = null;
  cbSetActiveChatMessages([]);
  cbRenderChatsList();
  focusChatInput();
}

async function cbCreateChat(firstMessage, { payloadIds = [] } = {}) {
  if (cbChatsUnsupported) {
    throw new Error("Chat persistence unavailable.");
  }
  const workspaceKey = cbNormalizeWorkspaceId(cbCurrentWorkspaceId);
  const councilPayload = getCouncilPayload();
  const hasCouncil = Array.isArray(councilPayload.agents) && councilPayload.agents.length > 0;
  const councilMembers = hasCouncil ? councilPayload.agents.slice() : [];
  const useCouncil = hasCouncil;
  if (hasCouncil) cbSetCouncilStatus(councilMembers, CB_COUNCIL_STATUS_PENDING);
  const payload = {
    firstMessage,
    workspaceId: workspaceKey,
    projectId: cbCurrentProjectId || null,
  };
  if (Array.isArray(payloadIds) && payloadIds.length) {
    payload.payloadIds = payloadIds;
  }
  if (hasCouncil) {
    payload.agents = councilMembers;
    payload.agentsArmed = true;
    payload.council = { enabled: true, members: councilMembers };
  }
  console.log("[CB_COUNCIL] payload", councilPayload, payload);
  cbUpdateCouncilPill();
  const response = await fetch(API_CHATS, {
    method: "POST",
    headers: cbGetAuthHeaders({ "Content-Type": "application/json" }),
    credentials: "include",
    body: JSON.stringify(payload),
  });
  const data = await safeJson(response);
  if (!response.ok) {
    if (useCouncil) cbSetCouncilStatus(councilMembers, CB_COUNCIL_STATUS_ERROR);
    if (response.status === 401 || response.status === 403) {
      clearAuthState({ showOnboarding: true });
    }
    console.error("[CHATS] create failed", response.status, response.statusText);
    throw new Error(data?.error || "Unable to create chat.");
  }
  if (useCouncil) {
    cbSetCouncilStatus(councilMembers, CB_COUNCIL_STATUS_ACK);
    cbResetCouncilStatusSoon(councilMembers);
  }
  const chat = data?.chat;
  if (chat && chat.id) {
    const workspaceId = cbNormalizeWorkspaceId(chat.workspaceId || workspaceKey);
    const existing = cbWorkspaceChats.get(workspaceId) || [];
    const nextList = [chat, ...(Array.isArray(existing) ? existing : [])];
    cbWorkspaceChats.set(workspaceId, nextList);
    cbChatsInitializedByWorkspace.set(workspaceId, true);
    if (typeof chat.title === "string" && chat.title.trim()) {
      cbManualChatTitles.add(chat.id);
    }
    if (workspaceId === cbCurrentWorkspaceId) {
      cbChats = nextList;
      cbRenderChatsList();
    }
  }
  refreshAccountUsage().catch((error) => console.warn("[USAGE] refresh after chat create failed", error));
  return data;
}

async function cbAppendChatMessage(chatId, content, { payloadIds = [] } = {}) {
  if (cbChatsUnsupported) {
    throw new Error("Chat persistence unavailable.");
  }
  const councilPayload = getCouncilPayload();
  const hasCouncil = Array.isArray(councilPayload.agents) && councilPayload.agents.length > 0;
  const councilMembers = hasCouncil ? councilPayload.agents.slice() : [];
  const useCouncil = hasCouncil;
  if (hasCouncil) cbSetCouncilStatus(councilMembers, CB_COUNCIL_STATUS_PENDING);
  const payload = { content };
  if (Array.isArray(payloadIds) && payloadIds.length) {
    payload.payloadIds = payloadIds;
  }
  if (hasCouncil) {
    payload.agents = councilMembers;
    payload.agentsArmed = true;
    payload.council = { enabled: true, members: councilMembers };
  }
  console.log("[CB_COUNCIL] payload", councilPayload, payload);
  cbUpdateCouncilPill();
  const response = await fetch(`${API_CHATS}/${encodeURIComponent(chatId)}/messages`, {
    method: "POST",
    headers: cbGetAuthHeaders({ "Content-Type": "application/json" }),
    credentials: "include",
    body: JSON.stringify(payload),
  });
  const data = await safeJson(response);
  if (!response.ok) {
    if (useCouncil) cbSetCouncilStatus(councilMembers, CB_COUNCIL_STATUS_ERROR);
    if (response.status === 401 || response.status === 403) {
      clearAuthState({ showOnboarding: true });
    }
    console.error("[CHATS] append failed", response.status, response.statusText);
    throw new Error(data?.error || "Unable to send message.");
  }
  if (useCouncil) {
    cbSetCouncilStatus(councilMembers, CB_COUNCIL_STATUS_ACK);
    cbResetCouncilStatusSoon(councilMembers);
  }
  refreshAccountUsage().catch((error) => console.warn("[USAGE] refresh after chat append failed", error));
  return data;
}

const showUpgradeError = (message) => {
  const el = document.getElementById("cb-upgrade-error");
  if (!el) {
    return;
  }
  if (message && message.trim()) {
    el.textContent = message.trim();
    el.hidden = false;
  } else {
    el.textContent = "";
    el.hidden = true;
  }
};

const setBillingError = (message) => {
  const el = document.getElementById("cb-billing-error");
  if (!el) return;
  if (message && message.trim()) {
    el.textContent = message.trim();
    el.hidden = false;
  } else {
    el.textContent = "";
    el.hidden = true;
  }
};

const setBillingSuccess = (message) => {
  const el = document.getElementById("cb-billing-success");
  if (!el) return;
  if (message && message.trim()) {
    el.textContent = message.trim();
    el.hidden = false;
  } else {
    el.textContent = "";
    el.hidden = true;
  }
};

const startGoogleLogin = () => {
  const errorEl = document.getElementById("cb-onboarding-error");
  if (errorEl) {
    errorEl.textContent = "";
    errorEl.hidden = true;
  }

  const pathName = window.location.pathname || "/chat";
  const search = window.location.search || "";
  const returnTo = pathName + search;
  const url = `${API_AUTH_GOOGLE_START}?returnTo=${encodeURIComponent(returnTo)}`;

  const width = 500;
  const height = 650;
  const left = window.screenX + (window.outerWidth - width) / 2;
  const top = window.screenY + (window.outerHeight - height) / 2;
  const features = [
    "menubar=no",
    "toolbar=no",
    "resizable=yes",
    "scrollbars=yes",
    `width=${width}`,
    `height=${height}`,
    `left=${Math.max(left, 0)}`,
    `top=${Math.max(top, 0)}`,
  ].join(",");

  cbGooglePopup = window.open(url, "coolbits-google-login", features);
  if (!cbGooglePopup && errorEl) {
    errorEl.textContent = "We couldn't open the Google sign-in window. Please allow popups and try again.";
    errorEl.hidden = false;
  } else if (cbGooglePopup && cbGooglePopup.focus) {
    cbGooglePopup.focus();
  }
};

const setOnboardingError = (message) => {
  const errorEl = document.getElementById("cb-onboarding-error");
  if (!errorEl) {
    return;
  }
  if (message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  } else {
    errorEl.textContent = "";
    errorEl.hidden = true;
  }
};

const clearAuthState = ({ showOnboarding = false } = {}) => {
  cbSetAuthToken(null);
  cbCurrentUser = null;
  cbUpdateUsageState(null, { reset: true });
  try {
    window.localStorage.removeItem(AUTH_USER_KEY);
  } catch (error) {
    console.warn("[AUTH] Unable to remove stored user", error);
  }
  updateUserBadge();
  syncWorkspaceShell();
  cbAgentsState.registry = [];
  cbAgentsState.registryLoaded = false;
  cbUpdateAgentsAuthState();
  if (showOnboarding) {
    openOnboardingModal();
  }
  cbSetActiveContextState({ status: "idle", context: null, error: null });
};

const loadAuthFromStorage = () => {
  const token = cbGetAuthToken();
  let storedUser = null;
  try {
    const rawUser = window.localStorage.getItem(AUTH_USER_KEY);
    storedUser = rawUser ? JSON.parse(rawUser) : null;
  } catch (error) {
    console.warn("[AUTH] Unable to parse stored user", error);
  }
  if (token && storedUser) {
    cbApplyAuthPayload(storedUser, { persist: false });
  } else if (!token) {
    cbCurrentUser = null;
    cbUpdateUsageState(null, { reset: true });
    try {
      window.localStorage.removeItem(AUTH_USER_KEY);
    } catch (error) {
      console.warn("[AUTH] Unable to clear stored user", error);
    }
    updateUserBadge();
    syncWorkspaceShell();
  } else {
    cbCurrentUser = null;
    cbUpdateUsageState(null, { reset: true });
    updateUserBadge();
    syncWorkspaceShell();
  }
};

const refreshAccountUsage = async () => {
  const token = cbGetAuthToken();
  if (!token) {
    return;
  }
  const data = await cbFetchAndApplyAuthMe();
  if (!data && !cbCurrentUser) {
    cbSetTokenLimitBannerVisible(false);
  }
  if (!cbLatestBillingSummary) {
    try {
      await fetchBillingSummary();
    } catch (error) {
      console.warn("[BILLING] summary refresh skipped", error);
    }
  }
};

const focusChatInput = () => {
  const input = cbGetComposerInput();
  if (input) {
    input.focus();
  }
};

const cbIsChatShellPage = () =>
  !!document.querySelector("[data-chat-form]") ||
  !!document.querySelector("[data-chat-messages]");

const cbNavigateToChatView = (view) => {
  const target = view && view !== "chat" ? view : "";
  const query = target ? `?view=${encodeURIComponent(target)}` : "";
  window.location.href = `/chat${query}`;
};

const setupSidebarInteractions = () => {
  const {
    sidebar,
    sidebarToggle,
    sidebarLogo,
    mobileSidebarToggle,
    sidebarClose,
    sidebarBackdrop,
    newChatButton,
    agentsButton,
  } = shellElements;
  if (!sidebar) {
    return;
  }
  const storedCollapsed = loadSidebarCollapsedFromStorage();
  setSidebarCollapsed(storedCollapsed, { persist: false });

  if (sidebarToggle) {
    sidebarToggle.addEventListener("click", () => {
      setSidebarCollapsed(!isSidebarCollapsed());
    });
  }

  if (sidebarLogo) {
    sidebarLogo.addEventListener("click", () => {
      if (isSidebarCollapsed()) {
        setSidebarCollapsed(false);
      }
    });
  }

  const closeMobileSidebar = () => cbCloseMobileSidebar();

  if (mobileSidebarToggle) {
    mobileSidebarToggle.addEventListener("click", (event) => {
      event.preventDefault();
      cbToggleMobileSidebar();
    });
  }

  if (sidebarClose) {
    sidebarClose.addEventListener("click", (event) => {
      event.preventDefault();
      closeMobileSidebar();
    });
  }

  if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener("click", closeMobileSidebar);
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && cbMobileSidebarOpen && cbIsMobileViewport()) {
      closeMobileSidebar();
    }
  });

  if (newChatButton) {
    newChatButton.addEventListener("click", (event) => {
      event.preventDefault();
      if (!cbIsChatShellPage()) {
        cbNavigateToChatView("chat");
        return;
      }
      if (!cbRequireAuthForChat("new-chat")) {
        return;
      }
      const params = new URLSearchParams(window.location.search || "");
      if (params.get("view")) {
        cbSetDashboardView("chat");
      }
      cbHandleStartNewChat();
      closeMobileSidebar();
    });
  }

  if (agentsButton && agentsButton.dataset.sidebarAgentsBound !== "true") {
    agentsButton.addEventListener("click", (event) => {
      event.preventDefault();
      const url = cbBuildAgentsDirectoryUrl();
      closeMobileSidebar();
      window.location.href = url;
    });
    agentsButton.dataset.sidebarAgentsBound = "true";
  }

  const dashboardButtons = document.querySelectorAll("[data-sidebar-view]");
  dashboardButtons.forEach((button) => {
    if (!button || button.dataset.sidebarViewBound === "true") return;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const target = button.dataset.sidebarView;
      if (!cbIsChatShellPage()) {
        cbNavigateToChatView(target);
        return;
      }
      cbToggleConnectorsMenu(false);
      cbSetDashboardView(target);
      closeMobileSidebar();
    });
    button.dataset.sidebarViewBound = "true";
  });
  setupProjectControls();
  cbApplyFeatureFlags();
  cbApplyResponsiveSidebarState();
  cbEnsureResponsiveSidebarBinding();
};

const openOnboardingModal = () => {
  hideUserMenu();
  const modal = document.getElementById("cb-onboarding-modal");
  if (!modal) {
    console.warn("[ONBOARDING] Modal element missing");
    return;
  }
  setOnboardingError("");
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  console.log("[ONBOARDING] open");
};

const closeOnboardingModal = () => {
  const modal = document.getElementById("cb-onboarding-modal");
  if (modal) {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  }
  console.log("[ONBOARDING] close");
  focusChatInput();
};

const MODAL_IDS = [
  "cb-profile-modal",
  "cb-billing-modal",
  "cb-plan-modal",
  "cb-account-billing",
  "cb-agent-detail-modal",
  "cb-connector-detail-modal",
  "cb-settings-modal",
  "cb-project-modal",
  "cb-delete-modal",
  "cb-council-share-modal",
  "cb-council-popover",
];
let activeModalId = null;

const setModalVisibility = (modal, show) => {
  if (!modal) return;
  modal.hidden = !show;
  modal.setAttribute("aria-hidden", show ? "false" : "true");
};

const isAnyModalOpen = () => MODAL_IDS.some((id) => {
  const el = document.getElementById(id);
  return el && !el.hidden;
});

const openModal = (modalId) => {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  if (activeModalId && activeModalId !== modalId) {
    closeModal(activeModalId, { silentFocus: true });
  }
  setModalVisibility(modal, true);
  document.body.classList.add("cb-modal-open");
  activeModalId = modalId;
};

const closeModal = (modalId, { silentFocus = false } = {}) => {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  if (modalId === "cb-project-modal") {
    const { projectNameInput } = shellElements;
    if (projectNameInput) {
      projectNameInput.value = "";
    }
    cbSetProjectModalError("");
  }
  if (modalId === "cb-delete-modal") {
    cbPendingDeleteChatId = null;
  }
  if (modalId === "cb-rename-modal") {
    cbPendingRenameChatId = null;
    cbSetRenameModalError("");
    const { renameInput } = shellElements;
    if (renameInput) {
      renameInput.value = "";
    }
  }
  if (modalId === "cb-council-popover") {
    const { councilButton } = shellElements;
    if (councilButton) {
      councilButton.setAttribute("aria-expanded", "false");
    }
  }
  setModalVisibility(modal, false);
  if (activeModalId === modalId) {
    activeModalId = null;
  }
  if (!isAnyModalOpen()) {
    document.body.classList.remove("cb-modal-open");
  }
  if (!silentFocus) {
    focusChatInput();
  }
};

const closeAllModals = () => {
  let closed = false;
  MODAL_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el && !el.hidden) {
      closed = true;
      setModalVisibility(el, false);
    }
  });
  if (closed) {
    document.body.classList.remove("cb-modal-open");
    focusChatInput();
  }
  const { projectNameInput } = shellElements;
  if (projectNameInput) {
    projectNameInput.value = "";
  }
  cbSetProjectModalError("");
  cbPendingDeleteChatId = null;
  cbPendingRenameChatId = null;
  cbSetRenameModalError("");
  const { renameInput } = shellElements;
  if (renameInput) {
    renameInput.value = "";
  }
  activeModalId = null;
  const { councilButton } = shellElements;
  if (councilButton) {
    councilButton.setAttribute("aria-expanded", "false");
  }
};

const setupModalCloseHandlers = () => {
  MODAL_IDS.forEach((modalId) => {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        closeModal(modalId);
      }
    });
    const closeBtn = modal.querySelector(".cb-modal-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        const targetId = closeBtn.dataset.modalId || modalId;
        closeModal(targetId);
      });
    }
    const actionCloseButtons = modal.querySelectorAll("[data-modal-close]");
    actionCloseButtons.forEach((btn) => {
      if (btn.dataset.bound === "true") return;
      btn.addEventListener("click", () => {
        const targetId = btn.dataset.modalId || modalId;
        closeModal(targetId);
      });
      btn.dataset.bound = "true";
    });
  });
};

const SETTINGS_STORAGE_KEY = "coolbits.settings";
const DEFAULT_SETTINGS = {
  preferEnglish: false,
  showAdvancedPrompts: false,
  showBetaNotices: false,
};
let cbSettings = { ...DEFAULT_SETTINGS };
// TODO: sync cbSettings with a future PATCH /api/account/settings endpoint once available.

const saveSettingsToStorage = () => {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(cbSettings));
  } catch (error) {
    console.warn("[SETTINGS] persist failed", error);
  }
};

const loadSettingsFromStorage = () => {
  cbSettings = { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        cbSettings = { ...cbSettings, ...parsed };
      }
    }
  } catch (error) {
    console.warn("[SETTINGS] parse failed", error);
  }
  syncSettingsUI();
};

const syncSettingsUI = () => {
  document.querySelectorAll(".cb-settings-toggle").forEach((toggle) => {
    const key = toggle.getAttribute("data-setting-key");
    if (!key) return;
    const value = Boolean(cbSettings[key]);
    toggle.classList.toggle("is-on", value);
    toggle.setAttribute("aria-checked", String(value));
  });
};

const attachSettingsHandlers = () => {
  document.querySelectorAll(".cb-settings-toggle").forEach((toggle) => {
    const key = toggle.getAttribute("data-setting-key");
    if (!key) return;
    toggle.addEventListener("click", () => {
      cbSettings[key] = !cbSettings[key];
      saveSettingsToStorage();
      syncSettingsUI();
    });
  });
};

const setElementText = (id, value) => {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = value;
  }
};

const configureConnectButton = (button, modalId) => {
  if (!button) return;
  button.onclick = () => {
    closeModal(modalId, { silentFocus: true });
    openOnboardingModal();
  };
};

const formatDateTime = (value) => {
  if (!value) return "";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toLocaleString();
  } catch {
    return "";
  }
};

const cbFormatFriendlyDate = (value) => {
  if (!value) return "";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
};

const populateProfileModal = async () => {
  const guestBlock = document.getElementById("cb-profile-guest");
  const detailsBlock = document.getElementById("cb-profile-details");
  const connectBtn = document.getElementById("cb-profile-connect");
  configureConnectButton(connectBtn, "cb-profile-modal");

  if (!cbIsAuthenticated()) {
    if (guestBlock) guestBlock.hidden = false;
    if (detailsBlock) detailsBlock.hidden = true;
    return;
  }

  if (guestBlock) guestBlock.hidden = true;
  if (!cbCurrentUser) {
    await refreshAccountUsage();
  }
  if (!cbCurrentUser) {
    if (guestBlock) guestBlock.hidden = false;
    if (detailsBlock) detailsBlock.hidden = true;
    return;
  }

  if (detailsBlock) detailsBlock.hidden = false;
  const planLabel = getPlanLabel(cbCurrentUser);
  const tokens =
    typeof cbCurrentUser.tokensRemaining === "number"
      ? formatTokens(Math.max(0, cbCurrentUser.tokensRemaining))
      : formatTokens(STARTER_TOKENS);
  const verificationMessage = cbCurrentUser.emailVerified
    ? `Email verified${cbCurrentUser.emailVerifiedAt ? ` on ${formatDateTime(cbCurrentUser.emailVerifiedAt)}` : ""}.`
    : "Email not verified yet.";

  setElementText("cb-profile-email", cbCurrentUser.email || "Unknown");
  setElementText("cb-profile-plan", planLabel);
  setElementText("cb-profile-tokens", tokens);
  setElementText("cb-profile-verification", verificationMessage);
};

const fetchBillingSummary = async () => {
  try {
    const response = await fetch(API_BILLING_SUMMARY, {
      method: "GET",
      headers: cbGetAuthHeaders(),
      credentials: "include",
    });
    console.log("[BILLING] summary status", response.status);
    const data = await safeJson(response);
    if (response.status === 401) {
      console.warn("[BILLING] summary unauthorized");
      cbSetBillingSummary(null);
      return null;
    }
    if (!response.ok) {
      const errorMessage = data?.error || "Unable to load billing details.";
      throw new Error(errorMessage);
    }
    console.log("[BILLING] summary payload", data);
    cbSetBillingSummary(data);
    return data;
  } catch (error) {
    console.error("[BILLING] summary fetch failed", error);
    cbSetBillingSummary(null);
    throw error;
  }
};

const populateBillingModal = async () => {
  setBillingError('');
  setBillingSuccess('');
  const guestBlock = document.getElementById('cb-billing-guest');
  const detailsBlock = document.getElementById('cb-billing-details');
  const planEl = document.getElementById('cb-billing-plan');
  const tokensEl = document.getElementById('cb-billing-tokens');
  const descriptionEl = document.getElementById('cb-billing-description');
  const upgradeBtn = document.getElementById('cb-billing-upgrade-btn');
  const downgradeBtn = document.getElementById('cb-billing-downgrade-btn');
  const connectBtn = document.getElementById('cb-billing-connect');
  configureConnectButton(connectBtn, 'cb-billing-modal');

  const showGuestView = () => {
    if (guestBlock) guestBlock.hidden = false;
    if (detailsBlock) detailsBlock.hidden = true;
    setElementText('cb-billing-plan', 'Guest');
    setElementText('cb-billing-tokens', '-');
    if (descriptionEl) {
      descriptionEl.textContent = 'Sign in to see billing details and manage your plan.';
    }
    if (upgradeBtn) upgradeBtn.hidden = true;
    if (downgradeBtn) downgradeBtn.hidden = true;
  };

  if (!cbIsAuthenticated()) {
    showGuestView();
    return;
  }

  if (guestBlock) guestBlock.hidden = true;
  if (detailsBlock) detailsBlock.hidden = false;
  if (planEl) planEl.textContent = 'Loading...';
  if (tokensEl) tokensEl.textContent = '-';
  if (descriptionEl) descriptionEl.textContent = 'Loading billing details...';

  let summary = cbLatestBillingSummary;
  if (!summary) {
    try {
      summary = await fetchBillingSummary();
    } catch (error) {
      setBillingError('Unable to load billing details. Please try again later.');
      summary = null;
    }
  }

  if (!summary) {
    showGuestView();
    return;
  }

  const planCode = cbNormalizePlanCode(summary.plan);
  const planLabel =
    summary.plan?.label ||
    PLAN_DEFINITIONS[planCode]?.label ||
    'CoolBits Starter';
  const planStatus =
    summary.trial?.active && summary.trial?.endsAt
      ? `${planLabel} (trial)`
      : planLabel;
  const usageMetrics = cbDeriveUsageMetrics(summary);
  const tokensText = cbFormatTokenFullText(
    usageMetrics.tokensRemaining,
    usageMetrics.tokensIncluded
  );
  setElementText('cb-billing-plan', planStatus);
  setElementText('cb-billing-tokens', tokensText);

  const planDef = PLAN_DEFINITIONS[planCode] || null;
  const descriptionParts = [];
  if (planDef) {
    const workspaceText =
      planDef.workspacesCount === 'all'
        ? 'All workspaces'
        : `${planDef.workspacesCount} workspace${planDef.workspacesCount === 1 ? '' : 's'}`;
    const projectText =
      planDef.projects === 'all'
        ? 'Unlimited projects'
        : `${planDef.projects} projects`;
    const agentText =
      planDef.agents === 'all'
        ? 'Unlimited AI agents'
        : `${planDef.agents} AI agents`;
    descriptionParts.push(
      `${workspaceText} · ${projectText} · ${agentText} · ${formatTokens(
        planDef.tokensPerMonth
      )} tokens / month`
    );
  }
  if (summary.trial?.active) {
    const endsAt = summary.trial?.endsAt ? new Date(summary.trial.endsAt) : null;
    const trialEndsLabel =
      endsAt && !Number.isNaN(endsAt.getTime())
        ? endsAt.toLocaleDateString()
        : 'soon';
    descriptionParts.push(`Free trial ends ${trialEndsLabel}.`);
  }
  if (summary.stripe?.status) {
    let statusLabel = summary.stripe.status;
    if (summary.stripe.cancelAtPeriodEnd) {
      statusLabel += ' (cancels at period end)';
    }
    descriptionParts.push(`Subscription status: ${statusLabel}.`);
  }
  if (descriptionEl) {
    descriptionEl.textContent = descriptionParts.join(' ');
  }

  if (upgradeBtn) {
    upgradeBtn.hidden = false;
    upgradeBtn.disabled = false;
    upgradeBtn.textContent = 'Change plan';
    upgradeBtn.onclick = (event) => {
      event?.preventDefault?.();
      cbOpenPlansModal({
        source: 'billing',
        highlightPlan: planCode,
        summary,
      });
    };
  }
  if (downgradeBtn) {
    downgradeBtn.hidden = planCode === 'starter';
    downgradeBtn.disabled = false;
    downgradeBtn.onclick = handleBillingDowngrade;
  }

  if (cbPendingBillingSuccessMessage) {
    setBillingSuccess("Subscription updated. You're all set!");
    cbPendingBillingSuccessMessage = false;
  } else {
    setBillingSuccess('');
  }
};

const cbOpenManageSubscription = () => {
  console.log("[BILLING] manage subscription clicked");
};

const CB_ACCOUNT_VIEWS = ["overview", "connectors"];
let cbAccountActiveView = "overview";

const cbSetAccountView = (view = "overview") => {
  const targetView = CB_ACCOUNT_VIEWS.includes(view) ? view : "overview";
  const views =
    (shellElements.accountViews && shellElements.accountViews.length
      ? shellElements.accountViews
      : Array.from(document.querySelectorAll("[data-account-view]"))) || [];
  const buttons =
    (shellElements.accountViewButtons && shellElements.accountViewButtons.length
      ? shellElements.accountViewButtons
      : Array.from(document.querySelectorAll("[data-account-view-btn]"))) || [];

  views.forEach((el) => {
    if (!el) return;
    const isActive = el.getAttribute("data-account-view") === targetView;
    el.hidden = !isActive;
    el.classList.toggle("is-active", isActive);
  });

  buttons.forEach((button) => {
    if (!button) return;
    const buttonTarget = button.getAttribute("data-account-view-btn");
    const isActive = buttonTarget === targetView;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
    button.setAttribute("tabindex", isActive ? "0" : "-1");
  });

  const modal = document.getElementById("cb-account-billing");
  if (modal) {
    modal.setAttribute("data-active-view", targetView);
  }
  cbAccountActiveView = targetView;
  if (targetView === "connectors") {
    cbRefreshConnectorStatuses();
    if (!cbCouncilPerformanceState.loaded && !cbCouncilPerformanceState.loading) {
      cbCouncilPerformanceState.loading = true;
      cbCouncilPerformanceState.error = null;
      cbRenderCouncilPerformanceCard();
      cbFetchCouncilPerformanceSummary(cbCouncilPerformanceState.range);
    } else {
      cbRenderCouncilPerformanceCard();
    }
  }
};

const setupAccountViewTabs = () => {
  const buttons =
    (shellElements.accountViewButtons && shellElements.accountViewButtons.length
      ? shellElements.accountViewButtons
      : Array.from(document.querySelectorAll("[data-account-view-btn]"))) || [];
  buttons.forEach((button) => {
    if (!button || button.dataset.accountTabBound === "true") return;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const targetView = button.getAttribute("data-account-view-btn") || "overview";
      cbSetAccountView(targetView);
    });
    button.dataset.accountTabBound = "true";
  });
  cbSetAccountView(cbAccountActiveView);
};

const cbGetConnectorStatusLabel = (status) =>
  CONNECTOR_STATUS_LABELS[status] || CONNECTOR_STATUS_LABELS.coming_soon;

const cbUpdateConnectorState = (key, partial = {}) => {
  if (!key) return;
  const current = cbConnectorState[key] || {};
  cbConnectorState[key] = {
    status: "unknown",
    customerId: null,
    loginCustomerId: null,
    customerName: null,
    propertyId: null,
    lastSyncAt: null,
    lastError: null,
    properties: [],
    ...current,
    ...partial,
  };
  cbRenderConnectorsPanel();
  cbUpdateChatHeader();
  if (cbConnectorDetailState.connector && cbConnectorDetailState.connector.key === key) {
    cbRenderConnectorDetail(cbConnectorDetailState.connector);
  }
};

const cbFetchConnectorStatusGoogleAds = async () => {
  const connector = CONNECTORS_CONFIG.find((c) => c.key === "googleads");
  if (!connector || !connector.apiBase) return;
  const { ok, status, json } = await cbFetchJson(`${connector.apiBase}/status`);
	  if (ok && json) {
	    const customerId = json.customerId || json.customer_id || null;
	    const loginCustomerId = json.loginCustomerId || json.login_customer_id || null;
	    const customerName = json.customerName || json.customer_name || null;
	    const lastSync =
	      json.lastSyncAt || json.last_sync_at || json.lastSync || null;
	    cbUpdateConnectorState("googleads", {
      status: json.connected
        ? "connected"
        : (json.status || "").toLowerCase() === "error"
        ? "error"
        : "disconnected",
	      customerId,
	      loginCustomerId,
	      customerName,
	      lastSyncAt: lastSync,
	      lastError: json.error ? String(json.error) : null,
	    });
	    return;
	  }
  let lastError = "Unable to fetch status.";
  if (status === 401) {
    lastError = "Please sign in to view Google Ads status.";
  } else if (status === 404) {
    lastError = "Google Ads connector not available.";
  }
  cbUpdateConnectorState("googleads", { status: "error", lastError });
};

const cbFetchConnectorStatusGa4 = async () => {
  const connector = CONNECTORS_CONFIG.find((c) => c.key === "ga4");
  if (!connector || !connector.apiBase) return;
  const ws = cbNormalizeWorkspaceId(cbCurrentWorkspaceId);
  const params = new URLSearchParams();
  if (ws) params.set("workspaceId", ws);
  const { ok, status, json } = await cbFetchJson(
    `${connector.apiBase}/status${params.toString() ? `?${params.toString()}` : ""}`
  );
  if (ok && json) {
    const connected =
      typeof json.connected === "boolean"
        ? json.connected
        : (json.status || "").toLowerCase() === "connected";
    const propertyId = json.propertyId || json.property_id || null;
    const lastSync =
      json.lastSyncAt || json.last_sync_at || json.lastSync || null;
    const lastError = json.error ? String(json.error) : null;
    cbUpdateConnectorState("ga4", {
      status: connected
        ? "connected"
        : (json.status || "").toLowerCase() === "error"
        ? "error"
        : "disconnected",
      propertyId,
      lastSyncAt: lastSync,
      lastError: connected ? null : lastError,
    });
    return;
  }
  let lastError = "Unable to fetch GA4 status.";
  if (status === 401) {
    lastError = "Please sign in to view GA4 status.";
  } else if (status === 404) {
    lastError = "GA4 connector not available.";
  }
  cbUpdateConnectorState("ga4", { status: "error", lastError });
};

const cbRefreshConnectorStatuses = async () => {
  await cbFetchConnectorStatusGoogleAds();
  await cbFetchConnectorStatusGa4();
};

const cbFetchCouncilPerformanceSummary = async (range) => {
  const nextRange = range || cbCouncilPerformanceState.range || "billing_period";
  cbCouncilPerformanceState.loading = true;
  cbCouncilPerformanceState.error = null;
  cbCouncilPerformanceState.range = nextRange;
  cbRenderCouncilPerformanceCard();
  try {
    const params = new URLSearchParams({ range: cbCouncilPerformanceState.range });
    const { ok, json, status } = await cbFetchJson(
      `/api/council/performance/summary?${params.toString()}`
    );
    if (ok && json) {
      cbCouncilPerformanceState.summary = json;
      cbCouncilPerformanceState.error = null;
    } else {
      const errMessage =
        status === 401
          ? "Please sign in to view council performance."
          : json?.error || "Unable to load council performance.";
      cbCouncilPerformanceState.summary = null;
      cbCouncilPerformanceState.error = errMessage;
    }
  } catch (error) {
    console.error("[COUNCIL_PERFORMANCE] fetch failed", error);
    cbCouncilPerformanceState.summary = null;
    cbCouncilPerformanceState.error = "Unable to load council performance.";
  } finally {
    cbCouncilPerformanceState.loaded = true;
    cbCouncilPerformanceState.loading = false;
    cbRenderCouncilPerformanceCard();
  }
};

const cbFetchGoogleAdsSummary = async (workspaceId) => {
  if (!workspaceId) return { error: "workspace_missing" };
  const params = new URLSearchParams({
    workspaceId: workspaceId,
    dateRange: "last_7_days",
  });
  const { ok, json, status } = await cbFetchJson(
    `/api/connectors/googleads/summary?${params.toString()}`
  );
  if (ok && json) {
    return json;
  }
  const errorCode = (json && (json.error || json.code)) || "summary_failed";
  return { error: errorCode, status: status || null };
};

const cbFetchGa4Summary = async (workspaceId) => {
  if (!workspaceId) return { error: "workspace_missing" };
  const params = new URLSearchParams({
    workspaceId: workspaceId,
    dateRange: "last_7_days",
  });
  const { ok, json, status } = await cbFetchJson(
    `/api/connectors/ga4/summary?${params.toString()}`
  );
  if (ok && json) {
    return json;
  }
  const errorCode = (json && (json.error || json.code)) || "summary_failed";
  return { error: errorCode, status: status || null, message: json?.message || null };
};

// --- Dashboards (GA4 + Google Ads placeholder) ---
const CB_GA4_REPORT_BLOCKS_DEFAULT = ["overview", "series", "pages", "sources", "events"];
const CB_GA4_REPORT_BLOCKS_OPTIONAL = ["geo", "device"];
const CB_GA4_REPORT_BLOCKS_ALL = [
  ...CB_GA4_REPORT_BLOCKS_DEFAULT,
  ...CB_GA4_REPORT_BLOCKS_OPTIONAL,
];

const cbNormalizeGa4ReportBlocks = (blocks) => {
  const raw = Array.isArray(blocks) ? blocks : [];
  const normalized = raw
    .map((b) => (b == null ? "" : String(b)).trim().toLowerCase())
    .filter(Boolean)
    .filter((b) => CB_GA4_REPORT_BLOCKS_ALL.includes(b));
  const unique = Array.from(new Set(normalized));
  return unique.length ? unique : CB_GA4_REPORT_BLOCKS_DEFAULT.slice();
};

const cbGa4BlocksStorageKey = (workspaceId) => {
  const ws = cbNormalizeWorkspaceId(workspaceId);
  return `coolbits:ga4_blocks:${ws}`;
};

const cbLoadGa4BlocksFromStorage = (workspaceId) => {
  try {
    const raw = window.localStorage.getItem(cbGa4BlocksStorageKey(workspaceId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return cbNormalizeGa4ReportBlocks(parsed);
  } catch (_err) {
    return null;
  }
};

const cbPersistGa4BlocksToStorage = (workspaceId, blocks) => {
  try {
    const normalized = cbNormalizeGa4ReportBlocks(blocks);
    window.localStorage.setItem(cbGa4BlocksStorageKey(workspaceId), JSON.stringify(normalized));
  } catch (_err) {
    // ignore
  }
};

const cbGa4DashboardState = {
  initialized: false,
  blocksWorkspaceId: null,
  preset: "last_7_days",
  from: null,
  to: null,
  selectedBlocks: new Set(CB_GA4_REPORT_BLOCKS_DEFAULT),
  compareEnabled: false,
  compareMode: "previous_period",
  compareFrom: null,
  compareTo: null,
  loading: false,
  error: null,
  report: null,
  lastSuccessfulFingerprint: null,
  snapshotsLoading: false,
  snapshotsError: null,
  snapshots: [],
  selectedSnapshotId: "",
  snapshotLabel: "",
};

const CB_COUNCIL_SHARE_QUESTION_DEFAULT = "Explain what changed, likely drivers, and next actions.";

const cbCouncilShareState = {
  source: "ga4",
  snapshotId: null,
  mode: "compact",
  includeBlocks: new Set(CB_GA4_REPORT_BLOCKS_DEFAULT),
  topN: 10,
  question: CB_COUNCIL_SHARE_QUESTION_DEFAULT,
  previewPrompt: "",
  previewMeta: null,
  briefId: null,
  loading: false,
  error: null,
};

const cbCouncilShareModeOptions = [
  { value: "compact", label: "Compact" },
  { value: "standard", label: "Standard" },
  { value: "full", label: "Full" },
];

const cbNormalizeCouncilShareMode = (mode) => {
  const raw = (mode || "").toString().trim().toLowerCase();
  if (raw === "standard") return "standard";
  if (raw === "full") return "full";
  return "compact";
};

const cbCouncilShareTopNCap = (mode) => {
  const m = cbNormalizeCouncilShareMode(mode);
  if (m === "compact") return 5;
  if (m === "standard") return 10;
  return 20;
};

const cbCreateCouncilBrief = async ({ snapshotId, mode, includeBlocks, topN, question }) => {
  const ws = cbNormalizeWorkspaceId(cbCurrentWorkspaceId);
  return cbFetchJson("/api/council/briefs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceId: ws,
      source: "ga4",
      snapshotId,
      mode: cbNormalizeCouncilShareMode(mode),
      includeBlocks: cbNormalizeGa4ReportBlocks(includeBlocks),
      topN,
      question: (question || "").toString(),
    }),
  });
};

const cbGetGa4SnapshotMeta = (snapshotId) => {
  const id = (snapshotId || "").toString();
  return (cbGa4DashboardState.snapshots || []).find((s) => s && String(s.id) === id) || null;
};

const cbSetCouncilShareSnapshot = (snapshotId) => {
  cbCouncilShareState.source = "ga4";
  cbCouncilShareState.snapshotId = snapshotId ? String(snapshotId) : null;
  cbCouncilShareState.mode = "compact";
  cbCouncilShareState.topN = 10;
  cbCouncilShareState.question = CB_COUNCIL_SHARE_QUESTION_DEFAULT;
  cbCouncilShareState.previewPrompt = "";
  cbCouncilShareState.previewMeta = null;
  cbCouncilShareState.briefId = null;
  cbCouncilShareState.loading = false;
  cbCouncilShareState.error = null;

  const meta = cbGetGa4SnapshotMeta(snapshotId);
  const blocksFromSnapshot = Array.isArray(meta?.blocks) ? meta.blocks : null;
  const fallbackBlocks = cbGetGa4DashboardSelectedBlocks();
  cbCouncilShareState.includeBlocks = new Set(cbNormalizeGa4ReportBlocks(blocksFromSnapshot || fallbackBlocks));
};

const cbRenderCouncilShareModal = () => {
  const body = document.getElementById("cb-council-share-body");
  const actions = document.getElementById("cb-council-share-actions");
  if (!body || !actions) return;
  body.innerHTML = "";
  actions.innerHTML = "";

  if (!cbIsAuthenticated()) {
    const err = document.createElement("p");
    err.className = "cb-form-error";
    err.textContent = "Sign in required to share with Council.";
    body.appendChild(err);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-primary";
    btn.textContent = "Continue with Google";
    btn.addEventListener("click", () => startGoogleLogin());
    actions.appendChild(btn);
    return;
  }

  const snapshotId = cbCouncilShareState.snapshotId;
  if (!snapshotId) {
    const err = document.createElement("p");
    err.className = "cb-form-error";
    err.textContent = "Select a snapshot first.";
    body.appendChild(err);
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "btn btn-secondary";
    closeBtn.textContent = "Close";
    closeBtn.addEventListener("click", () => closeModal("cb-council-share-modal"));
    actions.appendChild(closeBtn);
    return;
  }

  const meta = cbGetGa4SnapshotMeta(snapshotId);
  const headline = document.createElement("div");
  headline.className = "cb-dashboard-banner";
  const label = meta?.label || (meta?.from && meta?.to ? `${meta.from} → ${meta.to}` : `Snapshot ${snapshotId}`);
  headline.innerHTML = `<strong>GA4 snapshot</strong><div class="cb-dashboard-muted">${label}</div>`;
  body.appendChild(headline);

  const controls = document.createElement("div");
  controls.className = "cb-dashboard-controls";

  const modeField = document.createElement("div");
  modeField.className = "cb-dashboard-field";
  const modeLabel = document.createElement("label");
  modeLabel.textContent = "Mode";
  const modeSelect = document.createElement("select");
  modeSelect.className = "cb-dashboard-input";
  modeSelect.innerHTML = cbCouncilShareModeOptions
    .map((opt) => `<option value="${opt.value}">${opt.label}</option>`)
    .join("");
  modeSelect.value = cbNormalizeCouncilShareMode(cbCouncilShareState.mode);
  modeSelect.disabled = cbCouncilShareState.loading;
  modeSelect.addEventListener("change", () => {
    cbCouncilShareState.mode = modeSelect.value;
    const cap = cbCouncilShareTopNCap(cbCouncilShareState.mode);
    if (cbCouncilShareState.topN > cap) cbCouncilShareState.topN = cap;
    cbRenderCouncilShareModal();
  });
  modeField.appendChild(modeLabel);
  modeField.appendChild(modeSelect);
  controls.appendChild(modeField);

  const topNField = document.createElement("div");
  topNField.className = "cb-dashboard-field";
  const topNLabel = document.createElement("label");
  topNLabel.textContent = "Top N";
  const topNSelect = document.createElement("select");
  topNSelect.className = "cb-dashboard-input";
  const cap = cbCouncilShareTopNCap(cbCouncilShareState.mode);
  const options = [5, 10, 20].map((n) => ({ n, disabled: n > cap }));
  topNSelect.innerHTML = options
    .map((o) => `<option value="${o.n}" ${o.disabled ? "disabled" : ""}>${o.n}</option>`)
    .join("");
  topNSelect.value = String(Math.min(cbCouncilShareState.topN || 10, cap));
  topNSelect.disabled = cbCouncilShareState.loading;
  topNSelect.addEventListener("change", () => {
    cbCouncilShareState.topN = Number(topNSelect.value) || 10;
    cbRenderCouncilShareModal();
  });
  topNField.appendChild(topNLabel);
  topNField.appendChild(topNSelect);
  controls.appendChild(topNField);

  body.appendChild(controls);

  const blocksPanel = document.createElement("div");
  blocksPanel.className = "cb-dashboard-panel cb-ga4-blocks-panel";
  const blocksTitle = document.createElement("h3");
  blocksTitle.className = "cb-dashboard-panel-title";
  blocksTitle.textContent = "Include blocks";
  blocksPanel.appendChild(blocksTitle);

  const blocksGrid = document.createElement("div");
  blocksGrid.className = "cb-ga4-blocks-grid";
  const blockLabels = {
    overview: "Overview",
    series: "Series",
    pages: "Pages",
    sources: "Sources",
    events: "Events",
    geo: "Geo",
    device: "Device",
  };
  const selected = new Set(cbNormalizeGa4ReportBlocks(Array.from(cbCouncilShareState.includeBlocks || [])));
  CB_GA4_REPORT_BLOCKS_ALL.forEach((key) => {
    const wrap = document.createElement("label");
    wrap.className = "cb-dashboard-toggle cb-ga4-block-toggle";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = selected.has(key);
    input.disabled = cbCouncilShareState.loading;
    input.addEventListener("change", () => {
      if (input.checked) {
        selected.add(key);
      } else {
        selected.delete(key);
      }
      if (!selected.size) {
        input.checked = true;
        selected.add(key);
      }
      cbCouncilShareState.includeBlocks = new Set(cbNormalizeGa4ReportBlocks(Array.from(selected)));
      cbCouncilShareState.previewPrompt = "";
      cbCouncilShareState.previewMeta = null;
      cbCouncilShareState.briefId = null;
      cbRenderCouncilShareModal();
    });
    const labelEl = document.createElement("span");
    labelEl.textContent = blockLabels[key] || key;
    wrap.appendChild(input);
    wrap.appendChild(labelEl);
    blocksGrid.appendChild(wrap);
  });
  blocksPanel.appendChild(blocksGrid);
  body.appendChild(blocksPanel);

  const questionField = document.createElement("div");
  questionField.className = "cb-dashboard-field";
  const questionLabel = document.createElement("label");
  questionLabel.textContent = "Question";
  const questionInput = document.createElement("textarea");
  questionInput.className = "cb-dashboard-input";
  questionInput.rows = 4;
  questionInput.value = cbCouncilShareState.question || "";
  questionInput.disabled = cbCouncilShareState.loading;
  questionInput.addEventListener("input", () => {
    cbCouncilShareState.question = questionInput.value;
  });
  questionField.appendChild(questionLabel);
  questionField.appendChild(questionInput);
  body.appendChild(questionField);

  const preview = document.createElement("details");
  preview.className = "cb-council-share-preview";
  if (cbCouncilShareState.previewPrompt) {
    preview.open = true;
  }
  const previewSummary = document.createElement("summary");
  previewSummary.textContent = "Preview";
  preview.appendChild(previewSummary);
  const previewContent = document.createElement("pre");
  previewContent.className = "cb-council-share-preview__content";
  previewContent.textContent = cbCouncilShareState.previewPrompt || "Generate preview to see the brief.";
  preview.appendChild(previewContent);
  if (cbCouncilShareState.previewMeta) {
    const metaEl = document.createElement("div");
    metaEl.className = "cb-dashboard-muted";
    const tokens = cbCouncilShareState.previewMeta.estimatedTokens;
    const truncated = cbCouncilShareState.previewMeta.truncated;
    metaEl.textContent = `Estimated tokens: ${tokens || "—"}${truncated ? " · truncated" : ""}`;
    preview.appendChild(metaEl);
  }
  body.appendChild(preview);

  if (cbCouncilShareState.error) {
    const err = document.createElement("p");
    err.className = "cb-form-error";
    err.textContent = cbCouncilShareState.error;
    body.appendChild(err);
  }

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn btn-secondary";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", () => closeModal("cb-council-share-modal"));
  actions.appendChild(cancelBtn);

  const previewBtn = document.createElement("button");
  previewBtn.type = "button";
  previewBtn.className = "btn btn-secondary";
  previewBtn.textContent = cbCouncilShareState.loading ? "Generating..." : "Generate preview";
  previewBtn.disabled = cbCouncilShareState.loading;
  previewBtn.addEventListener("click", async () => {
    cbCouncilShareState.loading = true;
    cbCouncilShareState.error = null;
    cbRenderCouncilShareModal();
    const includeBlocks = cbNormalizeGa4ReportBlocks(Array.from(cbCouncilShareState.includeBlocks || []));
    const { ok, json, status } = await cbCreateCouncilBrief({
      snapshotId: Number(snapshotId),
      mode: cbCouncilShareState.mode,
      includeBlocks,
      topN: cbCouncilShareState.topN,
      question: cbCouncilShareState.question,
    });
    if (ok && json && json.prompt) {
      cbCouncilShareState.previewPrompt = json.prompt;
      cbCouncilShareState.previewMeta = json.meta || null;
      cbCouncilShareState.briefId = json.briefId || null;
      cbCouncilShareState.error = null;
    } else {
      const message =
        (json && (json.message || json.error)) ||
        (status === 401 ? "Please sign in to create a council brief." : "Could not generate preview.");
      cbCouncilShareState.previewPrompt = "";
      cbCouncilShareState.previewMeta = null;
      cbCouncilShareState.briefId = null;
      cbCouncilShareState.error = message;
    }
    cbCouncilShareState.loading = false;
    cbRenderCouncilShareModal();
  });
  actions.appendChild(previewBtn);

  const sendBtn = document.createElement("button");
  sendBtn.type = "button";
  sendBtn.className = "btn btn-primary";
  sendBtn.textContent = "Send";
  sendBtn.disabled = cbCouncilShareState.loading || !cbCouncilShareState.previewPrompt;
  sendBtn.addEventListener("click", () => {
    if (!cbCouncilShareState.previewPrompt) {
      cbShowBillingToast("cancel", "Generate preview first.");
      return;
    }
    const prompt = cbCouncilShareState.previewPrompt;
    closeModal("cb-council-share-modal", { silentFocus: true });
    if (typeof cbSetDashboardView === "function") {
      cbSetDashboardView("chat");
    }
    const input = cbGetComposerInput();
    if (input) {
      input.value = prompt;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
      if (typeof input.setSelectionRange === "function") {
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }
    if (typeof cbOpenCouncilModal === "function") {
      cbOpenCouncilModal();
    } else if (typeof window.cbOpenCouncilModal === "function") {
      window.cbOpenCouncilModal();
    }
  });
  actions.appendChild(sendBtn);
};

const cbOpenCouncilShareModalForGa4Snapshot = (snapshotId) => {
  cbSetCouncilShareSnapshot(snapshotId);
  cbRenderCouncilShareModal();
  openModal("cb-council-share-modal");
};

const cbFormatLocalYmd = (date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const cbParseLocalYmd = (value) => {
  const raw = (value || "").toString().trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const cbAddLocalDays = (date, days) => {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
};

const cbComputePresetRange = (preset) => {
  const today = new Date();
  const todayYmd = cbFormatLocalYmd(today);
  const yesterday = cbAddLocalDays(today, -1);
  const yesterdayYmd = cbFormatLocalYmd(yesterday);
  const now = new Date();
  const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
  const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  switch ((preset || "").toString().toLowerCase()) {
    case "today":
      return { from: todayYmd, to: todayYmd };
    case "yesterday":
      return { from: yesterdayYmd, to: yesterdayYmd };
    case "last_7_days": {
      const from = cbFormatLocalYmd(cbAddLocalDays(yesterday, -6));
      return { from, to: yesterdayYmd };
    }
    case "last_30_days": {
      const from = cbFormatLocalYmd(cbAddLocalDays(yesterday, -29));
      return { from, to: yesterdayYmd };
    }
    case "this_month":
      return { from: cbFormatLocalYmd(firstOfThisMonth), to: todayYmd };
    case "last_month":
      return { from: cbFormatLocalYmd(firstOfLastMonth), to: cbFormatLocalYmd(lastOfLastMonth) };
    default:
      return null;
  }
};

const cbGetGa4DashboardRange = () => {
  if (cbGa4DashboardState.preset === "custom") {
    return {
      from: cbGa4DashboardState.from,
      to: cbGa4DashboardState.to,
    };
  }
  const computed = cbComputePresetRange(cbGa4DashboardState.preset);
  return computed || { from: cbGa4DashboardState.from, to: cbGa4DashboardState.to };
};

const CB_GA4_COMPARE_MODES = [
  { value: "previous_period", label: "Previous period" },
  { value: "previous_year", label: "Previous year" },
  { value: "custom", label: "Custom" },
];

const cbNormalizeGa4CompareMode = (mode) => {
  const raw = (mode || "").toString().trim().toLowerCase();
  if (raw === "previous_period") return "previous_period";
  if (raw === "previous_year") return "previous_year";
  if (raw === "custom") return "custom";
  return "previous_period";
};

const cbGetGa4DashboardSelectedBlocks = () =>
  cbNormalizeGa4ReportBlocks(Array.from(cbGa4DashboardState.selectedBlocks || []));

const cbSetGa4DashboardSelectedBlocks = (blocks, { persist = true } = {}) => {
  const normalized = cbNormalizeGa4ReportBlocks(blocks);
  cbGa4DashboardState.selectedBlocks = new Set(normalized);
  if (persist) {
    cbPersistGa4BlocksToStorage(cbCurrentWorkspaceId, normalized);
  }
};

const cbGetGa4DashboardSelection = () => {
  const range = cbGetGa4DashboardRange();
  const blocks = cbGetGa4DashboardSelectedBlocks();
  const compareEnabled = !!cbGa4DashboardState.compareEnabled;
  if (!compareEnabled) {
    return {
      from: range.from,
      to: range.to,
      blocks,
      compareMode: "none",
      compareFrom: null,
      compareTo: null,
    };
  }
  const compareMode = cbNormalizeGa4CompareMode(cbGa4DashboardState.compareMode);
  const compareFrom =
    compareMode === "custom" ? (cbGa4DashboardState.compareFrom || "").toString().trim() : null;
  const compareTo =
    compareMode === "custom" ? (cbGa4DashboardState.compareTo || "").toString().trim() : null;
  return { from: range.from, to: range.to, blocks, compareMode, compareFrom, compareTo };
};

const cbBuildGa4ReportFingerprint = (selection) => {
  const blocks = cbNormalizeGa4ReportBlocks(selection?.blocks);
  const compareMode = (selection?.compareMode || "none").toString().trim().toLowerCase() || "none";
  const base = {
    from: selection?.from || "",
    to: selection?.to || "",
    blocks: blocks.join(","),
    compareMode,
  };
  if (compareMode === "custom") {
    base.compareFrom = selection?.compareFrom || "";
    base.compareTo = selection?.compareTo || "";
  }
  return JSON.stringify(base);
};

const cbValidateGa4DashboardSelection = (selection) => {
  const fromDate = cbParseLocalYmd(selection?.from);
  const toDate = cbParseLocalYmd(selection?.to);
  if (!fromDate || !toDate || fromDate.getTime() > toDate.getTime()) return "invalid_range";
  const blocks = cbNormalizeGa4ReportBlocks(selection?.blocks);
  if (!blocks.length) return "no_blocks";
  if ((selection?.compareMode || "none") === "custom") {
    const compareFromDate = cbParseLocalYmd(selection?.compareFrom);
    const compareToDate = cbParseLocalYmd(selection?.compareTo);
    if (!compareFromDate || !compareToDate || compareFromDate.getTime() > compareToDate.getTime()) {
      return "invalid_compare_range";
    }
  }
  return null;
};

const cbNormalizeGa4ReportPayload = (payload) => {
  if (!payload || typeof payload !== "object") return payload;
  if (payload.data && payload.blocks) return payload;
  if (payload.totals || payload.series || payload.tables) {
    return {
      range: payload.range || { from: null, to: null },
      compare: payload.compareRange
        ? { mode: "previous_period", from: payload.compareRange.from, to: payload.compareRange.to }
        : null,
      blocks: CB_GA4_REPORT_BLOCKS_DEFAULT.slice(),
      data: {
        overview: payload.totals || {},
        series: payload.series || { daily: [] },
        pages: { rows: payload.tables?.pages || [] },
        sources: { rows: payload.tables?.sourceMedium || [] },
        events: { rows: payload.tables?.events || [] },
      },
    };
  }
  return payload;
};

const cbFetchGa4DashboardReport = async ({
  from,
  to,
  blocks,
  compareMode,
  compareFrom,
  compareTo,
}) => {
  const ws = cbNormalizeWorkspaceId(cbCurrentWorkspaceId);
  const params = new URLSearchParams({
    workspaceId: ws,
    from,
    to,
    blocks: Array.isArray(blocks) ? blocks.join(",") : "",
    compareMode: compareMode || "none",
  });
  if ((compareMode || "").toLowerCase() === "custom") {
    if (compareFrom) params.set("compareFrom", compareFrom);
    if (compareTo) params.set("compareTo", compareTo);
  }
  return cbFetchJson(`/api/connectors/ga4/report?${params.toString()}`);
};

const cbFetchGa4DashboardSnapshots = async (limit = 20) => {
  const ws = cbNormalizeWorkspaceId(cbCurrentWorkspaceId);
  const params = new URLSearchParams({ workspaceId: ws, limit: String(limit) });
  return cbFetchJson(`/api/connectors/ga4/snapshots?${params.toString()}`);
};

const cbFetchGa4DashboardSnapshotById = async (snapshotId) => {
  const ws = cbNormalizeWorkspaceId(cbCurrentWorkspaceId);
  const params = new URLSearchParams({ workspaceId: ws });
  return cbFetchJson(`/api/connectors/ga4/snapshots/${encodeURIComponent(snapshotId)}?${params.toString()}`);
};

const cbRestoreGa4DashboardSnapshot = async (snapshotId) => {
  const nextId = (snapshotId || "").toString().trim();
  if (!nextId) return;

  cbGa4DashboardState.snapshotsLoading = true;
  cbGa4DashboardState.error = null;
  cbRenderGa4Dashboard();
  const { ok, json, status } = await cbFetchGa4DashboardSnapshotById(nextId);
  const snapshot = json?.snapshot;
  if (ok && snapshot && snapshot.payload) {
    cbGa4DashboardState.selectedSnapshotId = String(snapshot.id || nextId);
    cbGa4DashboardState.preset = "custom";
    cbGa4DashboardState.from = snapshot.from;
    cbGa4DashboardState.to = snapshot.to;
    const restoredBlocks = cbNormalizeGa4ReportBlocks(snapshot.blocks);
    cbSetGa4DashboardSelectedBlocks(restoredBlocks, { persist: true });

    const compareModeRaw = (snapshot.compareMode || "").toString().trim();
    const hasCompareRange = !!(snapshot.compareFrom && snapshot.compareTo);
    cbGa4DashboardState.compareEnabled = !!(compareModeRaw || hasCompareRange);
    cbGa4DashboardState.compareMode = compareModeRaw
      ? cbNormalizeGa4CompareMode(compareModeRaw)
      : hasCompareRange
      ? "custom"
      : "previous_period";
    cbGa4DashboardState.compareFrom = snapshot.compareFrom || null;
    cbGa4DashboardState.compareTo = snapshot.compareTo || null;

    const payload = cbNormalizeGa4ReportPayload(snapshot.payload);
    cbGa4DashboardState.report = payload;
    cbGa4DashboardState.lastSuccessfulFingerprint = cbBuildGa4ReportFingerprint({
      from: snapshot.from,
      to: snapshot.to,
      blocks: restoredBlocks,
      compareMode: cbGa4DashboardState.compareEnabled
        ? cbNormalizeGa4CompareMode(cbGa4DashboardState.compareMode)
        : "none",
      compareFrom: cbGa4DashboardState.compareMode === "custom" ? cbGa4DashboardState.compareFrom : null,
      compareTo: cbGa4DashboardState.compareMode === "custom" ? cbGa4DashboardState.compareTo : null,
    });
    cbGa4DashboardState.error = null;
  } else {
    cbGa4DashboardState.report = null;
    cbGa4DashboardState.error = cbDescribeGa4Error(
      status,
      json?.error || "snapshot_get_failed",
      json?.message || "Could not load snapshot."
    );
  }
  cbGa4DashboardState.snapshotsLoading = false;
  cbRenderGa4Dashboard();
};

const cbCreateGa4DashboardSnapshot = async ({
  from,
  to,
  blocks,
  compareMode,
  compareFrom,
  compareTo,
  label,
}) => {
  const ws = cbNormalizeWorkspaceId(cbCurrentWorkspaceId);
  return cbFetchJson(`/api/connectors/ga4/snapshots`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceId: ws,
      from,
      to,
      blocks: Array.isArray(blocks) ? blocks : [],
      compareMode: compareMode || "none",
      compareFrom: compareFrom || "",
      compareTo: compareTo || "",
      label: label || "",
    }),
  });
};

const cbLoadGa4DashboardSnapshots = async () => {
  cbGa4DashboardState.snapshotsLoading = true;
  cbGa4DashboardState.snapshotsError = null;
  cbRenderGa4Dashboard();
  const { ok, json, status } = await cbFetchGa4DashboardSnapshots(20);
  if (ok && json && Array.isArray(json.snapshots)) {
    cbGa4DashboardState.snapshots = json.snapshots;
    cbGa4DashboardState.snapshotsError = null;
  } else {
    cbGa4DashboardState.snapshots = [];
    cbGa4DashboardState.snapshotsError = cbDescribeGa4Error(
      status,
      json?.error,
      json?.message || json?.error || "Unable to load GA4 snapshots."
    );
  }
  cbGa4DashboardState.snapshotsLoading = false;
  cbRenderGa4Dashboard();
};

const cbRunGa4DashboardReport = async () => {
  const ga4State = cbConnectorState.ga4 || {};
  if (ga4State.status !== "connected") {
    cbGa4DashboardState.error = "Connect GA4 first (not_connected).";
    cbRenderGa4Dashboard();
    return;
  }
  if (!ga4State.propertyId) {
    cbGa4DashboardState.error = "Select a GA4 property first (property_not_set).";
    cbRenderGa4Dashboard();
    return;
  }
  const selection = cbGetGa4DashboardSelection();
  const selectionError = cbValidateGa4DashboardSelection(selection);
  if (selectionError) {
    cbGa4DashboardState.error =
      selectionError === "invalid_compare_range"
        ? "Select a valid compare range (invalid_compare_range)."
        : selectionError === "no_blocks"
        ? "Select at least one report block (no_blocks)."
        : "Select a valid date range (invalid_range).";
    cbRenderGa4Dashboard();
    return;
  }

  const fingerprint = cbBuildGa4ReportFingerprint(selection);
  cbGa4DashboardState.loading = true;
  cbGa4DashboardState.error = null;
  cbRenderGa4Dashboard();
  const { ok, json, status } = await cbFetchGa4DashboardReport({
    from: selection.from,
    to: selection.to,
    blocks: selection.blocks,
    compareMode: selection.compareMode,
    compareFrom: selection.compareFrom,
    compareTo: selection.compareTo,
  });
  if (ok && json && !json.error) {
    cbGa4DashboardState.report = cbNormalizeGa4ReportPayload(json);
    cbGa4DashboardState.error = null;
    cbGa4DashboardState.lastSuccessfulFingerprint = fingerprint;
  } else {
    cbGa4DashboardState.error = cbDescribeGa4Error(
      status,
      json?.error,
      json?.message || json?.error || "GA4 report failed."
    );
  }
  cbGa4DashboardState.loading = false;
  cbRenderGa4Dashboard();
};

const cbFormatNumber = (value) => {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
  } catch (_err) {
    return String(n);
  }
};

const cbFormatMoney = (value) => {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);
  } catch (_err) {
    return String(n);
  }
};

const cbBuildGa4LineChartSvg = (daily = [], compareDaily = null) => {
  const points = Array.isArray(daily) ? daily : [];
  if (points.length < 2) {
    return '<p class="cb-modal-note">Not enough data to plot a chart.</p>';
  }
  const comparePoints = Array.isArray(compareDaily) ? compareDaily : null;
  const width = 720;
  const height = 220;
  const padding = { left: 34, right: 10, top: 12, bottom: 24 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const values = points
    .map((p) => (typeof p.sessions === "number" ? p.sessions : Number(p.sessions) || 0))
    .concat(
      comparePoints
        ? comparePoints.map((p) => (typeof p.sessions === "number" ? p.sessions : Number(p.sessions) || 0))
        : []
    );
  const maxY = Math.max(1, ...values);
  const stepX = points.length > 1 ? innerW / (points.length - 1) : innerW;
  const toX = (idx) => padding.left + idx * stepX;
  const toY = (val) => padding.top + innerH - (val / maxY) * innerH;
  const sessionsPath = points
    .map((p, idx) => `${toX(idx).toFixed(1)},${toY(Number(p.sessions) || 0).toFixed(1)}`)
    .join(" ");
  const shouldPlotCompare =
    Array.isArray(comparePoints) && comparePoints.length === points.length && comparePoints.length >= 2;
  const comparePath = shouldPlotCompare
    ? comparePoints
        .map((p, idx) => `${toX(idx).toFixed(1)},${toY(Number(p.sessions) || 0).toFixed(1)}`)
        .join(" ")
    : "";

  const lastLabel = points[points.length - 1]?.date || "";
  const firstLabel = points[0]?.date || "";

  return `
    <svg class="cb-dashboard-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Sessions per day">
      <rect x="0" y="0" width="${width}" height="${height}" fill="rgba(15,23,42,0.45)" rx="14"></rect>
      <line x1="${padding.left}" y1="${padding.top + innerH}" x2="${padding.left + innerW}" y2="${padding.top + innerH}" stroke="rgba(255,255,255,0.12)" stroke-width="1"></line>
      <polyline points="${sessionsPath}" fill="none" stroke="rgba(95,225,207,0.95)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></polyline>
      ${
        shouldPlotCompare
          ? `<polyline points="${comparePath}" fill="none" stroke="rgba(147, 197, 253, 0.75)" stroke-width="2" stroke-dasharray="6 6" stroke-linecap="round" stroke-linejoin="round"></polyline>`
          : ""
      }
      <text x="${padding.left}" y="${height - 8}" fill="rgba(226,232,240,0.65)" font-size="10">${firstLabel}</text>
      <text x="${padding.left + innerW}" y="${height - 8}" fill="rgba(226,232,240,0.65)" font-size="10" text-anchor="end">${lastLabel}</text>
      <text x="${padding.left}" y="${padding.top + 10}" fill="rgba(226,232,240,0.65)" font-size="10">${cbFormatNumber(maxY)}</text>
    </svg>
  `;
};

const cbRenderGa4Dashboard = () => {
  const root = document.getElementById("cb-ga4-dashboard-root");
  if (!root) return;
  root.innerHTML = "";

  if (!cbIsAuthenticated()) {
    const banner = document.createElement("div");
    banner.className = "cb-dashboard-banner";
    banner.innerHTML = `
      <strong>Sign in required.</strong>
      <div class="cb-dashboard-muted">Connect your account to view GA4 dashboards.</div>
    `;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-primary";
    btn.textContent = "Continue with Google";
    btn.addEventListener("click", () => startGoogleLogin());
    banner.appendChild(btn);
    root.appendChild(banner);
    return;
  }

  if (!cbGa4DashboardState.initialized) {
    const defaults = cbComputePresetRange(cbGa4DashboardState.preset) || cbComputePresetRange("last_7_days");
    if (defaults) {
      cbGa4DashboardState.from = defaults.from;
      cbGa4DashboardState.to = defaults.to;
    }
    cbGa4DashboardState.initialized = true;
  }

  const ga4State = cbConnectorState.ga4 || {};
  const connected = ga4State.status === "connected";
  const hasProperty = !!ga4State.propertyId;
  if (!connected || !hasProperty) {
    const banner = document.createElement("div");
    banner.className = "cb-dashboard-banner";
    banner.innerHTML = connected
      ? `<strong>Select a GA4 property.</strong><div class="cb-dashboard-muted">Open the connector settings to choose a property.</div>`
      : `<strong>GA4 is not connected.</strong><div class="cb-dashboard-muted">Connect GA4 to unlock dashboard reporting.</div>`;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-primary";
    btn.textContent = connected ? "Choose property" : "Connect GA4";
    btn.addEventListener("click", () => cbOpenConnectorDetail("ga4"));
    banner.appendChild(btn);
    root.appendChild(banner);
    return;
  }

  const currentWorkspaceKey = cbNormalizeWorkspaceId(cbCurrentWorkspaceId);
  if (cbGa4DashboardState.blocksWorkspaceId !== currentWorkspaceKey) {
    cbGa4DashboardState.blocksWorkspaceId = currentWorkspaceKey;
    const storedBlocks = cbLoadGa4BlocksFromStorage(currentWorkspaceKey);
    cbSetGa4DashboardSelectedBlocks(storedBlocks || CB_GA4_REPORT_BLOCKS_DEFAULT, { persist: false });
    cbGa4DashboardState.selectedSnapshotId = "";
    cbGa4DashboardState.snapshotLabel = "";
    cbGa4DashboardState.report = null;
    cbGa4DashboardState.error = null;
    cbGa4DashboardState.lastSuccessfulFingerprint = null;
    cbLoadGa4DashboardSnapshots();
  }

  const selection = cbGetGa4DashboardSelection();
  const selectionError = cbValidateGa4DashboardSelection(selection);
  const fingerprint = cbBuildGa4ReportFingerprint(selection);

  const controls = document.createElement("div");
  controls.className = "cb-dashboard-controls";

  const presetField = document.createElement("div");
  presetField.className = "cb-dashboard-field";
  const presetLabel = document.createElement("label");
  presetLabel.textContent = "Time range";
  const presetSelect = document.createElement("select");
  presetSelect.className = "cb-dashboard-input";
  presetSelect.innerHTML = `
    <option value="today">Today</option>
    <option value="yesterday">Yesterday</option>
    <option value="last_7_days">Last 7 days</option>
    <option value="last_30_days">Last 30 days</option>
    <option value="this_month">This month</option>
    <option value="last_month">Last month</option>
    <option value="custom">Custom</option>
  `;
  presetSelect.value = cbGa4DashboardState.preset;
  presetSelect.disabled = cbGa4DashboardState.loading;
  presetSelect.addEventListener("change", () => {
    cbGa4DashboardState.preset = presetSelect.value;
    const next = cbComputePresetRange(cbGa4DashboardState.preset);
    if (next) {
      cbGa4DashboardState.from = next.from;
      cbGa4DashboardState.to = next.to;
    }
    cbRenderGa4Dashboard();
  });
  presetField.appendChild(presetLabel);
  presetField.appendChild(presetSelect);
  controls.appendChild(presetField);

  const fromField = document.createElement("div");
  fromField.className = "cb-dashboard-field";
  const fromLabel = document.createElement("label");
  fromLabel.textContent = "From";
  const fromInput = document.createElement("input");
  fromInput.type = "date";
  fromInput.className = "cb-dashboard-input";
  fromInput.value = cbGa4DashboardState.from || "";
  fromInput.disabled = cbGa4DashboardState.loading || cbGa4DashboardState.preset !== "custom";
  fromInput.addEventListener("change", () => {
    cbGa4DashboardState.from = fromInput.value;
    cbRenderGa4Dashboard();
  });
  fromField.appendChild(fromLabel);
  fromField.appendChild(fromInput);
  controls.appendChild(fromField);

  const toField = document.createElement("div");
  toField.className = "cb-dashboard-field";
  const toLabel = document.createElement("label");
  toLabel.textContent = "To";
  const toInput = document.createElement("input");
  toInput.type = "date";
  toInput.className = "cb-dashboard-input";
  toInput.value = cbGa4DashboardState.to || "";
  toInput.disabled = cbGa4DashboardState.loading || cbGa4DashboardState.preset !== "custom";
  toInput.addEventListener("change", () => {
    cbGa4DashboardState.to = toInput.value;
    cbRenderGa4Dashboard();
  });
  toField.appendChild(toLabel);
  toField.appendChild(toInput);
  controls.appendChild(toField);

  const compareWrap = document.createElement("label");
  compareWrap.className = "cb-dashboard-toggle";
  const compareInput = document.createElement("input");
  compareInput.type = "checkbox";
  compareInput.checked = !!cbGa4DashboardState.compareEnabled;
  compareInput.disabled = cbGa4DashboardState.loading;
  compareInput.addEventListener("change", () => {
    cbGa4DashboardState.compareEnabled = compareInput.checked;
    cbRenderGa4Dashboard();
  });
  const compareText = document.createElement("span");
  compareText.textContent = "Compare";
  compareWrap.appendChild(compareInput);
  compareWrap.appendChild(compareText);
  controls.appendChild(compareWrap);

  if (cbGa4DashboardState.compareEnabled) {
    const modeField = document.createElement("div");
    modeField.className = "cb-dashboard-field";
    const modeLabel = document.createElement("label");
    modeLabel.textContent = "Compare mode";
    const modeSelect = document.createElement("select");
    modeSelect.className = "cb-dashboard-input";
    modeSelect.innerHTML = CB_GA4_COMPARE_MODES.map(
      (opt) => `<option value="${opt.value}">${opt.label}</option>`
    ).join("");
    modeSelect.value = cbNormalizeGa4CompareMode(cbGa4DashboardState.compareMode);
    modeSelect.disabled = cbGa4DashboardState.loading;
    modeSelect.addEventListener("change", () => {
      cbGa4DashboardState.compareMode = modeSelect.value;
      cbRenderGa4Dashboard();
    });
    modeField.appendChild(modeLabel);
    modeField.appendChild(modeSelect);
    controls.appendChild(modeField);

    if (cbNormalizeGa4CompareMode(cbGa4DashboardState.compareMode) === "custom") {
      const compareFromField = document.createElement("div");
      compareFromField.className = "cb-dashboard-field";
      const compareFromLabel = document.createElement("label");
      compareFromLabel.textContent = "Compare from";
      const compareFromInput = document.createElement("input");
      compareFromInput.type = "date";
      compareFromInput.className = "cb-dashboard-input";
      compareFromInput.value = cbGa4DashboardState.compareFrom || "";
      compareFromInput.disabled = cbGa4DashboardState.loading;
      compareFromInput.addEventListener("change", () => {
        cbGa4DashboardState.compareFrom = compareFromInput.value;
        cbRenderGa4Dashboard();
      });
      compareFromField.appendChild(compareFromLabel);
      compareFromField.appendChild(compareFromInput);
      controls.appendChild(compareFromField);

      const compareToField = document.createElement("div");
      compareToField.className = "cb-dashboard-field";
      const compareToLabel = document.createElement("label");
      compareToLabel.textContent = "Compare to";
      const compareToInput = document.createElement("input");
      compareToInput.type = "date";
      compareToInput.className = "cb-dashboard-input";
      compareToInput.value = cbGa4DashboardState.compareTo || "";
      compareToInput.disabled = cbGa4DashboardState.loading;
      compareToInput.addEventListener("change", () => {
        cbGa4DashboardState.compareTo = compareToInput.value;
        cbRenderGa4Dashboard();
      });
      compareToField.appendChild(compareToLabel);
      compareToField.appendChild(compareToInput);
      controls.appendChild(compareToField);
    }
  }

  const runBtn = document.createElement("button");
  runBtn.type = "button";
  runBtn.className = "btn btn-primary";
  runBtn.textContent = cbGa4DashboardState.loading ? "Running..." : "Run report";
  runBtn.disabled = cbGa4DashboardState.loading || !!selectionError;
  runBtn.addEventListener("click", () => cbRunGa4DashboardReport());
  controls.appendChild(runBtn);

  root.appendChild(controls);

  if (selectionError === "invalid_compare_range") {
    const inlineErr = document.createElement("p");
    inlineErr.className = "cb-form-error";
    inlineErr.textContent = "Compare range is invalid. Set Compare from/to.";
    root.appendChild(inlineErr);
  } else if (selectionError === "no_blocks") {
    const inlineErr = document.createElement("p");
    inlineErr.className = "cb-form-error";
    inlineErr.textContent = "Select at least one block to run the report.";
    root.appendChild(inlineErr);
  }

  const blocksPanel = document.createElement("div");
  blocksPanel.className = "cb-dashboard-panel cb-ga4-blocks-panel";
  const blocksTitle = document.createElement("h3");
  blocksTitle.className = "cb-dashboard-panel-title";
  blocksTitle.textContent = "Blocks";
  blocksPanel.appendChild(blocksTitle);
  const blocksGrid = document.createElement("div");
  blocksGrid.className = "cb-ga4-blocks-grid";
  const blocksConfig = [
    { key: "overview", label: "Overview" },
    { key: "series", label: "Series" },
    { key: "pages", label: "Pages" },
    { key: "sources", label: "Sources" },
    { key: "events", label: "Events" },
    { key: "geo", label: "Geo" },
    { key: "device", label: "Device" },
  ];
  const selectedBlocks = cbGetGa4DashboardSelectedBlocks();
  blocksConfig.forEach((block) => {
    const wrap = document.createElement("label");
    wrap.className = "cb-dashboard-toggle cb-ga4-block-toggle";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = selectedBlocks.includes(block.key);
    input.disabled = cbGa4DashboardState.loading;
    input.addEventListener("change", () => {
      const next = new Set(cbGetGa4DashboardSelectedBlocks());
      if (input.checked) {
        next.add(block.key);
      } else {
        next.delete(block.key);
      }
      if (!next.size) {
        input.checked = true;
        return;
      }
      cbSetGa4DashboardSelectedBlocks(Array.from(next), { persist: true });
      cbRenderGa4Dashboard();
    });
    const label = document.createElement("span");
    label.textContent = block.label;
    wrap.appendChild(input);
    wrap.appendChild(label);
    blocksGrid.appendChild(wrap);
  });
  blocksPanel.appendChild(blocksGrid);
  root.appendChild(blocksPanel);

  const snapshotControls = document.createElement("div");
  snapshotControls.className = "cb-dashboard-controls";

  const labelField = document.createElement("div");
  labelField.className = "cb-dashboard-field";
  const labelLbl = document.createElement("label");
  labelLbl.textContent = "Snapshot label (optional)";
  const labelInput = document.createElement("input");
  labelInput.type = "text";
  labelInput.className = "cb-dashboard-input";
  labelInput.value = cbGa4DashboardState.snapshotLabel || "";
  labelInput.placeholder = "e.g. Weekly baseline";
  labelInput.disabled = cbGa4DashboardState.loading || cbGa4DashboardState.snapshotsLoading;
  labelInput.addEventListener("input", () => {
    cbGa4DashboardState.snapshotLabel = labelInput.value;
  });
  labelField.appendChild(labelLbl);
  labelField.appendChild(labelInput);
  snapshotControls.appendChild(labelField);

  const canSaveSnapshot =
    !!cbGa4DashboardState.lastSuccessfulFingerprint &&
    cbGa4DashboardState.lastSuccessfulFingerprint === fingerprint &&
    !!cbGa4DashboardState.report &&
    !cbGa4DashboardState.report?.error;

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "btn btn-secondary";
  saveBtn.textContent = cbGa4DashboardState.snapshotsLoading ? "Saving..." : "Save snapshot";
  saveBtn.disabled = cbGa4DashboardState.loading || cbGa4DashboardState.snapshotsLoading || !canSaveSnapshot;
  saveBtn.addEventListener("click", async () => {
    if (!canSaveSnapshot) {
      cbShowBillingToast("cancel", "Run the report successfully before saving a snapshot.");
      return;
    }
    const snapshotSelection = cbGetGa4DashboardSelection();
    const { ok, json, status } = await cbCreateGa4DashboardSnapshot({
      from: snapshotSelection.from,
      to: snapshotSelection.to,
      blocks: snapshotSelection.blocks,
      compareMode: snapshotSelection.compareMode,
      compareFrom: snapshotSelection.compareFrom,
      compareTo: snapshotSelection.compareTo,
      label: cbGa4DashboardState.snapshotLabel,
    });
	    if (ok && json && json.snapshotId) {
	      cbShowBillingToast("success", "GA4 snapshot saved.");
	      cbGa4DashboardState.snapshotLabel = "";
	      cbGa4DashboardState.selectedSnapshotId = String(json.snapshotId);
	      await cbLoadGa4DashboardSnapshots();
	      cbRenderGa4Dashboard();
	    } else {
	      const errMsg = cbDescribeGa4Error(
	        status,
        json?.error,
        json?.message || json?.error || "Snapshot save failed."
      );
      cbShowBillingToast("cancel", errMsg);
    }
	  });
	  snapshotControls.appendChild(saveBtn);

	  const shareBtn = document.createElement("button");
	  shareBtn.type = "button";
	  shareBtn.className = "btn btn-primary";
	  shareBtn.textContent = "Send snapshot to Council";
	  shareBtn.disabled =
	    cbGa4DashboardState.loading ||
	    cbGa4DashboardState.snapshotsLoading ||
	    !cbGa4DashboardState.selectedSnapshotId;
	  shareBtn.addEventListener("click", () => {
	    const snapshotId = cbGa4DashboardState.selectedSnapshotId;
	    if (!snapshotId) {
	      cbShowBillingToast("cancel", "Select a snapshot first.");
	      return;
	    }
	    cbOpenCouncilShareModalForGa4Snapshot(snapshotId);
	  });
	  snapshotControls.appendChild(shareBtn);

  const snapshotsField = document.createElement("div");
  snapshotsField.className = "cb-dashboard-field";
  const snapsLbl = document.createElement("label");
  snapsLbl.textContent = "Restore snapshot";
  const snapshotsSelect = document.createElement("select");
  snapshotsSelect.className = "cb-dashboard-input";
  snapshotsSelect.disabled = cbGa4DashboardState.snapshotsLoading;
  const defaultOpt = document.createElement("option");
  defaultOpt.value = "";
  defaultOpt.textContent = cbGa4DashboardState.snapshotsLoading ? "Loading..." : "Select a snapshot";
  snapshotsSelect.appendChild(defaultOpt);
  (cbGa4DashboardState.snapshots || []).forEach((snap) => {
    const opt = document.createElement("option");
    opt.value = snap.id;
    const label = snap.label || `${snap.from} → ${snap.to}`;
    opt.textContent = `${label} (${snap.id})`;
    snapshotsSelect.appendChild(opt);
  });
	  snapshotsSelect.value = cbGa4DashboardState.selectedSnapshotId || "";
	  snapshotsSelect.addEventListener("change", () => {
	    cbGa4DashboardState.selectedSnapshotId = snapshotsSelect.value || "";
	    cbRenderGa4Dashboard();
	  });
	  snapshotsField.appendChild(snapsLbl);
	  snapshotsField.appendChild(snapshotsSelect);
	  snapshotControls.appendChild(snapshotsField);

	  const restoreBtn = document.createElement("button");
	  restoreBtn.type = "button";
	  restoreBtn.className = "btn btn-secondary";
	  restoreBtn.textContent = cbGa4DashboardState.snapshotsLoading ? "Restoring..." : "Restore";
	  restoreBtn.disabled =
	    cbGa4DashboardState.loading ||
	    cbGa4DashboardState.snapshotsLoading ||
	    !cbGa4DashboardState.selectedSnapshotId;
	  restoreBtn.addEventListener("click", () => {
	    const nextId = cbGa4DashboardState.selectedSnapshotId;
	    if (!nextId) {
	      cbShowBillingToast("cancel", "Select a snapshot first.");
	      return;
	    }
	    cbRestoreGa4DashboardSnapshot(nextId);
	  });
	  snapshotControls.appendChild(restoreBtn);

	  const quickShareBtn = document.createElement("button");
	  quickShareBtn.type = "button";
	  quickShareBtn.className = "btn btn-secondary";
	  quickShareBtn.textContent = "Send";
	  quickShareBtn.title = "Send selected snapshot to Council";
	  quickShareBtn.disabled =
	    cbGa4DashboardState.loading ||
	    cbGa4DashboardState.snapshotsLoading ||
	    !cbGa4DashboardState.selectedSnapshotId;
	  quickShareBtn.addEventListener("click", () => {
	    const snapshotId = cbGa4DashboardState.selectedSnapshotId;
	    if (!snapshotId) {
	      cbShowBillingToast("cancel", "Select a snapshot first.");
	      return;
	    }
	    cbOpenCouncilShareModalForGa4Snapshot(snapshotId);
	  });
	  snapshotControls.appendChild(quickShareBtn);

	  root.appendChild(snapshotControls);

  if (cbGa4DashboardState.snapshotsError) {
    const err = document.createElement("p");
    err.className = "cb-form-error";
    err.textContent = cbGa4DashboardState.snapshotsError;
    root.appendChild(err);
  }

  if (cbGa4DashboardState.loading) {
    const note = document.createElement("p");
    note.className = "cb-modal-note";
    note.textContent = "Running GA4 report...";
    root.appendChild(note);
    return;
  }

  if (cbGa4DashboardState.error) {
    const err = document.createElement("p");
    err.className = "cb-form-error";
    err.textContent = cbGa4DashboardState.error;
    root.appendChild(err);
  }

  const normalizedReport = cbNormalizeGa4ReportPayload(cbGa4DashboardState.report);
  if (!normalizedReport || normalizedReport.error) {
    const hint = document.createElement("p");
    hint.className = "cb-modal-note";
    hint.textContent = "Run a report to see results.";
    root.appendChild(hint);
    return;
  }

  const activeBlocks = cbGetGa4DashboardSelectedBlocks();
  const reportData = normalizedReport.data || {};

  if (activeBlocks.includes("overview")) {
    const cards = document.createElement("div");
    cards.className = "cb-dashboard-cards";
    const totals = reportData.overview || {};
    const deltas = totals.deltas || null;
    const formatDelta = (pct) => {
      if (pct == null) return "—";
      const n = Number(pct);
      if (!Number.isFinite(n)) return "—";
      const sign = n > 0 ? "+" : "";
      return `${sign}${n}%`;
    };
    const cardItems = [
      { title: "Users", value: cbFormatNumber(totals.users), delta: deltas ? formatDelta(deltas.users) : null },
      {
        title: "Sessions",
        value: cbFormatNumber(totals.sessions),
        delta: deltas ? formatDelta(deltas.sessions) : null,
      },
      {
        title: "Conversions",
        value: totals.conversions == null ? "—" : cbFormatNumber(totals.conversions),
        delta: deltas ? formatDelta(deltas.conversions) : null,
      },
      {
        title: "Revenue",
        value: totals.revenue == null ? "—" : cbFormatMoney(totals.revenue),
        delta: deltas ? formatDelta(deltas.revenue) : null,
      },
    ];
    cardItems.forEach((item) => {
      const card = document.createElement("div");
      card.className = "cb-dashboard-panel";
      const t = document.createElement("p");
      t.className = "cb-dashboard-card-title";
      t.textContent = item.title;
      const v = document.createElement("p");
      v.className = "cb-dashboard-card-value";
      v.textContent = item.value;
      card.appendChild(t);
      card.appendChild(v);
      if (item.delta != null && normalizedReport.compare) {
        const d = document.createElement("p");
        d.className = "cb-dashboard-card-delta";
        d.textContent = item.delta;
        card.appendChild(d);
      }
      cards.appendChild(card);
    });
    root.appendChild(cards);
  }

  const rangePanel = document.createElement("div");
  rangePanel.className = "cb-dashboard-panel";
  const rangeTitle = document.createElement("h3");
  rangeTitle.className = "cb-dashboard-panel-title";
  rangeTitle.textContent = "Range";
  rangePanel.appendChild(rangeTitle);
  const rangeNote = document.createElement("p");
  rangeNote.className = "cb-modal-note";
  rangeNote.textContent = `${normalizedReport.range?.from || "—"} → ${normalizedReport.range?.to || "—"}`;
  rangePanel.appendChild(rangeNote);
  if (normalizedReport.compare) {
    const compNote = document.createElement("p");
    compNote.className = "cb-modal-note";
    const modeLabel =
      normalizedReport.compare.mode === "previous_year"
        ? "Previous year"
        : normalizedReport.compare.mode === "custom"
        ? "Custom"
        : "Previous period";
    compNote.textContent = `Compare (${modeLabel}): ${normalizedReport.compare.from} → ${normalizedReport.compare.to}`;
    rangePanel.appendChild(compNote);
  }

  if (activeBlocks.includes("series")) {
    const grid = document.createElement("div");
    grid.className = "cb-dashboard-grid";

    const chartPanel = document.createElement("div");
    chartPanel.className = "cb-dashboard-panel";
    const chartTitle = document.createElement("h3");
    chartTitle.className = "cb-dashboard-panel-title";
    chartTitle.textContent = "Sessions per day";
    chartPanel.appendChild(chartTitle);
    const chartHtml = document.createElement("div");
    chartHtml.innerHTML = cbBuildGa4LineChartSvg(
      reportData.series?.daily || [],
      reportData.series?.compareDaily || null
    );
    chartPanel.appendChild(chartHtml);
    grid.appendChild(chartPanel);

    grid.appendChild(rangePanel);
    root.appendChild(grid);
  } else {
    root.appendChild(rangePanel);
  }

  const tablesWrap = document.createElement("div");
  tablesWrap.className = "cb-dashboard-tables";

  const renderTable = (title, headers, rows) => {
    const panel = document.createElement("div");
    panel.className = "cb-dashboard-panel";
    const h = document.createElement("h3");
    h.className = "cb-dashboard-panel-title";
    h.textContent = title;
    panel.appendChild(h);
    if (!rows || !rows.length) {
      const empty = document.createElement("p");
      empty.className = "cb-modal-note";
      empty.textContent = "No data.";
      panel.appendChild(empty);
      return panel;
    }
    const table = document.createElement("table");
    table.className = "cb-dashboard-table";
    const thead = document.createElement("thead");
    const trh = document.createElement("tr");
    headers.forEach((hdr) => {
      const th = document.createElement("th");
      th.textContent = hdr;
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    rows.forEach((cols) => {
      const tr = document.createElement("tr");
      cols.forEach((col) => {
        const td = document.createElement("td");
        if (col && col.nodeType) {
          td.appendChild(col);
        } else {
          td.textContent = col == null ? "—" : String(col);
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    panel.appendChild(table);
    return panel;
  };

  let tablesAdded = 0;

  if (activeBlocks.includes("pages")) {
    const pagesRows = (reportData.pages?.rows || []).map((row) => {
      const pageEl = document.createElement("div");
      const title = row.title || "";
      const path = row.page || "";
      if (title) {
        const titleNode = document.createElement("div");
        titleNode.textContent = title;
        const pathNode = document.createElement("div");
        pathNode.className = "cb-dashboard-muted";
        pathNode.textContent = path;
        pageEl.appendChild(titleNode);
        pageEl.appendChild(pathNode);
      } else {
        const pathNode = document.createElement("div");
        pathNode.textContent = path;
        pageEl.appendChild(pathNode);
      }
      return [
        pageEl,
        cbFormatNumber(row.sessions),
        row.conversions == null ? "—" : cbFormatNumber(row.conversions),
      ];
    });
    tablesWrap.appendChild(renderTable("Top pages", ["Page", "Sessions", "Conversions"], pagesRows));
    tablesAdded += 1;
  }

  if (activeBlocks.includes("sources")) {
    const srcRows = (reportData.sources?.rows || []).map((row) => [
      row.sourceMedium || "—",
      cbFormatNumber(row.sessions),
      row.conversions == null ? "—" : cbFormatNumber(row.conversions),
    ]);
    tablesWrap.appendChild(renderTable("Top source / medium", ["Source", "Sessions", "Conversions"], srcRows));
    tablesAdded += 1;
  }

  if (activeBlocks.includes("events")) {
    const eventRows = (reportData.events?.rows || []).map((row) => [
      row.eventName || "—",
      cbFormatNumber(row.count),
    ]);
    tablesWrap.appendChild(renderTable("Top events", ["Event", "Count"], eventRows));
    tablesAdded += 1;
  }

  if (activeBlocks.includes("geo")) {
    const countryRows = (reportData.geo?.countries || []).map((row) => [
      row.country || "—",
      cbFormatNumber(row.sessions),
      row.conversions == null ? "—" : cbFormatNumber(row.conversions),
    ]);
    tablesWrap.appendChild(renderTable("Top countries", ["Country", "Sessions", "Conversions"], countryRows));
    tablesAdded += 1;

    const cityRows = (reportData.geo?.cities || []).map((row) => [
      row.city || "—",
      cbFormatNumber(row.sessions),
      row.conversions == null ? "—" : cbFormatNumber(row.conversions),
    ]);
    tablesWrap.appendChild(renderTable("Top cities", ["City", "Sessions", "Conversions"], cityRows));
    tablesAdded += 1;
  }

  if (activeBlocks.includes("device")) {
    const deviceRows = (reportData.device?.deviceCategory || []).map((row) => [
      row.deviceCategory || "—",
      cbFormatNumber(row.sessions),
      row.conversions == null ? "—" : cbFormatNumber(row.conversions),
    ]);
    tablesWrap.appendChild(renderTable("Device category", ["Device", "Sessions", "Conversions"], deviceRows));
    tablesAdded += 1;

    const osRows = (reportData.device?.os || []).map((row) => [
      row.os || "—",
      cbFormatNumber(row.sessions),
      row.conversions == null ? "—" : cbFormatNumber(row.conversions),
    ]);
    tablesWrap.appendChild(renderTable("Operating system", ["OS", "Sessions", "Conversions"], osRows));
    tablesAdded += 1;
  }

  if (tablesAdded) {
    root.appendChild(tablesWrap);
  }
};

const cbInitGa4Dashboard = () => {
  cbRenderGa4Dashboard();
};

window.cbInitGa4Dashboard = cbInitGa4Dashboard;
window.cbRenderGa4Dashboard = cbRenderGa4Dashboard;

// --- Google Ads Dashboard (v0) ---
const CB_GOOGLEADS_REPORT_BLOCKS_DEFAULT = ["overview", "series", "campaigns", "devices"];
const CB_GOOGLEADS_REPORT_BLOCKS_OPTIONAL = ["networks", "search_terms", "keywords"];
const CB_GOOGLEADS_REPORT_BLOCKS_ALL = [
  ...CB_GOOGLEADS_REPORT_BLOCKS_DEFAULT,
  ...CB_GOOGLEADS_REPORT_BLOCKS_OPTIONAL,
];

const cbNormalizeGoogleAdsReportBlocks = (blocks) => {
  const raw = Array.isArray(blocks) ? blocks : [];
  const normalized = raw
    .map((b) => (b == null ? "" : String(b)).trim().toLowerCase())
    .filter(Boolean)
    .filter((b) => CB_GOOGLEADS_REPORT_BLOCKS_ALL.includes(b));
  const unique = Array.from(new Set(normalized));
  return unique.length ? unique : CB_GOOGLEADS_REPORT_BLOCKS_DEFAULT.slice();
};

const cbGoogleAdsBlocksStorageKey = (workspaceId) => {
  const ws = cbNormalizeWorkspaceId(workspaceId);
  return `coolbits:googleads_blocks:${ws}`;
};

const cbLoadGoogleAdsBlocksFromStorage = (workspaceId) => {
  try {
    const raw = window.localStorage.getItem(cbGoogleAdsBlocksStorageKey(workspaceId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return cbNormalizeGoogleAdsReportBlocks(parsed);
  } catch (_err) {
    return null;
  }
};

const cbPersistGoogleAdsBlocksToStorage = (workspaceId, blocks) => {
  try {
    const normalized = cbNormalizeGoogleAdsReportBlocks(blocks);
    window.localStorage.setItem(cbGoogleAdsBlocksStorageKey(workspaceId), JSON.stringify(normalized));
  } catch (_err) {
    // ignore
  }
};

const CB_GOOGLEADS_COMPARE_MODES = [
  { value: "previous_period", label: "Previous period" },
  { value: "previous_year", label: "Previous year" },
  { value: "custom", label: "Custom" },
];

const cbNormalizeGoogleAdsCompareMode = (mode) => {
  const raw = (mode || "").toString().trim().toLowerCase();
  if (raw === "previous_period") return "previous_period";
  if (raw === "previous_year") return "previous_year";
  if (raw === "custom") return "custom";
  return "previous_period";
};

const cbDescribeGoogleAdsError = (status, errorCode, message) => {
  const code = (errorCode || "").toString().trim();
  if (status === 401) return "Please sign in to view Google Ads reports.";
  if (code === "invalid_grant") return "Google authorization expired. Disconnect and reconnect (invalid_grant).";
  if (code === "insufficient_permissions")
    return "The connected Google account does not have access to this customer (insufficient_permissions).";
  if (code === "customer_not_set")
    return "Select a Google Ads customer in connector settings (customer_not_set).";
  if (code === "rate_limited") return "Google Ads API rate limited. Please retry soon (rate_limited).";
  if (code === "quota_exceeded") return "Google Ads API quota exceeded. Please try again later (quota_exceeded).";
  if (code) return `${message || "Google Ads request failed."} (${code})`;
  return message || "Google Ads request failed.";
};

const cbNormalizeGoogleAdsReportPayload = (payload) => {
  if (!payload || typeof payload !== "object") return payload;
  if (payload.data && payload.blocks && payload.range) return payload;
  return payload;
};

const cbGoogleAdsDashboardState = {
  initialized: false,
  identityKey: null,
  preset: "last_7_days",
  from: null,
  to: null,
  selectedBlocks: new Set(CB_GOOGLEADS_REPORT_BLOCKS_DEFAULT),
  compareEnabled: false,
  compareMode: "previous_period",
  compareFrom: null,
  compareTo: null,
  loading: false,
  error: null,
  errorCode: null,
  report: null,
  lastSuccessfulFingerprint: null,
  snapshotsLoading: false,
  snapshotsError: null,
  snapshots: [],
  selectedSnapshotId: "",
  snapshotLabel: "",
};

const cbGetGoogleAdsDashboardRange = () => {
  if (cbGoogleAdsDashboardState.preset === "custom") {
    return {
      from: cbGoogleAdsDashboardState.from,
      to: cbGoogleAdsDashboardState.to,
    };
  }
  const computed = cbComputePresetRange(cbGoogleAdsDashboardState.preset);
  return computed || { from: cbGoogleAdsDashboardState.from, to: cbGoogleAdsDashboardState.to };
};

const cbGetGoogleAdsDashboardSelectedBlocks = () =>
  cbNormalizeGoogleAdsReportBlocks(Array.from(cbGoogleAdsDashboardState.selectedBlocks || []));

const cbSetGoogleAdsDashboardSelectedBlocks = (blocks, { persist = true } = {}) => {
  const normalized = cbNormalizeGoogleAdsReportBlocks(blocks);
  cbGoogleAdsDashboardState.selectedBlocks = new Set(normalized);
  if (persist) {
    cbPersistGoogleAdsBlocksToStorage(cbCurrentWorkspaceId, normalized);
  }
};

const cbGetGoogleAdsDashboardSelection = () => {
  const range = cbGetGoogleAdsDashboardRange();
  const blocks = cbGetGoogleAdsDashboardSelectedBlocks();
  const compareEnabled = !!cbGoogleAdsDashboardState.compareEnabled;
  if (!compareEnabled) {
    return {
      from: range.from,
      to: range.to,
      blocks,
      compareMode: "none",
      compareFrom: null,
      compareTo: null,
    };
  }
  const compareMode = cbNormalizeGoogleAdsCompareMode(cbGoogleAdsDashboardState.compareMode);
  const compareFrom =
    compareMode === "custom"
      ? (cbGoogleAdsDashboardState.compareFrom || "").toString().trim()
      : null;
  const compareTo =
    compareMode === "custom" ? (cbGoogleAdsDashboardState.compareTo || "").toString().trim() : null;
  return { from: range.from, to: range.to, blocks, compareMode, compareFrom, compareTo };
};

const cbBuildGoogleAdsReportFingerprint = (selection) => {
  const blocks = cbNormalizeGoogleAdsReportBlocks(selection?.blocks);
  const compareMode = (selection?.compareMode || "none").toString().trim().toLowerCase() || "none";
  const base = {
    from: selection?.from || "",
    to: selection?.to || "",
    blocks: blocks.join(","),
    compareMode,
  };
  if (compareMode === "custom") {
    base.compareFrom = selection?.compareFrom || "";
    base.compareTo = selection?.compareTo || "";
  }
  return JSON.stringify(base);
};

const cbValidateGoogleAdsDashboardSelection = (selection) => {
  const fromDate = cbParseLocalYmd(selection?.from);
  const toDate = cbParseLocalYmd(selection?.to);
  if (!fromDate || !toDate || fromDate.getTime() > toDate.getTime()) return "invalid_range";
  const blocks = cbNormalizeGoogleAdsReportBlocks(selection?.blocks);
  if (!blocks.length) return "no_blocks";
  if ((selection?.compareMode || "none") === "custom") {
    const compareFromDate = cbParseLocalYmd(selection?.compareFrom);
    const compareToDate = cbParseLocalYmd(selection?.compareTo);
    if (!compareFromDate || !compareToDate || compareFromDate.getTime() > compareToDate.getTime()) {
      return "invalid_compare_range";
    }
  }
  return null;
};

const cbFetchGoogleAdsDashboardReport = async ({
  from,
  to,
  blocks,
  compareMode,
  compareFrom,
  compareTo,
}) => {
  const base = "/api/connectors/googleads/report";
  const ws = cbNormalizeWorkspaceId(cbCurrentWorkspaceId);
  const params = new URLSearchParams({
    workspaceId: ws,
    from,
    to,
    blocks: Array.isArray(blocks) ? blocks.join(",") : "",
    compareMode: compareMode || "none",
  });
  if ((compareMode || "").toLowerCase() === "custom") {
    if (compareFrom) params.set("compareFrom", compareFrom);
    if (compareTo) params.set("compareTo", compareTo);
  }
  const url = `${base}?${params.toString()}`;
  return cbFetchJson(url);
};

const cbFetchGoogleAdsDashboardSnapshots = async (limit = 20) => {
  const base = "/api/connectors/googleads/snapshots";
  const ws = cbNormalizeWorkspaceId(cbCurrentWorkspaceId);
  const params = new URLSearchParams({ workspaceId: ws, limit: String(limit) });
  const url = `${base}?${params.toString()}`;
  return cbFetchJson(url);
};

const cbFetchGoogleAdsDashboardSnapshotById = async (snapshotId) => {
  const base = `/api/connectors/googleads/snapshots/${encodeURIComponent(snapshotId)}`;
  const ws = cbNormalizeWorkspaceId(cbCurrentWorkspaceId);
  const params = new URLSearchParams({ workspaceId: ws });
  const url = `${base}?${params.toString()}`;
  return cbFetchJson(url);
};

const cbCreateGoogleAdsDashboardSnapshot = async ({
  from,
  to,
  blocks,
  compareMode,
  compareFrom,
  compareTo,
  label,
}) => {
  const ws = cbNormalizeWorkspaceId(cbCurrentWorkspaceId);
  return cbFetchJson(`/api/connectors/googleads/snapshots`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceId: ws,
      from,
      to,
      blocks: Array.isArray(blocks) ? blocks : [],
      compareMode: compareMode || "none",
      compareFrom: compareFrom || "",
      compareTo: compareTo || "",
      label: label || "",
    }),
  });
};

const cbLoadGoogleAdsDashboardSnapshots = async () => {
  cbGoogleAdsDashboardState.snapshotsLoading = true;
  cbGoogleAdsDashboardState.snapshotsError = null;
  cbRenderGoogleAdsDashboard();
  const { ok, json, status } = await cbFetchGoogleAdsDashboardSnapshots(20);
  if (ok && json && Array.isArray(json.snapshots)) {
    cbGoogleAdsDashboardState.snapshots = json.snapshots;
    cbGoogleAdsDashboardState.snapshotsError = null;
  } else {
    cbGoogleAdsDashboardState.snapshots = [];
    cbGoogleAdsDashboardState.snapshotsError = cbDescribeGoogleAdsError(
      status,
      json?.error,
      json?.message || json?.error || "Unable to load Google Ads snapshots."
    );
  }
  cbGoogleAdsDashboardState.snapshotsLoading = false;
  cbRenderGoogleAdsDashboard();
};

const cbRestoreGoogleAdsDashboardSnapshot = async (snapshotId) => {
  const nextId = (snapshotId || "").toString().trim();
  if (!nextId) return;

  cbGoogleAdsDashboardState.snapshotsLoading = true;
  cbGoogleAdsDashboardState.error = null;
  cbGoogleAdsDashboardState.errorCode = null;
  cbRenderGoogleAdsDashboard();
  const { ok, json, status } = await cbFetchGoogleAdsDashboardSnapshotById(nextId);
  const snapshot = json?.snapshot;
  if (ok && snapshot && snapshot.payload) {
    cbGoogleAdsDashboardState.selectedSnapshotId = String(snapshot.id || nextId);
    cbGoogleAdsDashboardState.preset = "custom";
    cbGoogleAdsDashboardState.from = snapshot.from;
    cbGoogleAdsDashboardState.to = snapshot.to;
    const restoredBlocks = cbNormalizeGoogleAdsReportBlocks(snapshot.blocks);
    cbSetGoogleAdsDashboardSelectedBlocks(restoredBlocks, { persist: true });

    const compareModeRaw = (snapshot.compareMode || "").toString().trim();
    const hasCompareRange = !!(snapshot.compareFrom && snapshot.compareTo);
    cbGoogleAdsDashboardState.compareEnabled = !!(compareModeRaw || hasCompareRange);
    cbGoogleAdsDashboardState.compareMode = compareModeRaw
      ? cbNormalizeGoogleAdsCompareMode(compareModeRaw)
      : hasCompareRange
      ? "custom"
      : "previous_period";
    cbGoogleAdsDashboardState.compareFrom = snapshot.compareFrom || null;
    cbGoogleAdsDashboardState.compareTo = snapshot.compareTo || null;

    const payload = cbNormalizeGoogleAdsReportPayload(snapshot.payload);
    cbGoogleAdsDashboardState.report = payload;
    cbGoogleAdsDashboardState.lastSuccessfulFingerprint = cbBuildGoogleAdsReportFingerprint({
      from: snapshot.from,
      to: snapshot.to,
      blocks: restoredBlocks,
      compareMode: cbGoogleAdsDashboardState.compareEnabled
        ? cbNormalizeGoogleAdsCompareMode(cbGoogleAdsDashboardState.compareMode)
        : "none",
      compareFrom: cbGoogleAdsDashboardState.compareMode === "custom" ? cbGoogleAdsDashboardState.compareFrom : null,
      compareTo: cbGoogleAdsDashboardState.compareMode === "custom" ? cbGoogleAdsDashboardState.compareTo : null,
    });
    cbGoogleAdsDashboardState.error = null;
    cbGoogleAdsDashboardState.errorCode = null;
  } else {
    cbGoogleAdsDashboardState.report = null;
    cbGoogleAdsDashboardState.errorCode = json?.error || "snapshot_get_failed";
    cbGoogleAdsDashboardState.error = cbDescribeGoogleAdsError(
      status,
      cbGoogleAdsDashboardState.errorCode,
      json?.message || "Could not load snapshot."
    );
  }
  cbGoogleAdsDashboardState.snapshotsLoading = false;
  cbRenderGoogleAdsDashboard();
};

const cbRunGoogleAdsDashboardReport = async () => {
  const adsState = cbConnectorState.googleads || {};
  if (adsState.status !== "connected") {
    cbGoogleAdsDashboardState.error = "Connect Google Ads first (not_connected).";
    cbGoogleAdsDashboardState.errorCode = "not_connected";
    cbRenderGoogleAdsDashboard();
    return;
  }
  if (!adsState.customerId) {
    cbGoogleAdsDashboardState.error = "Select a Google Ads customer first (customer_not_set).";
    cbGoogleAdsDashboardState.errorCode = "customer_not_set";
    cbRenderGoogleAdsDashboard();
    return;
  }
  const selection = cbGetGoogleAdsDashboardSelection();
  const selectionError = cbValidateGoogleAdsDashboardSelection(selection);
  if (selectionError) {
    cbGoogleAdsDashboardState.error =
      selectionError === "invalid_compare_range"
        ? "Select a valid compare range (invalid_compare_range)."
        : selectionError === "no_blocks"
        ? "Select at least one report block (no_blocks)."
        : "Select a valid date range (invalid_range).";
    cbGoogleAdsDashboardState.errorCode = selectionError;
    cbRenderGoogleAdsDashboard();
    return;
  }

  const fingerprint = cbBuildGoogleAdsReportFingerprint(selection);
  cbGoogleAdsDashboardState.loading = true;
  cbGoogleAdsDashboardState.error = null;
  cbGoogleAdsDashboardState.errorCode = null;
  cbRenderGoogleAdsDashboard();
  const { ok, json, status } = await cbFetchGoogleAdsDashboardReport({
    from: selection.from,
    to: selection.to,
    blocks: selection.blocks,
    compareMode: selection.compareMode,
    compareFrom: selection.compareFrom,
    compareTo: selection.compareTo,
  });
  if (ok && json && !json.error) {
    cbGoogleAdsDashboardState.report = cbNormalizeGoogleAdsReportPayload(json);
    cbGoogleAdsDashboardState.error = null;
    cbGoogleAdsDashboardState.errorCode = null;
    cbGoogleAdsDashboardState.lastSuccessfulFingerprint = fingerprint;
  } else {
    cbGoogleAdsDashboardState.errorCode = json?.error || "googleads_report_failed";
    cbGoogleAdsDashboardState.error = cbDescribeGoogleAdsError(
      status,
      cbGoogleAdsDashboardState.errorCode,
      json?.message || json?.error || "Google Ads report failed."
    );
    cbGoogleAdsDashboardState.report = null;
  }
  cbGoogleAdsDashboardState.loading = false;
  cbRenderGoogleAdsDashboard();
};

const cbFormatPercent = (ratio, { digits = 1 } = {}) => {
  const n = typeof ratio === "number" ? ratio : Number(ratio);
  if (!Number.isFinite(n)) return "—";
  const pct = n * 100;
  const formatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: digits });
  return `${formatter.format(pct)}%`;
};

const cbFormatRatio = (ratio) => {
  const n = typeof ratio === "number" ? ratio : Number(ratio);
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n * 100) / 100}x`;
};

const cbBuildGoogleAdsLineChartSvg = (daily = [], compareDaily = null) => {
  const points = Array.isArray(daily) ? daily : [];
  if (points.length < 2) {
    return '<p class="cb-modal-note">Not enough data to plot a chart.</p>';
  }
  const comparePoints = Array.isArray(compareDaily) ? compareDaily : null;
  const width = 720;
  const height = 220;
  const padding = { left: 34, right: 10, top: 12, bottom: 24 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const values = points
    .map((p) => (typeof p.cost === "number" ? p.cost : Number(p.cost) || 0))
    .concat(
      comparePoints ? comparePoints.map((p) => (typeof p.cost === "number" ? p.cost : Number(p.cost) || 0)) : []
    );
  const maxY = Math.max(1, ...values);
  const stepX = points.length > 1 ? innerW / (points.length - 1) : innerW;
  const toX = (idx) => padding.left + idx * stepX;
  const toY = (val) => padding.top + innerH - (val / maxY) * innerH;
  const costPath = points
    .map((p, idx) => `${toX(idx).toFixed(1)},${toY(Number(p.cost) || 0).toFixed(1)}`)
    .join(" ");
  const shouldPlotCompare =
    Array.isArray(comparePoints) && comparePoints.length === points.length && comparePoints.length >= 2;
  const comparePath = shouldPlotCompare
    ? comparePoints.map((p, idx) => `${toX(idx).toFixed(1)},${toY(Number(p.cost) || 0).toFixed(1)}`).join(" ")
    : "";

  const lastLabel = points[points.length - 1]?.date || "";
  const firstLabel = points[0]?.date || "";

  return `
    <svg class="cb-dashboard-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Cost per day">
      <rect x="0" y="0" width="${width}" height="${height}" fill="rgba(15,23,42,0.45)" rx="14"></rect>
      <line x1="${padding.left}" y1="${padding.top + innerH}" x2="${padding.left + innerW}" y2="${padding.top + innerH}" stroke="rgba(255,255,255,0.12)" stroke-width="1"></line>
      <polyline points="${costPath}" fill="none" stroke="rgba(95,225,207,0.95)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></polyline>
      ${
        shouldPlotCompare
          ? `<polyline points="${comparePath}" fill="none" stroke="rgba(147, 197, 253, 0.75)" stroke-width="2" stroke-dasharray="6 6" stroke-linecap="round" stroke-linejoin="round"></polyline>`
          : ""
      }
      <text x="${padding.left}" y="${height - 8}" fill="rgba(226,232,240,0.65)" font-size="10">${firstLabel}</text>
      <text x="${padding.left + innerW}" y="${height - 8}" fill="rgba(226,232,240,0.65)" font-size="10" text-anchor="end">${lastLabel}</text>
      <text x="${padding.left}" y="${padding.top + 10}" fill="rgba(226,232,240,0.65)" font-size="10">${cbFormatMoney(maxY)}</text>
    </svg>
  `;
};

const cbRenderGoogleAdsDashboard = () => {
  const root = document.getElementById("cb-googleads-dashboard-root");
  if (!root) return;
  root.innerHTML = "";

  if (!cbIsAuthenticated()) {
    const banner = document.createElement("div");
    banner.className = "cb-dashboard-banner";
    banner.innerHTML = `
      <strong>Sign in required.</strong>
      <div class="cb-dashboard-muted">Connect your account to view Google Ads dashboards.</div>
    `;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-primary";
    btn.textContent = "Continue with Google";
    btn.addEventListener("click", () => startGoogleLogin());
    banner.appendChild(btn);
    root.appendChild(banner);
    return;
  }

  if (!cbGoogleAdsDashboardState.initialized) {
    const defaults = cbComputePresetRange(cbGoogleAdsDashboardState.preset) || cbComputePresetRange("last_7_days");
    if (defaults) {
      cbGoogleAdsDashboardState.from = defaults.from;
      cbGoogleAdsDashboardState.to = defaults.to;
    }
    cbGoogleAdsDashboardState.initialized = true;
  }

  const adsState = cbConnectorState.googleads || {};
  const connected = adsState.status === "connected";
  const hasCustomer = !!adsState.customerId;
  if (!connected || !hasCustomer) {
    const banner = document.createElement("div");
    banner.className = "cb-dashboard-banner";
    banner.innerHTML = !connected
      ? `<strong>Google Ads is not connected.</strong><div class="cb-dashboard-muted">Connect Google Ads to unlock dashboard reporting.</div>`
      : `<strong>Select a Google Ads customer.</strong><div class="cb-dashboard-muted">Open the connector settings to choose a client customer.</div>`;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-primary";
    btn.textContent = !connected ? "Connect Google Ads" : "Choose customer";
    btn.addEventListener("click", () => cbOpenConnectorDetail("googleads"));
    banner.appendChild(btn);
    root.appendChild(banner);
  }

  const workspaceKey = cbNormalizeWorkspaceId(cbCurrentWorkspaceId);
  const customerKey = (adsState.customerId || "").toString().trim() || "none";
  const identityKey = `${workspaceKey}:${customerKey}`;
  if (cbGoogleAdsDashboardState.identityKey !== identityKey) {
    cbGoogleAdsDashboardState.identityKey = identityKey;
    const storedBlocks = cbLoadGoogleAdsBlocksFromStorage(workspaceKey);
    cbSetGoogleAdsDashboardSelectedBlocks(storedBlocks || CB_GOOGLEADS_REPORT_BLOCKS_DEFAULT, { persist: false });
    cbGoogleAdsDashboardState.selectedSnapshotId = "";
    cbGoogleAdsDashboardState.snapshotLabel = "";
    cbGoogleAdsDashboardState.report = null;
    cbGoogleAdsDashboardState.error = null;
    cbGoogleAdsDashboardState.errorCode = null;
    cbGoogleAdsDashboardState.lastSuccessfulFingerprint = null;
    cbGoogleAdsDashboardState.snapshots = [];
    cbGoogleAdsDashboardState.snapshotsError = null;
    if (connected && hasCustomer) {
      cbLoadGoogleAdsDashboardSnapshots();
    }
  }

  const selection = cbGetGoogleAdsDashboardSelection();
  const selectionError = cbValidateGoogleAdsDashboardSelection(selection);
  const fingerprint = cbBuildGoogleAdsReportFingerprint(selection);

  const controls = document.createElement("div");
  controls.className = "cb-dashboard-controls";

  const presetField = document.createElement("div");
  presetField.className = "cb-dashboard-field";
  const presetLabel = document.createElement("label");
  presetLabel.textContent = "Time range";
  const presetSelect = document.createElement("select");
  presetSelect.className = "cb-dashboard-input";
  presetSelect.innerHTML = `
    <option value="today">Today</option>
    <option value="yesterday">Yesterday</option>
    <option value="last_7_days">Last 7 days</option>
    <option value="last_30_days">Last 30 days</option>
    <option value="this_month">This month</option>
    <option value="last_month">Last month</option>
    <option value="custom">Custom</option>
  `;
  presetSelect.value = cbGoogleAdsDashboardState.preset;
  presetSelect.disabled = cbGoogleAdsDashboardState.loading;
  presetSelect.addEventListener("change", () => {
    cbGoogleAdsDashboardState.preset = presetSelect.value;
    const next = cbComputePresetRange(cbGoogleAdsDashboardState.preset);
    if (next) {
      cbGoogleAdsDashboardState.from = next.from;
      cbGoogleAdsDashboardState.to = next.to;
    }
    cbRenderGoogleAdsDashboard();
  });
  presetField.appendChild(presetLabel);
  presetField.appendChild(presetSelect);
  controls.appendChild(presetField);

  const fromField = document.createElement("div");
  fromField.className = "cb-dashboard-field";
  const fromLabel = document.createElement("label");
  fromLabel.textContent = "From";
  const fromInput = document.createElement("input");
  fromInput.type = "date";
  fromInput.className = "cb-dashboard-input";
  fromInput.value = cbGoogleAdsDashboardState.from || "";
  fromInput.disabled = cbGoogleAdsDashboardState.loading || cbGoogleAdsDashboardState.preset !== "custom";
  fromInput.addEventListener("change", () => {
    cbGoogleAdsDashboardState.from = fromInput.value;
    cbRenderGoogleAdsDashboard();
  });
  fromField.appendChild(fromLabel);
  fromField.appendChild(fromInput);
  controls.appendChild(fromField);

  const toField = document.createElement("div");
  toField.className = "cb-dashboard-field";
  const toLabel = document.createElement("label");
  toLabel.textContent = "To";
  const toInput = document.createElement("input");
  toInput.type = "date";
  toInput.className = "cb-dashboard-input";
  toInput.value = cbGoogleAdsDashboardState.to || "";
  toInput.disabled = cbGoogleAdsDashboardState.loading || cbGoogleAdsDashboardState.preset !== "custom";
  toInput.addEventListener("change", () => {
    cbGoogleAdsDashboardState.to = toInput.value;
    cbRenderGoogleAdsDashboard();
  });
  toField.appendChild(toLabel);
  toField.appendChild(toInput);
  controls.appendChild(toField);

  const compareWrap = document.createElement("label");
  compareWrap.className = "cb-dashboard-toggle";
  const compareInput = document.createElement("input");
  compareInput.type = "checkbox";
  compareInput.checked = !!cbGoogleAdsDashboardState.compareEnabled;
  compareInput.disabled = cbGoogleAdsDashboardState.loading;
  compareInput.addEventListener("change", () => {
    cbGoogleAdsDashboardState.compareEnabled = compareInput.checked;
    cbRenderGoogleAdsDashboard();
  });
  const compareText = document.createElement("span");
  compareText.textContent = "Compare";
  compareWrap.appendChild(compareInput);
  compareWrap.appendChild(compareText);
  controls.appendChild(compareWrap);

  if (cbGoogleAdsDashboardState.compareEnabled) {
    const modeField = document.createElement("div");
    modeField.className = "cb-dashboard-field";
    const modeLabel = document.createElement("label");
    modeLabel.textContent = "Compare mode";
    const modeSelect = document.createElement("select");
    modeSelect.className = "cb-dashboard-input";
    modeSelect.innerHTML = CB_GOOGLEADS_COMPARE_MODES.map(
      (opt) => `<option value="${opt.value}">${opt.label}</option>`
    ).join("");
    modeSelect.value = cbNormalizeGoogleAdsCompareMode(cbGoogleAdsDashboardState.compareMode);
    modeSelect.disabled = cbGoogleAdsDashboardState.loading;
    modeSelect.addEventListener("change", () => {
      cbGoogleAdsDashboardState.compareMode = modeSelect.value;
      cbRenderGoogleAdsDashboard();
    });
    modeField.appendChild(modeLabel);
    modeField.appendChild(modeSelect);
    controls.appendChild(modeField);

    if (cbNormalizeGoogleAdsCompareMode(cbGoogleAdsDashboardState.compareMode) === "custom") {
      const compareFromField = document.createElement("div");
      compareFromField.className = "cb-dashboard-field";
      const compareFromLabel = document.createElement("label");
      compareFromLabel.textContent = "Compare from";
      const compareFromInput = document.createElement("input");
      compareFromInput.type = "date";
      compareFromInput.className = "cb-dashboard-input";
      compareFromInput.value = cbGoogleAdsDashboardState.compareFrom || "";
      compareFromInput.disabled = cbGoogleAdsDashboardState.loading;
      compareFromInput.addEventListener("change", () => {
        cbGoogleAdsDashboardState.compareFrom = compareFromInput.value;
        cbRenderGoogleAdsDashboard();
      });
      compareFromField.appendChild(compareFromLabel);
      compareFromField.appendChild(compareFromInput);
      controls.appendChild(compareFromField);

      const compareToField = document.createElement("div");
      compareToField.className = "cb-dashboard-field";
      const compareToLabel = document.createElement("label");
      compareToLabel.textContent = "Compare to";
      const compareToInput = document.createElement("input");
      compareToInput.type = "date";
      compareToInput.className = "cb-dashboard-input";
      compareToInput.value = cbGoogleAdsDashboardState.compareTo || "";
      compareToInput.disabled = cbGoogleAdsDashboardState.loading;
      compareToInput.addEventListener("change", () => {
        cbGoogleAdsDashboardState.compareTo = compareToInput.value;
        cbRenderGoogleAdsDashboard();
      });
      compareToField.appendChild(compareToLabel);
      compareToField.appendChild(compareToInput);
      controls.appendChild(compareToField);
    }
  }

  const runBtn = document.createElement("button");
  runBtn.type = "button";
  runBtn.className = "btn btn-primary";
  runBtn.textContent = cbGoogleAdsDashboardState.loading ? "Running..." : "Run report";
  runBtn.disabled = cbGoogleAdsDashboardState.loading || !!selectionError || !connected || !hasCustomer;
  runBtn.addEventListener("click", () => cbRunGoogleAdsDashboardReport());
  controls.appendChild(runBtn);

  root.appendChild(controls);

  if (selectionError === "invalid_compare_range") {
    const inlineErr = document.createElement("p");
    inlineErr.className = "cb-form-error";
    inlineErr.textContent = "Compare range is invalid. Set Compare from/to.";
    root.appendChild(inlineErr);
  } else if (selectionError === "no_blocks") {
    const inlineErr = document.createElement("p");
    inlineErr.className = "cb-form-error";
    inlineErr.textContent = "Select at least one block to run the report.";
    root.appendChild(inlineErr);
  }

  const blocksPanel = document.createElement("div");
  blocksPanel.className = "cb-dashboard-panel cb-ga4-blocks-panel";
  const blocksTitle = document.createElement("h3");
  blocksTitle.className = "cb-dashboard-panel-title";
  blocksTitle.textContent = "Blocks";
  blocksPanel.appendChild(blocksTitle);
  const blocksGrid = document.createElement("div");
  blocksGrid.className = "cb-ga4-blocks-grid";
  const blocksConfig = [
    { key: "overview", label: "Overview" },
    { key: "series", label: "Series" },
    { key: "campaigns", label: "Campaigns" },
    { key: "devices", label: "Devices" },
    { key: "networks", label: "Networks" },
    { key: "search_terms", label: "Search terms" },
    { key: "keywords", label: "Keywords" },
  ];
  const selectedBlocks = cbGetGoogleAdsDashboardSelectedBlocks();
  blocksConfig.forEach((block) => {
    const wrap = document.createElement("label");
    wrap.className = "cb-dashboard-toggle cb-ga4-block-toggle";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = selectedBlocks.includes(block.key);
    input.disabled = cbGoogleAdsDashboardState.loading;
    input.addEventListener("change", () => {
      const next = new Set(cbGetGoogleAdsDashboardSelectedBlocks());
      if (input.checked) {
        next.add(block.key);
      } else {
        next.delete(block.key);
      }
      if (!next.size) {
        input.checked = true;
        return;
      }
      cbSetGoogleAdsDashboardSelectedBlocks(Array.from(next), { persist: true });
      cbRenderGoogleAdsDashboard();
    });
    const label = document.createElement("span");
    label.textContent = block.label;
    wrap.appendChild(input);
    wrap.appendChild(label);
    blocksGrid.appendChild(wrap);
  });
  blocksPanel.appendChild(blocksGrid);
  root.appendChild(blocksPanel);

  const snapshotControls = document.createElement("div");
  snapshotControls.className = "cb-dashboard-controls";

  const labelField = document.createElement("div");
  labelField.className = "cb-dashboard-field";
  const labelLbl = document.createElement("label");
  labelLbl.textContent = "Snapshot label (optional)";
  const labelInput = document.createElement("input");
  labelInput.type = "text";
  labelInput.className = "cb-dashboard-input";
  labelInput.value = cbGoogleAdsDashboardState.snapshotLabel || "";
  labelInput.placeholder = "e.g. Weekly baseline";
  labelInput.disabled = cbGoogleAdsDashboardState.loading || cbGoogleAdsDashboardState.snapshotsLoading;
  labelInput.addEventListener("input", () => {
    cbGoogleAdsDashboardState.snapshotLabel = labelInput.value;
  });
  labelField.appendChild(labelLbl);
  labelField.appendChild(labelInput);
  snapshotControls.appendChild(labelField);

  const canSaveSnapshot =
    !!cbGoogleAdsDashboardState.lastSuccessfulFingerprint &&
    cbGoogleAdsDashboardState.lastSuccessfulFingerprint === fingerprint &&
    !!cbGoogleAdsDashboardState.report &&
    !cbGoogleAdsDashboardState.report?.error;

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "btn btn-secondary";
  saveBtn.textContent = cbGoogleAdsDashboardState.snapshotsLoading ? "Saving..." : "Save snapshot";
  saveBtn.disabled =
    cbGoogleAdsDashboardState.loading ||
    cbGoogleAdsDashboardState.snapshotsLoading ||
    !connected ||
    !hasCustomer ||
    !canSaveSnapshot;
  saveBtn.addEventListener("click", async () => {
    if (!canSaveSnapshot) {
      cbShowBillingToast("cancel", "Run the report successfully before saving a snapshot.");
      return;
    }
    const snapshotSelection = cbGetGoogleAdsDashboardSelection();
    const { ok, json, status } = await cbCreateGoogleAdsDashboardSnapshot({
      from: snapshotSelection.from,
      to: snapshotSelection.to,
      blocks: snapshotSelection.blocks,
      compareMode: snapshotSelection.compareMode,
      compareFrom: snapshotSelection.compareFrom,
      compareTo: snapshotSelection.compareTo,
      label: cbGoogleAdsDashboardState.snapshotLabel,
    });
    if (ok && json && json.snapshotId) {
      cbShowBillingToast("success", "Google Ads snapshot saved.");
      cbGoogleAdsDashboardState.snapshotLabel = "";
      cbGoogleAdsDashboardState.selectedSnapshotId = String(json.snapshotId);
      await cbLoadGoogleAdsDashboardSnapshots();
      cbRenderGoogleAdsDashboard();
    } else {
      const errMsg = cbDescribeGoogleAdsError(
        status,
        json?.error,
        json?.message || json?.error || "Snapshot save failed."
      );
      cbShowBillingToast("cancel", errMsg);
    }
  });
  snapshotControls.appendChild(saveBtn);

  const snapshotsField = document.createElement("div");
  snapshotsField.className = "cb-dashboard-field";
  const snapsLbl = document.createElement("label");
  snapsLbl.textContent = "Restore snapshot";
  const snapshotsSelect = document.createElement("select");
  snapshotsSelect.className = "cb-dashboard-input";
  snapshotsSelect.disabled = cbGoogleAdsDashboardState.snapshotsLoading || !connected || !hasCustomer;
  const defaultOpt = document.createElement("option");
  defaultOpt.value = "";
  defaultOpt.textContent = cbGoogleAdsDashboardState.snapshotsLoading ? "Loading..." : "Select a snapshot";
  snapshotsSelect.appendChild(defaultOpt);
  (cbGoogleAdsDashboardState.snapshots || []).forEach((snap) => {
    const opt = document.createElement("option");
    opt.value = snap.id;
    const label = snap.label || `${snap.from} → ${snap.to}`;
    opt.textContent = `${label} (${snap.id})`;
    snapshotsSelect.appendChild(opt);
  });
  snapshotsSelect.value = cbGoogleAdsDashboardState.selectedSnapshotId || "";
  snapshotsSelect.addEventListener("change", () => {
    cbGoogleAdsDashboardState.selectedSnapshotId = snapshotsSelect.value || "";
    cbRenderGoogleAdsDashboard();
  });
  snapshotsField.appendChild(snapsLbl);
  snapshotsField.appendChild(snapshotsSelect);
  snapshotControls.appendChild(snapshotsField);

  const restoreBtn = document.createElement("button");
  restoreBtn.type = "button";
  restoreBtn.className = "btn btn-secondary";
  restoreBtn.textContent = cbGoogleAdsDashboardState.snapshotsLoading ? "Restoring..." : "Restore";
  restoreBtn.disabled =
    cbGoogleAdsDashboardState.loading ||
    cbGoogleAdsDashboardState.snapshotsLoading ||
    !connected ||
    !hasCustomer ||
    !cbGoogleAdsDashboardState.selectedSnapshotId;
  restoreBtn.addEventListener("click", () => {
    const nextId = cbGoogleAdsDashboardState.selectedSnapshotId;
    if (!nextId) {
      cbShowBillingToast("cancel", "Select a snapshot first.");
      return;
    }
    cbRestoreGoogleAdsDashboardSnapshot(nextId);
  });
  snapshotControls.appendChild(restoreBtn);

  root.appendChild(snapshotControls);

  if (cbGoogleAdsDashboardState.snapshotsError) {
    const err = document.createElement("p");
    err.className = "cb-form-error";
    err.textContent = cbGoogleAdsDashboardState.snapshotsError;
    root.appendChild(err);
  }

  if (cbGoogleAdsDashboardState.loading) {
    const note = document.createElement("p");
    note.className = "cb-modal-note";
    note.textContent = "Running Google Ads report...";
    root.appendChild(note);
    return;
  }

  if (cbGoogleAdsDashboardState.errorCode === "DEVELOPER_TOKEN_NOT_APPROVED") {
    const errBanner = document.createElement("div");
    errBanner.className = "cb-dashboard-banner";
    errBanner.innerHTML = `
      <strong>Developer token not approved / not enabled for this feature. Reporting is currently blocked.</strong>
      <div class="cb-dashboard-muted">Error: DEVELOPER_TOKEN_NOT_APPROVED</div>
    `;
    root.appendChild(errBanner);
    return;
  }

  if (cbGoogleAdsDashboardState.error) {
    const err = document.createElement("p");
    err.className = "cb-form-error";
    err.textContent = cbGoogleAdsDashboardState.error;
    root.appendChild(err);
  }

  const normalizedReport = cbNormalizeGoogleAdsReportPayload(cbGoogleAdsDashboardState.report);
  if (!normalizedReport || normalizedReport.error) {
    const hint = document.createElement("p");
    hint.className = "cb-modal-note";
    hint.textContent = "Run a report to see results.";
    root.appendChild(hint);
    return;
  }

  const activeBlocks = cbGetGoogleAdsDashboardSelectedBlocks();
  const reportData = normalizedReport.data || {};

  if (activeBlocks.includes("overview")) {
    const cards = document.createElement("div");
    cards.className = "cb-dashboard-cards";
    const totals = reportData.overview || {};
    const deltas = totals.deltas || null;
    const formatDelta = (delta) => {
      const pct = delta?.pct;
      if (pct == null) return "—";
      const n = Number(pct);
      if (!Number.isFinite(n)) return "—";
      const sign = n > 0 ? "+" : "";
      return `${sign}${n}%`;
    };

    const cardItems = [
      { title: "Cost", value: cbFormatMoney(totals.cost), delta: deltas ? formatDelta(deltas.cost) : null },
      { title: "Clicks", value: cbFormatNumber(totals.clicks), delta: deltas ? formatDelta(deltas.clicks) : null },
      {
        title: "Impressions",
        value: cbFormatNumber(totals.impressions),
        delta: deltas ? formatDelta(deltas.impressions) : null,
      },
      { title: "CTR", value: cbFormatPercent(totals.ctr), delta: deltas ? formatDelta(deltas.ctr) : null },
      { title: "Avg CPC", value: cbFormatMoney(totals.avgCpc), delta: deltas ? formatDelta(deltas.avgCpc) : null },
      {
        title: "Conversions",
        value: totals.conversions == null ? "—" : cbFormatMoney(totals.conversions),
        delta: deltas ? formatDelta(deltas.conversions) : null,
      },
      {
        title: "Conv Value",
        value: totals.convValue == null ? "—" : cbFormatMoney(totals.convValue),
        delta: deltas ? formatDelta(deltas.convValue) : null,
      },
      { title: "ROAS", value: cbFormatRatio(totals.roas), delta: deltas ? formatDelta(deltas.roas) : null },
      { title: "CPA", value: cbFormatMoney(totals.cpa), delta: deltas ? formatDelta(deltas.cpa) : null },
    ];

    cardItems.forEach((item) => {
      const card = document.createElement("div");
      card.className = "cb-dashboard-panel";
      const t = document.createElement("p");
      t.className = "cb-dashboard-card-title";
      t.textContent = item.title;
      const v = document.createElement("p");
      v.className = "cb-dashboard-card-value";
      v.textContent = item.value;
      card.appendChild(t);
      card.appendChild(v);
      if (item.delta != null && normalizedReport.compare) {
        const d = document.createElement("p");
        d.className = "cb-dashboard-card-delta";
        d.textContent = item.delta;
        card.appendChild(d);
      }
      cards.appendChild(card);
    });
    root.appendChild(cards);
  }

  const rangePanel = document.createElement("div");
  rangePanel.className = "cb-dashboard-panel";
  const rangeTitle = document.createElement("h3");
  rangeTitle.className = "cb-dashboard-panel-title";
  rangeTitle.textContent = "Range";
  rangePanel.appendChild(rangeTitle);
  const rangeNote = document.createElement("p");
  rangeNote.className = "cb-modal-note";
  rangeNote.textContent = `${normalizedReport.range?.from || "—"} → ${normalizedReport.range?.to || "—"}`;
  rangePanel.appendChild(rangeNote);
  if (normalizedReport.compare) {
    const compNote = document.createElement("p");
    compNote.className = "cb-modal-note";
    const modeLabel =
      normalizedReport.compare.mode === "previous_year"
        ? "Previous year"
        : normalizedReport.compare.mode === "custom"
        ? "Custom"
        : "Previous period";
    compNote.textContent = `Compare (${modeLabel}): ${normalizedReport.compare.from} → ${normalizedReport.compare.to}`;
    rangePanel.appendChild(compNote);
  }

  if (activeBlocks.includes("series")) {
    const grid = document.createElement("div");
    grid.className = "cb-dashboard-grid";

    const chartPanel = document.createElement("div");
    chartPanel.className = "cb-dashboard-panel";
    const chartTitle = document.createElement("h3");
    chartTitle.className = "cb-dashboard-panel-title";
    chartTitle.textContent = "Cost per day";
    chartPanel.appendChild(chartTitle);
    const chartHtml = document.createElement("div");
    chartHtml.innerHTML = cbBuildGoogleAdsLineChartSvg(
      reportData.series?.daily || [],
      reportData.series?.compareDaily || null
    );
    chartPanel.appendChild(chartHtml);
    grid.appendChild(chartPanel);

    grid.appendChild(rangePanel);
    root.appendChild(grid);
  } else {
    root.appendChild(rangePanel);
  }

  const tablesWrap = document.createElement("div");
  tablesWrap.className = "cb-dashboard-tables";

  const renderTable = (title, headers, rows, { note = null } = {}) => {
    const panel = document.createElement("div");
    panel.className = "cb-dashboard-panel";
    const h = document.createElement("h3");
    h.className = "cb-dashboard-panel-title";
    h.textContent = title;
    panel.appendChild(h);
    if (note) {
      const noteEl = document.createElement("p");
      noteEl.className = "cb-modal-note";
      noteEl.textContent = note;
      panel.appendChild(noteEl);
    }
    if (!rows || !rows.length) {
      const empty = document.createElement("p");
      empty.className = "cb-modal-note";
      empty.textContent = "No data.";
      panel.appendChild(empty);
      return panel;
    }
    const table = document.createElement("table");
    table.className = "cb-dashboard-table";
    const thead = document.createElement("thead");
    const trh = document.createElement("tr");
    headers.forEach((hdr) => {
      const th = document.createElement("th");
      th.textContent = hdr;
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    rows.forEach((cols) => {
      const tr = document.createElement("tr");
      cols.forEach((col) => {
        const td = document.createElement("td");
        if (col && col.nodeType) {
          td.appendChild(col);
        } else {
          td.textContent = col == null ? "—" : String(col);
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    panel.appendChild(table);
    return panel;
  };

  let tablesAdded = 0;

  if (activeBlocks.includes("campaigns")) {
    const rows = (reportData.campaigns?.rows || []).map((row) => {
      const nameEl = document.createElement("div");
      const titleNode = document.createElement("div");
      titleNode.textContent = row.name || "—";
      nameEl.appendChild(titleNode);
      const metaParts = [];
      if (row.channel) metaParts.push(row.channel);
      if (row.status) metaParts.push(row.status);
      if (metaParts.length) {
        const metaNode = document.createElement("div");
        metaNode.className = "cb-dashboard-muted";
        metaNode.textContent = metaParts.join(" · ");
        nameEl.appendChild(metaNode);
      }
      return [nameEl, cbFormatMoney(row.cost), cbFormatMoney(row.conversions), cbFormatRatio(row.roas)];
    });
    tablesWrap.appendChild(renderTable("Top campaigns", ["Campaign", "Cost", "Conversions", "ROAS"], rows));
    tablesAdded += 1;
  }

  if (activeBlocks.includes("devices")) {
    const rows = (reportData.devices?.rows || []).map((row) => [
      row.device || "—",
      cbFormatMoney(row.cost),
      cbFormatMoney(row.conversions),
      cbFormatRatio(row.roas),
    ]);
    tablesWrap.appendChild(renderTable("Devices", ["Device", "Cost", "Conversions", "ROAS"], rows));
    tablesAdded += 1;
  }

  if (activeBlocks.includes("networks")) {
    const rows = (reportData.networks?.rows || []).map((row) => [
      row.network || "—",
      cbFormatMoney(row.cost),
      cbFormatMoney(row.conversions),
    ]);
    tablesWrap.appendChild(renderTable("Networks", ["Network", "Cost", "Conversions"], rows));
    tablesAdded += 1;
  }

  if (activeBlocks.includes("search_terms")) {
    const warning = reportData.search_terms?.warning
      ? "Search terms not available for this account."
      : null;
    const rows = (reportData.search_terms?.rows || []).map((row) => [
      row.term || "—",
      cbFormatMoney(row.cost),
      cbFormatMoney(row.conversions),
    ]);
    tablesWrap.appendChild(renderTable("Search terms", ["Term", "Cost", "Conversions"], rows, { note: warning }));
    tablesAdded += 1;
  }

  if (activeBlocks.includes("keywords")) {
    const warning = reportData.keywords?.warning ? "Keywords not available for this account." : null;
    const rows = (reportData.keywords?.rows || []).map((row) => {
      const kwEl = document.createElement("div");
      const titleNode = document.createElement("div");
      titleNode.textContent = row.keyword || "—";
      kwEl.appendChild(titleNode);
      if (row.matchType) {
        const metaNode = document.createElement("div");
        metaNode.className = "cb-dashboard-muted";
        metaNode.textContent = row.matchType;
        kwEl.appendChild(metaNode);
      }
      return [kwEl, cbFormatMoney(row.cost), cbFormatMoney(row.conversions)];
    });
    tablesWrap.appendChild(renderTable("Keywords", ["Keyword", "Cost", "Conversions"], rows, { note: warning }));
    tablesAdded += 1;
  }

  if (tablesAdded) {
    root.appendChild(tablesWrap);
  }
};

const cbInitGoogleAdsDashboard = () => {
  cbRenderGoogleAdsDashboard();
};

window.cbInitGoogleAdsDashboard = cbInitGoogleAdsDashboard;
window.cbRenderGoogleAdsDashboard = cbRenderGoogleAdsDashboard;

const cbHandleGoogleAdsConnect = async () => {
  const connector = CONNECTORS_CONFIG.find((c) => c.key === "googleads");
  if (!connector || !connector.apiBase) return;
  cbUpdateConnectorState("googleads", { lastError: null });
  const { ok, status, json } = await cbFetchJson(`${connector.apiBase}/auth/url`);
  if (ok && json?.url) {
    window.location.href = json.url;
    return;
  }
  if (status === 401) {
    cbUpdateConnectorState("googleads", {
      status: "error",
      lastError: "Please sign in to connect Google Ads.",
    });
    return;
  }
  cbUpdateConnectorState("googleads", {
    status: "error",
    lastError: "We could not start Google Ads connect. Please try again.",
  });
};

const cbHandleGoogleAdsDisconnect = async () => {
  const connector = CONNECTORS_CONFIG.find((c) => c.key === "googleads");
  if (!connector || !connector.apiBase) return;
  const { ok } = await cbFetchJson(`${connector.apiBase}/disconnect`, { method: "POST" });
	  if (ok) {
	    cbUpdateConnectorState("googleads", {
	      status: "disconnected",
	      customerId: null,
	      loginCustomerId: null,
	      customerName: null,
	      lastSyncAt: null,
	      lastError: null,
	    });
	  } else {
    cbUpdateConnectorState("googleads", {
      status: "error",
      lastError: "Failed to disconnect Google Ads.",
    });
  }
};

const cbHandleGa4Connect = async () => {
  const connector = CONNECTORS_CONFIG.find((c) => c.key === "ga4");
  if (!connector || !connector.apiBase) return;
  cbUpdateConnectorState("ga4", { lastError: null });
  const ws = cbNormalizeWorkspaceId(cbCurrentWorkspaceId);
  const params = new URLSearchParams();
  if (ws) params.set("workspaceId", ws);
  const { ok, status, json } = await cbFetchJson(
    `${connector.apiBase}/auth/url${params.toString() ? `?${params.toString()}` : ""}`
  );
  if (ok && json?.url) {
    window.location.href = json.url;
    return;
  }
  if (status === 401) {
    cbUpdateConnectorState("ga4", {
      status: "error",
      lastError: "Please sign in to connect GA4.",
    });
    return;
  }
  cbUpdateConnectorState("ga4", {
    status: "error",
    lastError: "We could not start GA4 connect. Please try again.",
  });
};

const cbHandleGa4Disconnect = async () => {
  const connector = CONNECTORS_CONFIG.find((c) => c.key === "ga4");
  if (!connector || !connector.apiBase) return;
  const ws = cbNormalizeWorkspaceId(cbCurrentWorkspaceId);
  const { ok, status, json } = await cbFetchJson(`${connector.apiBase}/disconnect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId: ws }),
  });
  if (ok) {
    cbUpdateConnectorState("ga4", {
      status: "disconnected",
      propertyId: null,
      lastSyncAt: null,
      lastError: null,
      properties: [],
    });
  } else {
    const message =
      (json && (json.error || json.message)) ||
      (status === 401 ? "Please sign in to disconnect GA4." : "Failed to disconnect GA4.");
    cbUpdateConnectorState("ga4", {
      status: "error",
      lastError: message,
    });
  }
};

const cbDescribeGa4Error = (status, errorCode, message) => {
  if (status === 401) return "Sign in required to access GA4 (401).";
  const code = (errorCode || "").toString().trim();
  const safeMsg = (message || "").toString().trim();
  if (code === "not_connected") return "Connect GA4 first (not_connected).";
  if (code === "missing_refresh_token")
    return "GA4 is missing a refresh token (missing_refresh_token). Disconnect and reconnect.";
  if (code === "invalid_grant")
    return "Google authorization expired (invalid_grant). Disconnect and reconnect.";
  if (code === "invalid_range") return "Select a valid date range (invalid_range).";
  if (code === "invalid_compare_range") return "Select a valid compare range (invalid_compare_range).";
  if (code === "insufficient_permissions")
    return "Your Google account has no access to GA4 properties (insufficient_permissions).";
  if (code === "api_not_enabled")
    return "Google Analytics API is not enabled (api_not_enabled). Enable Analytics Admin + Data APIs.";
  if (code === "quota_exceeded") return "Google Analytics quota exceeded (quota_exceeded). Please try again later.";
  if (code === "rate_limited") return "Google Analytics rate limited (rate_limited). Please retry shortly.";
  if (code === "property_not_set") return "Select a GA4 property first (property_not_set).";
  return safeMsg || (code ? `GA4 request failed (${code}).` : "GA4 request failed.");
};

const cbLoadGa4Properties = async () => {
  const connector = CONNECTORS_CONFIG.find((c) => c.key === "ga4");
  if (!connector || !connector.apiBase) return;
  cbConnectorDetailState.ga4Loading = true;
  cbConnectorDetailState.ga4Error = null;
  cbRenderConnectorDetail(connector);
  const ws = cbNormalizeWorkspaceId(cbCurrentWorkspaceId);
  const params = new URLSearchParams();
  if (ws) params.set("workspaceId", ws);
  const { ok, json, status } = await cbFetchJson(
    `${connector.apiBase}/properties${params.toString() ? `?${params.toString()}` : ""}`
  );
  if (ok && json && Array.isArray(json.properties)) {
    cbConnectorDetailState.ga4Properties = json.properties;
    cbConnectorDetailState.ga4Error = null;
  } else {
    cbConnectorDetailState.ga4Properties = [];
    const message =
      (json && (json.message || json.error)) ||
      (status === 401 ? "Please sign in to view GA4 properties." : "Unable to load GA4 properties.");
    cbConnectorDetailState.ga4Error = cbDescribeGa4Error(status, json?.error, message);
  }
  cbConnectorDetailState.ga4Loading = false;
  cbRenderConnectorDetail(connector);
};

const cbLoadGoogleAdsCustomers = async () => {
  const connector = CONNECTORS_CONFIG.find((c) => c.key === "googleads");
  if (!connector || !connector.apiBase) return;
  cbConnectorDetailState.googleAdsLoading = true;
  cbConnectorDetailState.googleAdsError = null;
  cbRenderConnectorDetail(connector);
  const { ok, json, status } = await cbFetchJson(`${connector.apiBase}/customers`);
  if (ok && json && Array.isArray(json.customers)) {
    cbConnectorDetailState.googleAdsCustomers = json.customers;
    cbConnectorDetailState.googleAdsError = null;
  } else {
    cbConnectorDetailState.googleAdsCustomers = [];
    const message =
      (json && (json.error || json.message)) ||
      (status === 401 ? "Please sign in to view Google Ads accounts." : "Unable to load Google Ads accounts.");
    cbConnectorDetailState.googleAdsError = message;
  }
  cbConnectorDetailState.googleAdsLoading = false;
  cbRenderConnectorDetail(connector);
};

const cbLoadGoogleAdsClients = async (managerId) => {
  const connector = CONNECTORS_CONFIG.find((c) => c.key === "googleads");
  if (!connector || !connector.apiBase) return;
  const normalizedManagerId = (managerId || "").toString().trim();
  if (!normalizedManagerId) {
    cbConnectorDetailState.googleAdsClients = [];
    cbConnectorDetailState.googleAdsClientsError = null;
    cbConnectorDetailState.googleAdsClientsLoading = false;
    cbRenderConnectorDetail(connector);
    return;
  }

  cbConnectorDetailState.googleAdsClientsLoading = true;
  cbConnectorDetailState.googleAdsClientsError = null;
  cbRenderConnectorDetail(connector);

  const params = new URLSearchParams({ managerId: normalizedManagerId });
  const { ok, json, status } = await cbFetchJson(`${connector.apiBase}/customers/clients?${params.toString()}`);
  if (ok && json && Array.isArray(json.clients)) {
    cbConnectorDetailState.googleAdsClients = json.clients;
    cbConnectorDetailState.googleAdsClientsError = null;
  } else {
    cbConnectorDetailState.googleAdsClients = [];
    const message =
      (json && (json.message || json.error)) ||
      (status === 401
        ? "Please sign in to view Google Ads clients."
        : "Unable to load Google Ads clients.");
    cbConnectorDetailState.googleAdsClientsError = message;
  }

  cbConnectorDetailState.googleAdsClientsLoading = false;
  cbRenderConnectorDetail(connector);
};

const cbSaveGoogleAdsCustomer = async (customerId, loginCustomerId) => {
  const connector = CONNECTORS_CONFIG.find((c) => c.key === "googleads");
  if (!connector || !connector.apiBase || !customerId) return;
  cbConnectorDetailState.googleAdsLoading = true;
  cbConnectorDetailState.googleAdsError = null;
  cbRenderConnectorDetail(connector);
	  const { ok, json, status } = await cbFetchJson(`${connector.apiBase}/customer`, {
	    method: "POST",
	    headers: { "Content-Type": "application/json" },
	    body: JSON.stringify({ customerId, loginCustomerId }),
	  });
	  if (ok) {
	    cbUpdateConnectorState("googleads", { customerId, loginCustomerId, status: "connected" });
	    cbConnectorDetailState.googleAdsError = null;
	    cbRefreshConnectorStatuses();
	  } else {
	    const message =
	      (json && (json.error || json.message)) ||
      (status === 401 ? "Please sign in to save Google Ads account." : "Unable to save Google Ads account.");
    cbConnectorDetailState.googleAdsError = message;
  }
  cbConnectorDetailState.googleAdsLoading = false;
  cbRenderConnectorDetail(connector);
};

const cbSaveGa4Property = async (propertyId) => {
  const connector = CONNECTORS_CONFIG.find((c) => c.key === "ga4");
  if (!connector || !connector.apiBase || !propertyId) return;
  cbConnectorDetailState.ga4Loading = true;
  cbConnectorDetailState.ga4Error = null;
  cbRenderConnectorDetail(connector);
  const ws = cbNormalizeWorkspaceId(cbCurrentWorkspaceId);
  const { ok, json, status } = await cbFetchJson(`${connector.apiBase}/property`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ propertyId, workspaceId: ws }),
  });
  if (ok) {
    cbUpdateConnectorState("ga4", { propertyId, status: "connected" });
    cbConnectorDetailState.ga4Error = null;
    cbRefreshConnectorStatuses();
  } else {
    const message =
      (json && (json.error || json.message)) ||
      (status === 401 ? "Please sign in to save GA4 property." : "Unable to save GA4 property.");
    cbConnectorDetailState.ga4Error = cbDescribeGa4Error(status, json?.error, message);
  }
  cbConnectorDetailState.ga4Loading = false;
  cbRenderConnectorDetail(connector);
};

const cbGetConnectorIconText = (connector) => {
  const source =
    connector?.icon ||
    connector?.label ||
    connector?.key ||
    "";
  const cleaned = source.toString().replace(/[^a-zA-Z0-9]/g, "");
  const text = cleaned || source;
  return text ? text.slice(0, 2).toUpperCase() : "?";
};

const cbStartGoogleAdsConnect = async () => {
  try {
    const response = await fetch(`${API_BASE}/connectors/googleads/auth/url`, {
      method: "GET",
      headers: cbGetAuthHeaders(),
      credentials: "include",
    });
    const data = await safeJson(response);
    if (!response.ok || !data?.url) {
      throw new Error(data?.error || "Missing auth URL");
    }
    window.open(data.url, "_blank", "noopener,noreferrer");
  } catch (error) {
    console.error("[CONNECTOR_GOOGLE_ADS]", "Failed to start auth", error);
  }
};

const cbHandleConnectorAction = (connector) => {
  if (!connector) return;
  const { key, status } = connector;
  if (key === "googleads") {
    const state = cbConnectorState.googleads || {};
    if (state.status === "connected") {
      window.open("https://ads.google.com", "_blank", "noopener,noreferrer");
      return;
    }
    cbHandleGoogleAdsConnect();
    return;
  }
  if (key === "ga4") {
    const state = cbConnectorState.ga4 || {};
    if (state.status === "connected") {
      cbHandleGa4Disconnect();
      return;
    }
    cbHandleGa4Connect();
    return;
  }
  if (status === "available" || status === "planned") {
    console.log(`[CONNECTOR] Connect ${key}`);
    return;
  }
  if (status === "coming_soon") {
    console.log(`[CONNECTOR] Coming soon: ${key}`);
  }
};

const cbRenderConnectorCard = (connector) => {
  if (!connector) return document.createElement("div");
  const state = connector.supportsAuth ? cbConnectorState[connector.key] || {} : {};
  const status = connector.supportsAuth && state.status ? state.status : connector?.status || "coming_soon";
  const card = document.createElement("div");
  card.className = "cb-connector-card";
  if (status === "not_planned") {
    card.classList.add("is-not-planned");
  }
  if (status === "planned") {
    card.classList.add("is-planned");
  }

  const topRow = document.createElement("div");
  topRow.className = "cb-connector-top";

  const title = document.createElement("div");
  title.className = "cb-connector-title";

  const icon = document.createElement("div");
  icon.className = "cb-connector-icon";
  icon.textContent = cbGetConnectorIconText(connector);
  icon.setAttribute("aria-hidden", "true");

  const labelEl = document.createElement("div");
  labelEl.className = "cb-connector-label";
  labelEl.textContent = connector?.label || connector?.key || "Connector";

  title.appendChild(icon);
  title.appendChild(labelEl);

  const statusEl = document.createElement("span");
  statusEl.className = "cb-connector-status";
  statusEl.textContent = cbGetConnectorStatusLabel(status);
  if (status === "available") {
    statusEl.classList.add("is-available");
  } else if (status === "planned") {
    statusEl.classList.add("is-planned");
  } else if (status === "connected") {
    statusEl.classList.add("is-available");
  } else if (status === "disconnected" || status === "unknown") {
    statusEl.classList.add("is-coming-soon");
  } else if (status === "coming_soon") {
    statusEl.classList.add("is-coming-soon");
  } else if (status === "error") {
    statusEl.classList.add("is-not-planned");
  } else {
    statusEl.classList.add("is-not-planned");
  }

  topRow.appendChild(title);
  topRow.appendChild(statusEl);

  const body = document.createElement("p");
  body.className = "cb-connector-body";
  body.textContent = connector?.description || "";

  const actions = document.createElement("div");
  actions.className = "cb-connector-actions";
  const actionBtn = document.createElement("button");
  actionBtn.type = "button";
  let baseClass = "btn btn-secondary";
  if (status === "available" || status === "planned" || status === "connected" || status === "disconnected" || status === "unknown") {
    baseClass = "btn btn-primary";
  }
  actionBtn.className = `${baseClass} cb-connector-action`;

  if (connector.key === "googleads") {
    if (status === "connected") {
      actionBtn.textContent = "Manage in Google Ads";
      actionBtn.addEventListener("click", () => cbHandleConnectorAction(connector));
    } else {
      actionBtn.textContent = "Connect Google Ads";
      actionBtn.addEventListener("click", () => cbHandleGoogleAdsConnect());
    }
  } else if (connector.key === "ga4") {
    if (status === "connected") {
      actionBtn.textContent = "Disconnect";
      actionBtn.addEventListener("click", () => cbHandleGa4Disconnect());
    } else {
      actionBtn.textContent = "Connect GA4";
      actionBtn.addEventListener("click", () => cbHandleGa4Connect());
    }
  } else if (status === "available" || status === "planned") {
    actionBtn.textContent = "Connect";
    actionBtn.addEventListener("click", () => cbHandleConnectorAction(connector));
  } else if (status === "coming_soon") {
    actionBtn.textContent = "Coming soon";
    actionBtn.classList.add("is-coming-soon");
    actionBtn.setAttribute("aria-disabled", "true");
    actionBtn.addEventListener("click", (event) => {
      event.preventDefault();
      cbHandleConnectorAction(connector);
    });
  } else {
    actionBtn.textContent = "Not available";
    actionBtn.disabled = true;
    actionBtn.setAttribute("aria-disabled", "true");
    actionBtn.classList.add("is-not-planned");
    actionBtn.addEventListener("click", (event) => {
      event.preventDefault();
    });
  }
  actions.appendChild(actionBtn);

  if (connector.key === "googleads") {
    if (status === "connected") {
      const chooseBtn = document.createElement("button");
      chooseBtn.type = "button";
      chooseBtn.className = "btn btn-secondary cb-connector-action";
      chooseBtn.textContent = "Choose account";
      chooseBtn.addEventListener("click", (event) => {
        event?.preventDefault?.();
        cbOpenConnectorDetail(connector.key);
      });
      const disconnectBtn = document.createElement("button");
      disconnectBtn.type = "button";
      disconnectBtn.className = "btn btn-secondary cb-connector-action";
      disconnectBtn.textContent = "Disconnect";
      disconnectBtn.addEventListener("click", () => cbHandleGoogleAdsDisconnect());
      actions.appendChild(chooseBtn);
      actions.appendChild(disconnectBtn);
    } else {
      const placeholder = document.createElement("span");
      placeholder.className = "cb-modal-note";
      placeholder.textContent = "Requires Google Ads OAuth";
      actions.appendChild(placeholder);
    }
  } else if (connector.key === "ga4" && status === "connected") {
    const chooseBtn = document.createElement("button");
    chooseBtn.type = "button";
    chooseBtn.className = "btn btn-secondary cb-connector-action";
    chooseBtn.textContent = "Choose property";
    chooseBtn.addEventListener("click", (event) => {
      event?.preventDefault?.();
      cbOpenConnectorDetail(connector.key);
    });
    const disconnectBtn = document.createElement("button");
    disconnectBtn.type = "button";
    disconnectBtn.className = "btn btn-secondary cb-connector-action";
    disconnectBtn.textContent = "Disconnect";
    disconnectBtn.addEventListener("click", () => cbHandleGa4Disconnect());
    actions.appendChild(chooseBtn);
    actions.appendChild(disconnectBtn);
  }

  const detailsBtn = document.createElement("button");
  detailsBtn.type = "button";
  detailsBtn.className = "btn btn-secondary cb-connector-action";
  detailsBtn.textContent = "View details";
  detailsBtn.addEventListener("click", (event) => {
    event?.preventDefault?.();
    cbOpenConnectorDetail(connector.key);
  });
  actions.appendChild(detailsBtn);

  if (connector.key === "googleads") {
    if (state.customerId) {
      const meta = document.createElement("p");
      meta.className = "cb-connector-meta";
      meta.textContent = `Customer ID: ${state.customerId}${state.lastSyncAt ? ` \u00b7 Last sync: ${state.lastSyncAt}` : ""}`;
      card.appendChild(meta);
    }
    if (state.lastError) {
      const err = document.createElement("p");
      err.className = "cb-connector-error";
      err.textContent = state.lastError;
      card.appendChild(err);
    }
  } else if (connector.key === "ga4") {
    if (state.propertyId || state.lastSyncAt) {
      const meta = document.createElement("p");
      meta.className = "cb-connector-meta";
      const parts = [];
      if (state.propertyId) parts.push(`Property: ${state.propertyId}`);
      if (state.lastSyncAt) parts.push(`Last sync: ${state.lastSyncAt}`);
      meta.textContent = parts.join(" \u00b7 ");
      card.appendChild(meta);
    }
    if (state.lastError) {
      const err = document.createElement("p");
      err.className = "cb-connector-error";
      err.textContent = state.lastError;
      card.appendChild(err);
    }
  }

  card.appendChild(topRow);
  card.appendChild(body);
  card.appendChild(actions);
  return card;
};

const cbRenderCouncilPerformanceCard = () => {
  const container =
    (shellElements.councilPerformanceCard && shellElements.councilPerformanceCard instanceof HTMLElement
      ? shellElements.councilPerformanceCard
      : document.getElementById("cb-council-performance-card"));
  if (!container) return;

  const state = cbCouncilPerformanceState;
  const range = state.range || "billing_period";
  const ranges = [
    { value: "billing_period", label: "Billing period" },
    { value: "last_7_days", label: "Last 7 days" },
    { value: "last_30_days", label: "Last 30 days" },
  ];

  const formatNumber = (value) => {
    if (typeof value !== "number" || Number.isNaN(value)) return "0";
    return value.toLocaleString(undefined);
  };

  const formatMoney = (value) => {
    const num = typeof value === "number" && !Number.isNaN(value) ? value : 0;
    return `$${num.toFixed(2)}`;
  };

  const summary = state.summary || {};
  const totalTokens =
    summary.totalTokens ?? summary.total_tokens ?? summary.tokens ?? summary.total ?? 0;
  const totalCost =
    summary.totalCostUsd ?? summary.total_cost_usd ?? summary.costUsd ?? summary.cost_usd ?? 0;

  const rowsRaw =
    summary.byCouncil ||
    summary.by_council ||
    summary.councils ||
    summary.agents ||
    [];
  const rows = Array.isArray(rowsRaw) ? [...rowsRaw] : [];
  rows.sort((a, b) => {
    const costA = a?.costUsd ?? a?.cost_usd ?? a?.cost ?? 0;
    const costB = b?.costUsd ?? b?.cost_usd ?? b?.cost ?? 0;
    return costB - costA;
  });

  const rangeSelector = document.createElement("div");
  rangeSelector.className = "cb-council-range-toggle";
  rangeSelector.innerHTML = ranges
    .map(
      (opt) => `
      <button type="button"
        class="cb-council-range-toggle__option${
          opt.value === range ? " cb-council-range-toggle__option--active" : ""
        }"
        data-range="${opt.value}"
      >
        ${opt.label}
      </button>
    `
    )
    .join("");

  const body = document.createElement("div");
  body.className = "cb-account-card-body";

  if (state.loading && !state.loaded) {
    body.innerHTML = `<p class="cb-text-muted">Loading council performance...</p>`;
  } else if (state.error) {
    body.innerHTML = `<p class="cb-text-muted">Could not load council performance right now.</p>`;
  } else if (!totalTokens && !totalCost && rows.length === 0) {
    body.innerHTML = `<p class="cb-text-muted">No council usage recorded yet. Run a council to see tokens and cost here.</p>`;
  } else {
    const tableRows = rows
      .map((row) => {
        const slug = row.councilSlug || row.slug || row.id || "Council";
        const tokens =
          row.totalTokens ?? row.total_tokens ?? row.tokens ?? row.total ?? 0;
        const cost = row.costUsd ?? row.cost_usd ?? row.cost ?? 0;
        return `<div class="cb-council-performance-table__row">
          <span>${slug}</span>
          <span>${formatNumber(tokens)}</span>
          <span>${formatMoney(cost)}</span>
        </div>`;
      })
      .join("");

    body.innerHTML = `
      <div class="cb-council-performance-summary">
        <div class="cb-council-performance-metric">
          <p class="cb-council-performance-label">Total council tokens</p>
          <p class="cb-council-performance-value">${formatNumber(totalTokens)}</p>
        </div>
        <div class="cb-council-performance-metric">
          <p class="cb-council-performance-label">Total council cost</p>
          <p class="cb-council-performance-value">${formatMoney(totalCost)}</p>
        </div>
      </div>
      ${
        rows.length
          ? `<div class="cb-council-performance-table">
              <div class="cb-council-performance-table__header">
                <span>Council</span>
                <span>Tokens</span>
                <span>Cost</span>
              </div>
              <div class="cb-council-performance-table__body">
                ${tableRows}
              </div>
            </div>`
          : ""
      }
    `;
  }

  container.innerHTML = "";
  const header = document.createElement("header");
  header.className = "cb-account-card-header";
  const headerWrap = document.createElement("div");
  const subtitle = document.createElement("p");
  subtitle.className = "cb-account-card-subtitle";
  subtitle.textContent = "Performance Council";
  const title = document.createElement("h3");
  title.textContent = "Council performance";
  headerWrap.appendChild(subtitle);
  headerWrap.appendChild(title);
  header.appendChild(headerWrap);
  header.appendChild(rangeSelector);

  container.appendChild(header);
  container.appendChild(body);

  const rangeButtons = container.querySelectorAll(".cb-council-range-toggle__option");
  rangeButtons.forEach((btn) => {
    if (!btn) return;
    btn.addEventListener("click", () => {
      const selected = btn.getAttribute("data-range") || "billing_period";
      if (selected === cbCouncilPerformanceState.range) return;
      cbCouncilPerformanceState.range = selected;
      cbCouncilPerformanceState.loading = true;
      cbCouncilPerformanceState.error = null;
      cbRenderCouncilPerformanceCard();
      cbFetchCouncilPerformanceSummary(selected);
    });
  });
};

const cbRenderConnectorsPanel = () => {
  const container =
    (shellElements.connectorsCategories && shellElements.connectorsCategories instanceof HTMLElement
      ? shellElements.connectorsCategories
      : document.getElementById("cb-connectors-categories"));
  if (!container) return;
  container.innerHTML = "";

  CONNECTOR_CATEGORIES.forEach((category) => {
    const connectors = CONNECTORS_CONFIG.filter(
      (item) => item && item.category === category.id
    );
    if (!connectors.length) {
      return;
    }
    const section = document.createElement("section");
    section.className = "cb-account-card cb-connector-category-card";

    const header = document.createElement("header");
    header.className = "cb-account-card-header";
    const headerWrap = document.createElement("div");
    const subtitle = document.createElement("p");
    subtitle.className = "cb-account-card-subtitle";
    subtitle.textContent = category.label;
    const title = document.createElement("h3");
    title.textContent = category.label.replace(" connectors", "");
    headerWrap.appendChild(subtitle);
    headerWrap.appendChild(title);
    header.appendChild(headerWrap);

    const grid = document.createElement("div");
    grid.className = "cb-connectors-grid";
    connectors.forEach((connector) => {
      grid.appendChild(cbRenderConnectorCard(connector));
    });

    section.appendChild(header);
    section.appendChild(grid);
    container.appendChild(section);
  });
};

// --- Agent detail (mock) ---
const cbAgentDetailState = {
  agent: null,
  googleAdsSummary: null,
  googleAdsSummaryLoading: false,
  googleAdsSummaryError: null,
  ga4Summary: null,
  ga4SummaryLoading: false,
  ga4SummaryError: null,
};

const CB_PROVIDER_MODEL_MATRIX = {
  auto: {
    label: "Auto",
    models: [
      "gpt-4o",
      "claude-3.5-sonnet",
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "grok-2",
      "copilot-pro",
    ],
  },
  chatgpt: {
    label: "ChatGPT",
    models: [
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-4.1",
      "gpt-4.1-mini",
      "o1",
      "o1-mini",
    ],
  },
  claude: {
    label: "Claude",
    models: [
      "claude-3.5-sonnet",
      "claude-3.5-haiku",
      "claude-3-opus",
      "claude-3-sonnet",
    ],
  },
  gemini: {
    label: "Gemini",
    models: [
      "gemini-1.5-pro",
      "gemini-1.5-flash",
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-2.0-pro",
      "gemini-2.0-flash",
    ],
  },
  grok: {
    label: "Grok",
    models: [
      "grok-2",
      "grok-2-mini",
      "grok-vision-beta",
    ],
  },
  copilot: {
    label: "Copilot",
    models: [
      "copilot-pro",
      "copilot-vision",
      "copilot-enterprise",
    ],
  },
};

const cbGetProviderConfig = (providerValue) => {
  const key = String(providerValue || "auto").toLowerCase();
  return CB_PROVIDER_MODEL_MATRIX[key] || CB_PROVIDER_MODEL_MATRIX.auto;
};

const cbRenderModelList = (listEl, models) => {
  if (!listEl) return;
  listEl.innerHTML = "";
  models.forEach((model) => {
    const option = document.createElement("option");
    option.value = model;
    listEl.appendChild(option);
  });
};

const cbUpdateModelSearch = (providerValue, searchInput, listEl) => {
  if (!searchInput || !listEl) return;
  const config = cbGetProviderConfig(providerValue);
  const placeholder =
    providerValue === "auto" ? "Search models" : `Search ${config.label} models`;
  cbRenderModelList(listEl, config.models);
  searchInput.placeholder = placeholder;
  const prevProvider = searchInput.dataset.provider || "";
  if (prevProvider !== providerValue) {
    searchInput.value = "";
  }
  searchInput.dataset.provider = providerValue;
};

const cbInitModelMenu = () => {
  const providerSelect = document.getElementById("cb-model-selector");
  const searchInput = document.getElementById("cb-model-search");
  const listEl = document.getElementById("cb-model-search-list");
  if (!providerSelect || !searchInput || !listEl) return;
  if (providerSelect.dataset.modelMenuBound === "true") return;
  const update = () => {
    cbUpdateModelSearch(providerSelect.value || "auto", searchInput, listEl);
    cbUpdateChatHeader();
    cbActivateContextFromUi("model-provider-change");
  };
  providerSelect.addEventListener("change", update);
  searchInput.addEventListener("input", () => {
    cbUpdateChatHeader();
    cbQueueActivateContextFromUi("model-hint-change");
  });
  update();
  providerSelect.dataset.modelMenuBound = "true";
};

const cbPopulateAgentModelSelect = (selectEl) => {
  if (!selectEl) return;
  selectEl.innerHTML = "";
  const sourceSelect = document.getElementById("cb-model-selector");
  const sourceOptions = sourceSelect
    ? Array.from(sourceSelect.options || [])
    : [];
  const options =
    sourceOptions.length > 0
      ? sourceOptions.map((opt) => ({
          value: opt.value,
          label: opt.textContent || opt.value,
        }))
      : [
          { value: "auto", label: "Auto" },
          { value: "chatgpt", label: "ChatGPT" },
          { value: "claude", label: "Claude" },
          { value: "gemini", label: "Gemini" },
          { value: "grok", label: "Grok" },
          { value: "copilot", label: "Copilot" },
        ];
  options.forEach((opt) => {
    const optionEl = document.createElement("option");
    optionEl.value = opt.value;
    optionEl.textContent = opt.label;
    selectEl.appendChild(optionEl);
  });
  if (sourceSelect) {
    selectEl.value = sourceSelect.value;
  }
  selectEl.disabled = true;
};

const cbRenderAgentDetail = (agent) => {
  if (!agent) return;
  const titleEl = document.getElementById("cb-agent-detail-title");
  const nameEl = document.getElementById("cb-agent-detail-name");
  const summaryEl = document.getElementById("cb-agent-detail-summary");
  const workspaceChip = document.getElementById("cb-agent-detail-workspace");
  const statusChip = document.getElementById("cb-agent-detail-status");
  const promptEl = document.getElementById("cb-agent-detail-prompt");
  const connectorsEl = document.getElementById("cb-agent-detail-connectors");
  const usageEl = document.getElementById("cb-agent-detail-usage");
  const modelSelect = document.getElementById("cb-agent-detail-model");

  const workspaceLabel = cbGetWorkspaceLabel(agent.workspace);
  if (titleEl) titleEl.textContent = `${agent.label || agent.key} (preview)`;
  if (nameEl) nameEl.textContent = agent.label || agent.key;
  if (summaryEl) summaryEl.textContent = agent.shortDescription || "";
  if (workspaceChip) workspaceChip.textContent = workspaceLabel;
  if (statusChip) {
    if (agent.key === "ceo" || agent.key === "cmo") {
      statusChip.textContent = "Active soon";
      statusChip.classList.remove("cb-chip-preview");
    } else {
      statusChip.textContent = "Preview only";
      statusChip.classList.add("cb-chip-preview");
    }
  }
  if (promptEl) {
    if (agent.key === "ceo") {
      promptEl.value = "- Represent executive priorities and ROI.\n- Surface risks and trade-offs clearly.\n- Keep responses concise and directive.";
    } else if (agent.key === "cmo") {
      promptEl.value = "- Focus on paid media and performance marketing.\n- Prioritize Google Ads plus Meta/TikTok/LinkedIn insights.\n- Be actionable on budgets, audiences, and creative tests.";
    } else {
      promptEl.value = `System prompt for ${agent.label || agent.key}\n\nThis is a preview-only configuration. In production, this prompt will guide the agent on:\n- Role and scope\n- Guardrails and escalation rules\n- Data sources and access`;
    }
  }
  cbPopulateAgentModelSelect(modelSelect);

  if (connectorsEl) {
    connectorsEl.innerHTML = "";
    const connectors = cbGetConnectorsForAgent(agent);
    if (!connectors.length) {
      const empty = document.createElement("p");
      empty.className = "cb-modal-note";
      empty.textContent = "No connectors assigned to this agent yet.";
      connectorsEl.appendChild(empty);
    } else {
      connectors.forEach((connector) => {
        const row = document.createElement("div");
        row.className = "cb-agent-connector-row";

        const name = document.createElement("div");
        name.className = "cb-agent-connector-name";
        name.textContent = connector.label || connector.key;

        const status = document.createElement("span");
        status.className = "cb-connector-status";
        const label = cbGetConnectorStatusLabel(connector.status);
        status.textContent = connector.status === "coming_soon" ? label : label || "Not connected";
        if (connector.status === "coming_soon") {
          status.classList.add("is-coming-soon");
        } else if (connector.status === "planned") {
          status.classList.add("is-planned");
        } else {
          status.classList.add("is-not-connected");
        }

        row.appendChild(name);
        row.appendChild(status);
      connectorsEl.appendChild(row);
    });
  }
}

  const metricsEl = document.getElementById("cb-agent-detail-metrics");
  if (metricsEl) {
    metricsEl.innerHTML = "";
    const isBusiness =
      cbNormalizeAgentWorkspace(agent.workspace) === "business";
    const usesGoogleAds =
      Array.isArray(agent.connectors) &&
      agent.connectors.includes("googleads");
    const usesGa4 =
      Array.isArray(agent.connectors) && agent.connectors.includes("ga4");
    const appendHtmlBlock = (html) => {
      if (!html) return;
      const tmp = document.createElement("div");
      tmp.innerHTML = html.trim();
      const el = tmp.firstElementChild;
      if (el) metricsEl.appendChild(el);
    };

    if (isBusiness && usesGoogleAds) {
      const googleState = cbConnectorState.googleads || {};
      const googleStatus = googleState.status || "unknown";
      const hasCustomer = !!googleState.customerId;
      if (googleStatus !== "connected") {
        appendHtmlBlock(
          '<p class="cb-modal-note">Connect Google Ads in Account &amp; Billing \u2192 Connectors to see performance here.</p>'
        );
      } else if (!hasCustomer) {
        appendHtmlBlock(
          '<p class="cb-modal-note">Choose a primary Google Ads account in Account &amp; Billing \u2192 Connectors to see performance metrics here.</p>'
        );
      } else if (cbAgentDetailState.googleAdsSummaryLoading) {
        appendHtmlBlock(
          '<p class="cb-modal-note">Loading Google Ads summary.</p>'
        );
      } else if (cbAgentDetailState.googleAdsSummaryError) {
        appendHtmlBlock(
          `<p class="cb-form-error">${cbAgentDetailState.googleAdsSummaryError}</p>`
        );
      } else if (cbAgentDetailState.googleAdsSummary) {
        const s = cbAgentDetailState.googleAdsSummary;
        const currency = s?.currency || "USD";
        const formatValue = (val, decimals = 0) =>
          typeof val === "number" && Number.isFinite(val)
            ? val.toFixed(decimals)
            : "-";
        const formatPercent = (val) =>
          typeof val === "number" && Number.isFinite(val)
            ? `${(val * 100).toFixed(2)}%`
            : "-";
        appendHtmlBlock(`
          <section class="cb-account-card">
            <header class="cb-account-card-header">
              <div>
                <p class="cb-account-card-subtitle">Google Ads</p>
                <h3>Last 7 days</h3>
              </div>
            </header>
            <div class="cb-enterprise-inline">
              <div>
                <p class="cb-modal-note">Cost</p>
                <p class="cb-modal-value">${formatValue(s.cost, 2)} ${currency}</p>
              </div>
              <div>
                <p class="cb-modal-note">Conversions</p>
                <p class="cb-modal-value">${formatValue(s.conversions)}</p>
              </div>
              <div>
                <p class="cb-modal-note">CPA</p>
                <p class="cb-modal-value">${formatValue(s.cpa, 2)} ${currency}</p>
              </div>
              <div>
                <p class="cb-modal-note">Clicks</p>
                <p class="cb-modal-value">${formatValue(s.clicks)}</p>
              </div>
              <div>
                <p class="cb-modal-note">Impressions</p>
                <p class="cb-modal-value">${formatValue(s.impressions)}</p>
              </div>
              <div>
                <p class="cb-modal-note">CTR</p>
                <p class="cb-modal-value">${formatPercent(s.ctr)}</p>
              </div>
              <div>
                <p class="cb-modal-note">Conv. rate</p>
                <p class="cb-modal-value">${formatPercent(s.conversionRate)}</p>
              </div>
              <div>
                <p class="cb-modal-note">Avg CPC</p>
                <p class="cb-modal-value">${formatValue(s.avgCpc, 2)} ${currency}</p>
              </div>
            </div>
          </section>
        `);
      }
    }

    if (isBusiness && usesGa4) {
      const ga4State = cbConnectorState.ga4 || {};
      const ga4Status = ga4State.status || "unknown";
      const hasProperty = !!ga4State.propertyId;
      if (ga4Status !== "connected" || !hasProperty) {
        appendHtmlBlock(
          '<p class="cb-modal-note">Connect GA4 and choose a property in Account &amp; Billing \u2192 Connectors to see traffic metrics here.</p>'
        );
      } else if (cbAgentDetailState.ga4SummaryLoading) {
        appendHtmlBlock(
          '<p class="cb-modal-note">Loading GA4 metrics\u2026</p>'
        );
      } else if (cbAgentDetailState.ga4SummaryError) {
        appendHtmlBlock(
          `<p class="cb-form-error">${cbAgentDetailState.ga4SummaryError}</p>`
        );
	      } else if (cbAgentDetailState.ga4Summary) {
	        const s = cbAgentDetailState.ga4Summary;
	        const formatValue = (val, decimals = 0) =>
	          typeof val === "number" && Number.isFinite(val)
	            ? val.toFixed(decimals)
	            : "-";
	        const rangeLabel =
	          s.dateRange === "last_30_days" ? "Last 30 days" : "Last 7 days";
	        appendHtmlBlock(`
	          <section class="cb-account-card">
	            <header class="cb-account-card-header">
	              <div>
	                <p class="cb-account-card-subtitle">GA4</p>
	                <h3>${rangeLabel}</h3>
	              </div>
	            </header>
	            <div class="cb-enterprise-inline">
	              <div>
	                <p class="cb-modal-note">Sessions</p>
	                <p class="cb-modal-value">${formatValue(s.sessions)}</p>
	              </div>
	              <div>
	                <p class="cb-modal-note">Total users</p>
	                <p class="cb-modal-value">${formatValue(s.totalUsers)}</p>
	              </div>
	              <div>
	                <p class="cb-modal-note">Active users</p>
	                <p class="cb-modal-value">${formatValue(s.activeUsers)}</p>
	              </div>
	              <div>
	                <p class="cb-modal-note">Conversions</p>
	                <p class="cb-modal-value">${formatValue(s.conversions)}</p>
	              </div>
	              <div>
	                <p class="cb-modal-note">Purchase revenue</p>
	                <p class="cb-modal-value">${formatValue(s.purchaseRevenue, 2)}</p>
	              </div>
	            </div>
	          </section>
	        `);
	      }
	    }
  }

  if (usageEl) {
    usageEl.innerHTML = "";
    const rows = cbBuildMockUsageRows(agent);
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      const lastRun = document.createElement("td");
      const source = document.createElement("td");
      const tokens = document.createElement("td");
      lastRun.textContent = row.lastRun;
      source.textContent = row.source;
      tokens.textContent = row.tokens;
      tr.appendChild(lastRun);
      tr.appendChild(source);
      tr.appendChild(tokens);
      usageEl.appendChild(tr);
    });
  }
};

function cbOpenAgentDetail(workspaceKey, agentKey) {
  const agent =
    cbFindAgentByKey(agentKey, workspaceKey || cbCurrentWorkspaceId) ||
    cbFindAgentByKey(agentKey);
  if (!agent) {
    console.warn("[CB_AGENT_DETAIL] Agent not found", workspaceKey, agentKey);
    return;
  }
  cbAgentDetailState.agent = agent;
  cbAgentDetailState.googleAdsSummary = null;
  cbAgentDetailState.googleAdsSummaryError = null;
  cbAgentDetailState.googleAdsSummaryLoading = false;
  cbAgentDetailState.ga4Summary = null;
  cbAgentDetailState.ga4SummaryError = null;
  cbAgentDetailState.ga4SummaryLoading = false;

  const isBusiness =
    cbNormalizeAgentWorkspace(agent.workspace) === "business";
  const usesGoogleAds =
    Array.isArray(agent.connectors) &&
    agent.connectors.includes("googleads");
  const usesGa4 =
    Array.isArray(agent.connectors) && agent.connectors.includes("ga4");
  const googleState = cbConnectorState.googleads || {};
  const googleStatus = googleState.status || "unknown";
  const hasGoogleCustomer = !!googleState.customerId;
  const ga4State = cbConnectorState.ga4 || {};
  const shouldFetchGoogleAds =
    isBusiness && usesGoogleAds && googleStatus === "connected" && hasGoogleCustomer;
  const shouldFetchGa4 =
    isBusiness && usesGa4 && ga4State.status === "connected" && ga4State.propertyId;

  if (shouldFetchGoogleAds) {
    cbAgentDetailState.googleAdsSummaryLoading = true;
  }
  if (shouldFetchGa4) {
    cbAgentDetailState.ga4SummaryLoading = true;
  }

  cbRenderAgentDetail(agent);
  openModal("cb-agent-detail-modal");

  if (shouldFetchGoogleAds) {
    (async () => {
      try {
        const summary = await cbFetchGoogleAdsSummary(cbCurrentWorkspaceId);
        if (summary && !summary.error) {
          cbAgentDetailState.googleAdsSummary = summary;
          cbAgentDetailState.googleAdsSummaryError = null;
        } else if (summary && summary.error === "customer_not_set") {
          cbAgentDetailState.googleAdsSummary = null;
          cbAgentDetailState.googleAdsSummaryError =
            "Choose a primary Google Ads account in Account & Billing \u2192 Connectors to see performance metrics here.";
        } else {
          cbAgentDetailState.googleAdsSummary = null;
          cbAgentDetailState.googleAdsSummaryError =
            "Could not load Google Ads summary. Please try again later.";
        }
      } catch (err) {
        cbAgentDetailState.googleAdsSummary = null;
        cbAgentDetailState.googleAdsSummaryError =
          "Could not load Google Ads summary. Please try again later.";
      } finally {
        cbAgentDetailState.googleAdsSummaryLoading = false;
        cbRenderAgentDetail(agent);
      }
    })();
  }

	  if (shouldFetchGa4) {
	    (async () => {
	      try {
	        const summary = await cbFetchGa4Summary(cbCurrentWorkspaceId);
	        if (summary && !summary.error) {
	          cbAgentDetailState.ga4Summary = summary;
	          cbAgentDetailState.ga4SummaryError = null;
	        } else if (summary && summary.error === "property_not_set") {
	          cbAgentDetailState.ga4Summary = null;
	          cbAgentDetailState.ga4SummaryError =
	            "Choose a GA4 property in Account & Billing → Connectors to see traffic metrics here.";
	        } else {
	          cbAgentDetailState.ga4Summary = null;
	          cbAgentDetailState.ga4SummaryError = cbDescribeGa4Error(
	            summary?.status || null,
	            summary?.error || "ga4_api_error",
	            summary?.message || null
	          );
	        }
	      } catch (err) {
	        cbAgentDetailState.ga4Summary = null;
	        cbAgentDetailState.ga4SummaryError =
	          "Could not load GA4 metrics. Please try again later.";
	      } finally {
	        cbAgentDetailState.ga4SummaryLoading = false;
	        cbRenderAgentDetail(agent);
	      }
	    })();
	  }
}

window.cbOpenAgentDetail = cbOpenAgentDetail;

// --- Connector detail (mock) ---
const cbConnectorDetailState = {
  connector: null,
  ga4Properties: [],
  ga4Loading: false,
  ga4Error: null,
  googleAdsCustomers: [],
  googleAdsLoading: false,
  googleAdsError: null,
  googleAdsClients: [],
  googleAdsClientsLoading: false,
  googleAdsClientsError: null,
  googleAdsSelectedManagerId: null,
  googleAdsSelectedClientId: null,
};

const cbRenderConnectorDetail = (connector) => {
  if (!connector) return;
  const state = connector.supportsAuth ? cbConnectorState[connector.key] || {} : {};
  const effectiveStatus = connector.supportsAuth && state.status ? state.status : connector.status;
  const titleEl = document.getElementById("cb-connector-detail-title");
  const statusEl = document.getElementById("cb-connector-detail-status");
  const connectBtn = document.getElementById("cb-connector-detail-connect");
  const uploadBtn = document.getElementById("cb-connector-detail-upload");
  const agentsList = document.getElementById("cb-connector-detail-agents");
  const accountLine = document.getElementById("cb-connector-detail-account");

  if (titleEl) titleEl.textContent = `${connector.label || connector.key} connector`;
  if (statusEl) {
    statusEl.className = "cb-connector-status";
    const label = cbGetConnectorStatusLabel(effectiveStatus);
    statusEl.textContent = label;
    if (effectiveStatus === "available" || effectiveStatus === "connected") {
      statusEl.classList.add("is-available");
    } else if (effectiveStatus === "planned") {
      statusEl.classList.add("is-planned");
    } else if (effectiveStatus === "coming_soon" || effectiveStatus === "disconnected" || effectiveStatus === "unknown") {
      statusEl.classList.add("is-coming-soon");
    } else {
      statusEl.classList.add("is-not-planned");
    }
  }

  if (connectBtn) {
    if (connector.key === "googleads") {
      connectBtn.disabled = false;
      if (effectiveStatus === "connected") {
        connectBtn.textContent = "Disconnect";
        connectBtn.onclick = () => cbHandleGoogleAdsDisconnect();
      } else {
        connectBtn.textContent = "Connect";
        connectBtn.onclick = () => cbHandleGoogleAdsConnect();
      }
    } else if (connector.key === "ga4") {
      connectBtn.disabled = false;
      if (effectiveStatus === "connected") {
        connectBtn.textContent = "Disconnect";
        connectBtn.onclick = () => cbHandleGa4Disconnect();
      } else {
        connectBtn.textContent = "Connect";
        connectBtn.onclick = () => cbHandleGa4Connect();
      }
    } else {
      connectBtn.disabled = connector.status !== "available";
      if (connector.status === "available") {
        connectBtn.removeAttribute("title");
        connectBtn.onclick = () => cbHandleConnectorAction(connector);
      } else {
        connectBtn.title = "Coming soon";
        connectBtn.onclick = (event) => {
          event?.preventDefault?.();
          cbHandleConnectorAction(connector);
        };
      }
    }
  }

  if (uploadBtn) {
    uploadBtn.disabled = true;
    uploadBtn.title = "Planned feature";
  }

  if (agentsList) {
    agentsList.innerHTML = "";
    const agents = cbGetAgentsForConnector(connector.key);
    if (!agents.length) {
      const empty = document.createElement("p");
      empty.className = "cb-modal-note";
      empty.textContent = "No agents mapped to this connector yet.";
      agentsList.appendChild(empty);
    } else {
      agents.forEach((agent) => {
        const row = document.createElement("div");
        row.className = "cb-connector-detail-row";
        const name = document.createElement("div");
        name.className = "cb-agent-connector-name";
        name.textContent = agent.label || agent.key;
        const workspaceChip = document.createElement("span");
        workspaceChip.className = "cb-chip cb-chip-workspace";
        workspaceChip.textContent = cbGetWorkspaceLabel(agent.workspace);
        row.appendChild(name);
        row.appendChild(workspaceChip);
        agentsList.appendChild(row);
      });
    }
  }

	  if (accountLine) {
	    accountLine.innerHTML = "";
	    if (connector.key === "googleads") {
	      if (effectiveStatus !== "connected") {
	        accountLine.textContent = "Connect Google Ads first to select an account.";
	        return;
	      }
	      const parts = [];
	      if (state.lastError) {
	        accountLine.textContent = state.lastError;
	        return;
	      }
	      const hasLoginCustomerId =
	        state.loginCustomerId && state.customerId && String(state.loginCustomerId) !== String(state.customerId);
	      if (hasLoginCustomerId) parts.push(`Manager ID: ${state.loginCustomerId}`);
	      if (state.customerId) parts.push(`Customer ID: ${state.customerId}`);
	      if (state.lastSyncAt) parts.push(`Last sync: ${state.lastSyncAt}`);
	      const current = document.createElement("p");
	      current.className = "cb-modal-note";
	      current.textContent = parts.length ? parts.join(" \u00b7 ") : "Account: -";
	      accountLine.appendChild(current);
	      if (effectiveStatus === "connected") {
	        const controlsWrap = document.createElement("div");
	        controlsWrap.className = "cb-enterprise-inline";

	        const managerSelectWrap = document.createElement("div");
	        const managerLabel = document.createElement("div");
	        managerLabel.className = "cb-modal-label";
	        managerLabel.textContent = "Manager account (MCC)";

	        const managerSelect = document.createElement("select");
	        managerSelect.id = "cb-googleads-manager-select";
	        managerSelect.className = "cb-input";
	        managerSelect.disabled = !!cbConnectorDetailState.googleAdsLoading;

	        const customersLoading = cbConnectorDetailState.googleAdsLoading;
	        const customers = Array.isArray(cbConnectorDetailState.googleAdsCustomers)
	          ? cbConnectorDetailState.googleAdsCustomers
	          : [];
	        const managerDefaultOpt = document.createElement("option");
	        managerDefaultOpt.value = "";
	        managerDefaultOpt.textContent = customersLoading
	          ? "Loading accounts..."
	          : "Select a manager account";
	        managerSelect.appendChild(managerDefaultOpt);
	        customers.forEach((cust) => {
	          const opt = document.createElement("option");
	          opt.value = cust.customerId || cust.customer_id || "";
	          const label = cust.descriptiveName || cust.descriptive_name || opt.value;
	          opt.textContent = label ? `${label} (${opt.value})` : opt.value;
	          managerSelect.appendChild(opt);
	        });

	        const selectedManagerId =
	          cbConnectorDetailState.googleAdsSelectedManagerId ||
	          (state.loginCustomerId ? String(state.loginCustomerId) : state.customerId ? String(state.customerId) : "");
	        if (selectedManagerId) managerSelect.value = selectedManagerId;

	        managerSelect.addEventListener("change", () => {
	          const nextManagerId = managerSelect.value || null;
	          cbConnectorDetailState.googleAdsSelectedManagerId = nextManagerId;
	          cbConnectorDetailState.googleAdsSelectedClientId = null;
	          cbConnectorDetailState.googleAdsClients = [];
	          cbConnectorDetailState.googleAdsClientsError = null;
	          cbLoadGoogleAdsClients(nextManagerId);
	        });

	        managerSelectWrap.appendChild(managerLabel);
	        managerSelectWrap.appendChild(managerSelect);

	        const clientSelectWrap = document.createElement("div");
	        const clientLabel = document.createElement("div");
	        clientLabel.className = "cb-modal-label";
	        clientLabel.textContent = "Client under manager";

	        const clientSelect = document.createElement("select");
	        clientSelect.id = "cb-googleads-client-select";
	        clientSelect.className = "cb-input";

	        const managerId = selectedManagerId || "";
	        const clientsLoading = cbConnectorDetailState.googleAdsClientsLoading;
	        const clients = Array.isArray(cbConnectorDetailState.googleAdsClients)
	          ? cbConnectorDetailState.googleAdsClients
	          : [];

	        clientSelect.disabled = !managerId || clientsLoading;

	        const clientDefaultOpt = document.createElement("option");
	        clientDefaultOpt.value = "";
	        if (!managerId) {
	          clientDefaultOpt.textContent = "Select a manager first";
	        } else if (clientsLoading) {
	          clientDefaultOpt.textContent = "Loading clients...";
	        } else if (!clients.length) {
	          clientDefaultOpt.textContent = "No clients found";
	        } else {
	          clientDefaultOpt.textContent = "Select a client (optional)";
	        }
	        clientSelect.appendChild(clientDefaultOpt);

	        clients.forEach((client) => {
	          const opt = document.createElement("option");
	          opt.value = client.customerId || client.customer_id || "";
	          const label = client.descriptiveName || client.descriptive_name || opt.value;
	          opt.textContent = label ? `${label} (${opt.value})` : opt.value;
	          clientSelect.appendChild(opt);
	        });

	        const selectedClientId = cbConnectorDetailState.googleAdsSelectedClientId || "";
	        if (selectedClientId) clientSelect.value = selectedClientId;

	        clientSelect.addEventListener("change", () => {
	          cbConnectorDetailState.googleAdsSelectedClientId = clientSelect.value || null;
	        });

	        clientSelectWrap.appendChild(clientLabel);
	        clientSelectWrap.appendChild(clientSelect);

	        const saveBtn = document.createElement("button");
	        saveBtn.type = "button";
	        saveBtn.className = "btn btn-primary cb-modal-primary-button";
	        saveBtn.textContent = cbConnectorDetailState.googleAdsLoading ? "Saving..." : "Save";
	        const canSave = !!managerId && !cbConnectorDetailState.googleAdsLoading && !clientsLoading;
	        saveBtn.disabled = !canSave;
	        saveBtn.addEventListener("click", () => {
	          const selectedManager = (cbConnectorDetailState.googleAdsSelectedManagerId || "").trim();
	          if (!selectedManager) return;
	          const selectedClient = (cbConnectorDetailState.googleAdsSelectedClientId || "").trim();
	          const customerId = selectedClient || selectedManager;
	          const loginCustomerId = selectedClient && selectedClient !== selectedManager ? selectedManager : null;
	          cbSaveGoogleAdsCustomer(customerId, loginCustomerId);
	        });

	        controlsWrap.appendChild(managerSelectWrap);
	        controlsWrap.appendChild(clientSelectWrap);
	        controlsWrap.appendChild(saveBtn);
	        accountLine.appendChild(controlsWrap);

	        if (cbConnectorDetailState.googleAdsClientsError) {
	          const err = document.createElement("p");
	          err.className = "cb-form-error";
	          err.textContent = cbConnectorDetailState.googleAdsClientsError;
	          accountLine.appendChild(err);
	        }

	        if (cbConnectorDetailState.googleAdsError) {
	          const err = document.createElement("p");
	          err.className = "cb-form-error";
	          err.textContent = cbConnectorDetailState.googleAdsError;
	          accountLine.appendChild(err);
	        } else if (!customersLoading && !customers.length) {
	          const none = document.createElement("p");
	          none.className = "cb-modal-note";
	          none.textContent = "No accounts found. Check your Google Ads access.";
	          accountLine.appendChild(none);
	        }
	      }
	    } else if (connector.key === "ga4") {
      if (state.lastError) {
        accountLine.textContent = state.lastError;
        return;
      }
	      if (state.propertyId) {
	        const current = document.createElement("p");
	        current.className = "cb-modal-note";
	        const props = Array.isArray(cbConnectorDetailState.ga4Properties)
	          ? cbConnectorDetailState.ga4Properties
	          : [];
	        const match = props.find((p) => {
	          const pid = p?.propertyId || p?.id || p?.property_id || null;
	          return pid && String(pid) === String(state.propertyId);
	        });
	        const displayName = match?.displayName || match?.name || null;
	        const label = displayName ? `${displayName} (${state.propertyId})` : state.propertyId;
	        current.textContent = `Property: ${label}${state.lastSyncAt ? ` · Last sync: ${state.lastSyncAt}` : ""}`;
	        accountLine.appendChild(current);
	      } else {
	        const hint = document.createElement("p");
	        hint.className = "cb-modal-note";
        hint.textContent = "No property selected yet.";
        accountLine.appendChild(hint);
      }
      if (effectiveStatus === "connected") {
        const propsWrap = document.createElement("div");
        propsWrap.className = "cb-enterprise-inline";

        const select = document.createElement("select");
        select.id = "cb-ga4-property-select";
        select.className = "cb-input";
        select.disabled = !!cbConnectorDetailState.ga4Loading;
        const loading = cbConnectorDetailState.ga4Loading;
        const properties = Array.isArray(cbConnectorDetailState.ga4Properties)
          ? cbConnectorDetailState.ga4Properties
          : [];
        const defaultOpt = document.createElement("option");
        defaultOpt.value = "";
        defaultOpt.textContent = loading ? "Loading properties..." : "Select a property";
        select.appendChild(defaultOpt);
        properties.forEach((prop) => {
          const opt = document.createElement("option");
          opt.value = prop.propertyId || prop.id || prop.property_id || "";
          const label = prop.displayName || prop.name || opt.value;
          opt.textContent = label ? `${label} (${opt.value})` : opt.value;
          select.appendChild(opt);
        });
	        if (state.propertyId) select.value = state.propertyId;
	
	        const saveBtn = document.createElement("button");
	        saveBtn.type = "button";
	        saveBtn.className = "btn btn-primary";
	        saveBtn.textContent = cbConnectorDetailState.ga4Loading ? "Saving..." : "Save";
	        const updateSaveState = () => {
	          saveBtn.disabled = cbConnectorDetailState.ga4Loading || !select.value;
	        };
	        updateSaveState();
	        select.addEventListener("change", updateSaveState);
	        saveBtn.addEventListener("click", () => {
	          const value = select.value;
	          if (!value) return;
	          cbSaveGa4Property(value);
	        });

        propsWrap.appendChild(select);
        propsWrap.appendChild(saveBtn);
        accountLine.appendChild(propsWrap);

        if (cbConnectorDetailState.ga4Error) {
          const err = document.createElement("p");
          err.className = "cb-form-error";
          err.textContent = cbConnectorDetailState.ga4Error;
          accountLine.appendChild(err);
        } else if (!loading && !properties.length) {
          const none = document.createElement("p");
          none.className = "cb-modal-note";
          none.textContent = "No properties found. Check your GA4 access.";
          accountLine.appendChild(none);
        }
      } else {
        const hint = document.createElement("p");
        hint.className = "cb-modal-note";
        hint.textContent = "Connect GA4 first to select a property.";
        accountLine.appendChild(hint);
      }
    } else {
      accountLine.textContent =
        connector.category === "agency" ? "Account / MCC: -" : "Account: -";
    }
  }
};

function cbOpenConnectorDetail(connectorKey) {
  const connector = cbResolveConnectorByKey(connectorKey);
  if (!connector) {
    console.warn("[CB_CONNECTOR_DETAIL] Connector not found", connectorKey);
    return;
  }
  cbConnectorDetailState.ga4Properties = [];
  cbConnectorDetailState.ga4Error = null;
  cbConnectorDetailState.ga4Loading = false;
  cbConnectorDetailState.googleAdsCustomers = [];
  cbConnectorDetailState.googleAdsError = null;
  cbConnectorDetailState.googleAdsLoading = false;
  cbConnectorDetailState.googleAdsClients = [];
  cbConnectorDetailState.googleAdsClientsError = null;
  cbConnectorDetailState.googleAdsClientsLoading = false;
  cbConnectorDetailState.googleAdsSelectedManagerId = null;
  cbConnectorDetailState.googleAdsSelectedClientId = null;
  cbConnectorDetailState.connector = connector;
  cbRenderConnectorDetail(connector);
  if (connector.key === "ga4") {
    const state = cbConnectorState.ga4 || {};
    if (state.status === "connected") {
      cbLoadGa4Properties();
    }
	  } else if (connector.key === "googleads") {
	    const state = cbConnectorState.googleads || {};
	    if (state.status === "connected") {
	      const selectedManagerId = state.loginCustomerId || state.customerId || null;
	      cbConnectorDetailState.googleAdsSelectedManagerId = selectedManagerId ? String(selectedManagerId) : null;
	      cbConnectorDetailState.googleAdsSelectedClientId =
	        state.loginCustomerId && state.customerId ? String(state.customerId) : null;
	      cbLoadGoogleAdsCustomers();
	      if (selectedManagerId) {
	        cbLoadGoogleAdsClients(selectedManagerId);
	      }
	    }
	  }
  openModal("cb-connector-detail-modal");
}

window.cbOpenConnectorDetail = cbOpenConnectorDetail;


const cbAccountBillingState = {
  loading: false,
};

function cbRenderAccountBilling(summary, { loading = false, error = null } = {}) {
  const guestBlock = document.getElementById("cb-account-billing-guest");
  const contentBlock = document.getElementById("cb-account-billing-content");
  const connectBtn = document.getElementById("cb-account-billing-connect");
  const planNameEl = document.getElementById("cb-account-plan-name");
  const planPriceEl = document.getElementById("cb-account-plan-price");
  const planStatusEl = document.getElementById("cb-account-plan-status");
  const planNextChargeEl = document.getElementById("cb-account-plan-next-charge");
  const planMessageEl = document.getElementById("cb-account-plan-message");
  const changeBtn = document.getElementById("cb-account-plan-change");
  const manageBtn = document.getElementById("cb-account-plan-manage");
  const allowanceEl = document.getElementById("cb-account-tokens-allowance");
  const usageEl = document.getElementById("cb-account-tokens-usage");
  const progressFill = document.getElementById("cb-account-tokens-progress-fill");
  const warningEl = document.getElementById("cb-account-tokens-warning");
  const workspaceEl = document.getElementById("cb-account-limit-workspaces");
  const projectsEl = document.getElementById("cb-account-limit-projects");
  const agentsEl = document.getElementById("cb-account-limit-agents");
  const supportLink = document.getElementById("cb-account-support-contact");

  configureConnectButton(connectBtn, "cb-account-billing");

  if (!cbIsAuthenticated()) {
    if (guestBlock) guestBlock.hidden = false;
    if (contentBlock) contentBlock.hidden = true;
    return;
  }

  if (guestBlock) guestBlock.hidden = true;
  if (contentBlock) contentBlock.hidden = false;

  if (!summary) {
    if (planNameEl) planNameEl.textContent = loading ? "Loading plan..." : "Plan unavailable";
    if (planStatusEl) planStatusEl.textContent = "";
    if (planNextChargeEl) {
      planNextChargeEl.textContent = "";
      planNextChargeEl.hidden = true;
    }
    if (planPriceEl) planPriceEl.textContent = "—";
    if (allowanceEl) allowanceEl.textContent = "Monthly allowance: n/a";
    if (usageEl) usageEl.textContent = "Used: n/a · Remaining: n/a";
    if (progressFill) progressFill.style.width = "0%";
    if (warningEl) warningEl.hidden = true;
    if (planMessageEl) {
      if (loading) {
        planMessageEl.textContent = "Loading billing details...";
        planMessageEl.hidden = false;
      } else {
        planMessageEl.textContent = "";
        planMessageEl.hidden = true;
      }
    }
    if (changeBtn) {
      changeBtn.disabled = true;
      changeBtn.onclick = null;
    }
    if (manageBtn) {
      manageBtn.disabled = true;
      manageBtn.onclick = null;
    }
    return;
  }

  const planCode = cbNormalizePlanCode(summary.plan);
  const planLabel =
    summary.plan?.label ||
    PLAN_DEFINITIONS[planCode]?.label ||
    "CoolBits Starter";
  const priceText = summary.plan
    ? cbFormatPlanPrice(summary.plan)
    : cbFormatPlanPrice(PLAN_DEFINITIONS[planCode]);

  if (planNameEl) {
    planNameEl.textContent = summary.trial?.active ? `${planLabel} (trial)` : planLabel;
  }
  if (planPriceEl) {
    planPriceEl.textContent = priceText;
  }

  const stripeStatusRaw = (summary?.stripe?.status || "")
    .toString()
    .toLowerCase();
  let planStatusText = "Status unavailable";
  if (stripeStatusRaw) {
    if (stripeStatusRaw === "trialing") {
      planStatusText = "Trialing";
    } else if (stripeStatusRaw === "active") {
      planStatusText = "Active subscription";
    } else {
      planStatusText =
        stripeStatusRaw.charAt(0).toUpperCase() + stripeStatusRaw.slice(1);
    }
  } else if (summary.trial?.active) {
    planStatusText = "Trial active";
  }

  if (summary.trial?.active && summary.trial?.endsAt) {
    planStatusText += ` · Trial ends ${cbFormatFriendlyDate(summary.trial.endsAt)}`;
  }
  if (planStatusEl) {
    planStatusEl.textContent = planStatusText;
  }

  if (planNextChargeEl) {
    const periodText = cbFormatPeriodRange(
      summary?.usage?.periodStart || summary?.usage?.period_start,
      summary?.usage?.periodEnd || summary?.usage?.period_end
    );
    if (periodText) {
      planNextChargeEl.textContent = `Current period: ${periodText}`;
      planNextChargeEl.hidden = false;
    } else {
      planNextChargeEl.textContent = "";
      planNextChargeEl.hidden = true;
    }
  }

  const usageMetrics = cbDeriveUsageMetrics(summary);
  const {
    tokensIncluded,
    tokensRemaining,
    tokensUsed,
    progressRatio,
    showLowTokens,
  } = usageMetrics;

  if (allowanceEl) {
    allowanceEl.textContent = tokensIncluded
      ? `Monthly allowance: ${formatTokens(tokensIncluded)} tokens`
      : "Monthly allowance: n/a";
  }
  if (usageEl) {
    const usedText =
      typeof tokensUsed === "number" ? formatTokens(Math.max(0, tokensUsed)) : "n/a";
    const remainingText =
      typeof tokensRemaining === "number"
        ? formatTokens(Math.max(0, tokensRemaining))
        : "n/a";
    const pctUsed = tokensIncluded
      ? Math.min(100, Math.max(0, (tokensUsed / tokensIncluded) * 100))
      : null;
    const pctLabel = pctUsed !== null && Number.isFinite(pctUsed) ? ` (${pctUsed.toFixed(1)}%)` : "";
    usageEl.textContent = `Used: ${usedText}${tokensIncluded ? ` / ${formatTokens(tokensIncluded)}` : ""} cbT${pctLabel} · Remaining: ${remainingText}`;
  }
  if (progressFill) {
    const pct = Math.round((progressRatio || 0) * 100);
    progressFill.style.width = `${pct}%`;
    progressFill.classList.remove("is-warning", "is-danger");
    if (pct >= 100) {
      progressFill.classList.add("is-danger");
    } else if (pct >= 80) {
      progressFill.classList.add("is-warning");
    }
  }
  if (warningEl) {
    const pct = Math.round((progressRatio || 0) * 100);
    if (pct >= 100) {
      warningEl.textContent =
        "Limit reached for this period. New messages are blocked until the next reset.";
      warningEl.hidden = false;
    } else if (pct >= 80) {
      warningEl.textContent =
        "You have used more than 80% of your cbT for this period.";
      warningEl.hidden = false;
    } else {
      warningEl.hidden = true;
    }
  }

  const formatLimitLine = (currentValue, limitValue) => {
    const currentLabel =
      typeof currentValue === "number" ? currentValue : currentValue || "–";
    if (limitValue === "all") {
      return `${currentLabel} / Unlimited`;
    }
    return `${currentLabel} / ${limitValue ?? "–"}`;
  };

  const currentWorkspaces =
    Array.isArray(cbCurrentUser?.workspacesSelected) &&
    cbCurrentUser.workspacesSelected.length
      ? cbCurrentUser.workspacesSelected.length
      : Array.isArray(cbCurrentUser?.workspacesAllowed)
      ? cbCurrentUser.workspacesAllowed.length
      : "–";
  const currentProjects =
    Array.isArray(cbCurrentUser?.projects) && cbCurrentUser.projects.length
      ? cbCurrentUser.projects.length
      : "–";
  const currentAgents =
    Array.isArray(cbCurrentUser?.councilMembers) &&
    cbCurrentUser.councilMembers.length
      ? cbCurrentUser.councilMembers.length
      : "–";

  if (workspaceEl) {
    workspaceEl.textContent = `Workspaces: ${formatLimitLine(
      currentWorkspaces,
      summary?.limits?.workspaces ?? PLAN_DEFINITIONS[planCode]?.workspacesCount
    )}`;
  }
  if (projectsEl) {
    projectsEl.textContent = `Projects: ${formatLimitLine(
      currentProjects,
      summary?.limits?.projects ?? PLAN_DEFINITIONS[planCode]?.projects
    )}`;
  }
  if (agentsEl) {
    agentsEl.textContent = `AI agents: ${formatLimitLine(
      currentAgents,
      summary?.limits?.agents ?? PLAN_DEFINITIONS[planCode]?.agents
    )}`;
  }

  if (supportLink) {
    supportLink.href = "mailto:office@coolbits.ai?subject=CoolBits%20Billing";
  }

  let planMessage = "";
  if (error) {
    planMessage = error;
  } else if (cbPendingBillingSuccessMessage) {
    planMessage = "Subscription updated. You're all set!";
    cbPendingBillingSuccessMessage = false;
  } else if (stripeStatusRaw === "active" || stripeStatusRaw === "trialing") {
    planMessage = "Contact support to cancel or change billing details.";
  }
  if (planMessageEl) {
    if (planMessage) {
      planMessageEl.textContent = planMessage;
      planMessageEl.hidden = false;
    } else {
      planMessageEl.textContent = "";
      planMessageEl.hidden = true;
    }
  }

  if (changeBtn) {
    changeBtn.disabled = false;
    changeBtn.textContent = "Change plan";
    changeBtn.onclick = (event) => {
      event?.preventDefault?.();
      cbOpenPlansModal({
        source: "billing",
        highlightPlan: planCode,
        summary,
      });
    };
  }
  if (manageBtn) {
    manageBtn.disabled = false;
    manageBtn.onclick = (event) => {
      event?.preventDefault?.();
      cbOpenManageSubscription();
    };
  }
}

const cbAccountBillingNeedsRefresh = () => {
  const now = Date.now();
  return (
    !cbLatestBillingSummary ||
    now - cbLastBillingSummaryAt > CB_BILLING_SUMMARY_TTL
  );
};

const cbOpenAccountBilling = async ({ view = "overview" } = {}) => {
  cbSetAccountView(view);
  cbRenderConnectorsPanel();
   cbRefreshConnectorStatuses();
  openModal("cb-account-billing");
  cbRenderAccountBilling(cbLatestBillingSummary, {
    loading: cbAccountBillingState.loading || !cbLatestBillingSummary,
  });
  if (!cbIsAuthenticated()) {
    return;
  }
  if (!cbAccountBillingNeedsRefresh()) {
    return;
  }
  cbAccountBillingState.loading = true;
  try {
    await fetchBillingSummary();
  } catch (error) {
    console.error("[BILLING] account panel fetch failed", error);
    cbRenderAccountBilling(cbLatestBillingSummary, {
      error: "Unable to load billing details. Please try again.",
    });
  } finally {
    cbAccountBillingState.loading = false;
    cbRenderAccountBilling(cbLatestBillingSummary);
  }
};

const setupAccountBillingEntryPoints = () => {
  const accountItem = document.getElementById("cb-user-menu-account");
  if (accountItem && accountItem.dataset.bound !== "true") {
    accountItem.addEventListener("click", async () => {
      hideUserMenu();
      await cbOpenAccountBilling();
    });
    accountItem.dataset.bound = "true";
  }
  const planMenuButton = document.getElementById("cb-user-menu-plan");
  if (planMenuButton && planMenuButton.dataset.bound !== "true") {
    planMenuButton.addEventListener("click", async () => {
      hideUserMenu();
      await cbOpenAccountBilling();
    });
    planMenuButton.dataset.bound = "true";
  }
};

const setupSupportContactLinks = () => {
  const link = document.getElementById("cb-account-support-contact");
  const button = document.getElementById("cb-account-support-btn");
  [link, button].forEach((el) => {
    if (el && el.dataset.bound !== "true") {
      el.addEventListener("click", (event) => {
        event?.preventDefault?.();
        cbOpenSupportContactForm();
      });
      el.dataset.bound = "true";
    }
  });
};

const cbShowBillingToast = (type = "success", messageOverride = "") => {
  const toast = document.getElementById("cb-billing-toast");
  if (!toast) return;
  if (!toast.dataset.styled) {
    toast.style.position = "fixed";
    toast.style.bottom = "24px";
    toast.style.right = "24px";
    toast.style.background = "rgba(15,23,42,0.9)";
    toast.style.color = "#f8fafc";
    toast.style.padding = "12px 16px";
    toast.style.borderRadius = "8px";
    toast.style.boxShadow = "0 10px 25px rgba(0,0,0,0.35)";
    toast.style.zIndex = "9999";
    toast.dataset.styled = "true";
  }
  const message =
    messageOverride ||
    (type === "cancel"
      ? "You canceled the billing update. Your current plan is unchanged."
      : "Your CoolBits subscription was updated successfully.");
  toast.textContent = message;
  toast.hidden = false;
  if (cbBillingToastTimeout) {
    clearTimeout(cbBillingToastTimeout);
  }
  cbBillingToastTimeout = setTimeout(() => {
    toast.hidden = true;
  }, 5000);
};

const cbShowBillingSuccessNotice = () => {
  cbShowBillingToast("success");
};

const cbHandleStripeReturn = () => {
  try {
    const params = new URLSearchParams(window.location.search || "");
    const billingStatus = (params.get("billing") || "").toLowerCase();
    if (billingStatus === "success" || billingStatus === "cancel") {
      params.delete("billing");
      const newQuery = params.toString();
      const newUrl = `${window.location.pathname}${
        newQuery ? `?${newQuery}` : ""
      }${window.location.hash}`;
      window.history.replaceState({}, "", newUrl);
      if (billingStatus === "success") {
        cbPendingBillingSuccessMessage = true;
        fetchBillingSummary()
          .then(() => cbShowBillingToast("success"))
          .catch((error) => {
            console.warn("[BILLING] summary refresh after success failed", error);
            cbShowBillingToast("success");
          });
      } else {
        cbShowBillingToast("cancel");
      }
      return;
    }
  const stripeStatus = params.get("stripe");
  if (stripeStatus !== "success") {
    return;
  }
    params.delete("stripe");
    const newQuery = params.toString();
    const newUrl = `${window.location.pathname}${
      newQuery ? `?${newQuery}` : ""
    }${window.location.hash}`;
    window.history.replaceState({}, "", newUrl);
    cbPendingBillingSuccessMessage = true;
    fetchBillingSummary()
      .then(() => cbShowBillingSuccessNotice())
      .catch(() => cbShowBillingSuccessNotice());
  } catch (error) {
    console.warn("[BILLING] Stripe return parse failed", error);
  }
};

const cbHandleConnectorReturn = async () => {
  try {
    const params = new URLSearchParams(window.location.search || "");
    const connector = (params.get("connector") || "").toLowerCase();
    const status = (params.get("status") || "").toLowerCase();
    const errorCode = (params.get("error") || "").trim();
    const message = params.get("message") || "";
    if (connector !== "googleads" && connector !== "ga4") return;

    params.delete("connector");
    params.delete("status");
    params.delete("error");
    params.delete("message");
    const newQuery = params.toString();
    const newUrl = `${window.location.pathname}${newQuery ? `?${newQuery}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", newUrl);

    const isGoogleAds = connector === "googleads";
    const connectorLabel = isGoogleAds ? "Google Ads" : "GA4";
    if (status === "success") {
      cbShowBillingToast("success", `${connectorLabel} was connected successfully.`);
      await cbRefreshConnectorStatuses();
    } else if (status === "error") {
      let toastMessage = `We could not connect ${connectorLabel}${errorCode ? ` (${errorCode})` : ""}. Please try again.`;
      if (errorCode === "not_configured") {
        toastMessage = `${connectorLabel} is not configured on the server (not_configured).`;
	      } else if (errorCode === "missing_code") {
	        toastMessage = `Google did not return an authorization code (missing_code). Please try again.`;
	      } else if (errorCode === "token_exchange_failed") {
	        toastMessage = `Google token exchange failed (token_exchange_failed). Please try again.`;
	      } else if (errorCode === "storage_failed") {
	        toastMessage = `${connectorLabel} connected at Google, but the server could not save the token (storage_failed). Please try again.`;
	      } else if (errorCode === "missing_refresh_token") {
	        toastMessage = `Google did not return a refresh token (missing_refresh_token). Please try again (and make sure you grant consent).`;
	      } else if (errorCode === "invalid_grant") {
	        toastMessage = `Google returned invalid_grant (invalid_grant). Please try again; if it persists, verify the OAuth redirect URI configuration.`;
	      } else if (errorCode === "access_denied") {
	        toastMessage = `Authorization was cancelled (access_denied).`;
	      } else if (errorCode === "redirect_uri_mismatch") {
	        toastMessage = `Redirect URI mismatch (redirect_uri_mismatch). Please confirm the authorized redirect URI.`;
	      }
      cbShowBillingToast("cancel", toastMessage);

      const logPayload = {};
      if (errorCode) logPayload.error = errorCode;
      if (message) logPayload.message = message;
      if (Object.keys(logPayload).length > 0) {
        console.error(isGoogleAds ? "[CONNECTOR_GOOGLE_ADS]" : "[CONNECTOR_GA4]", logPayload);
      }
      await cbRefreshConnectorStatuses();
    }
  } catch (error) {
    console.error("[CONNECTOR_RETURN]", error);
  }
};


const downgradeToStarter = async () => {
  const token = cbGetAuthToken();
  if (!token) {
    console.warn("[BILLING] downgrade requested without auth");
    return { success: false, error: "Please log in before downgrading." };
  }
  try {
    const response = await fetch(API_BILLING_DOWNGRADE, {
      method: "POST",
      headers: cbGetAuthHeaders({ "Content-Type": "application/json" }),
      credentials: "include",
    });
    const payload = await safeJson(response);
    if (!response.ok) {
      const errText = payload?.error || "Downgrade failed. Please try again.";
      console.warn("[BILLING] downgrade error", response.status);
      return { success: false, error: errText };
    }
    if (payload?.user) {
      cbApplyAuthPayload(payload.user);
    }
    await refreshAccountUsage();
    return { success: true };
  } catch (error) {
    console.error("[BILLING] downgrade exception", error);
    return { success: false, error: "Network error during downgrade. Please try again." };
  }
};

const handleBillingDowngrade = async (event) => {
  const button = event?.currentTarget;
  setBillingError("");
  if (button) {
    button.disabled = true;
  }
  try {
    const result = await downgradeToStarter();
    if (!result.success) {
      setBillingError(result.error || "Downgrade failed. Please try again.");
      return;
    }
    await populateBillingModal();
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
};

const handleModalKeydown = (event) => {
  if (event.key === "Escape" && activeModalId) {
    closeModal(activeModalId);
  }
};

const hideUserMenu = () => {
  const menu = document.getElementById("cb-user-menu");
  const button = document.getElementById("cb-user-button");
  userMenuOpen = false;
  if (menu) {
    menu.classList.remove("is-open");
    menu.setAttribute("aria-hidden", "true");
    cbResetFloatingMenuStyles(menu, { isUserMenu: true });
  }
  if (button) {
    button.setAttribute("aria-expanded", "false");
  }
};

const showUserMenu = () => {
  if (!cbCurrentUser) {
    return;
  }
  const menu = document.getElementById("cb-user-menu");
  const button = document.getElementById("cb-user-button");
  if (!menu || !button) {
    return;
  }
  if (userMenuOpen) {
    return;
  }
  menu.classList.add("is-open");
  menu.setAttribute("aria-hidden", "false");
  button.setAttribute("aria-expanded", "true");
  userMenuOpen = true;
  cbPositionUserMenu();
};

const toggleUserMenu = () => {
  if (userMenuOpen) {
    hideUserMenu();
  } else {
    showUserMenu();
  }
};

const cbOpenProfile = async () => {
  await populateProfileModal();
  openModal("cb-profile-modal");
};

const cbOpenBilling = async () => {
  await populateBillingModal();
  openModal("cb-billing-modal");
};

const cbOpenSettings = () => {
  syncSettingsUI();
  openModal("cb-settings-modal");
};

const cbSignOut = () => {
  console.log("[USER] Sign out clicked");
  clearAuthState();
  closeAllModals();
  hideUserMenu();
  focusChatInput();
};

const setupUserMenuHandlers = () => {
  const profileItem = document.getElementById("cb-user-menu-profile");
  const settingsItem = document.getElementById("cb-user-menu-settings");
  const signOutItem = document.getElementById("cb-menu-signout");

  if (profileItem) {
    profileItem.addEventListener("click", async () => {
      hideUserMenu();
      await cbOpenProfile();
    });
  }
  if (settingsItem) {
    settingsItem.addEventListener("click", () => {
      hideUserMenu();
      cbOpenSettings();
    });
  }
  if (signOutItem) {
    signOutItem.addEventListener("click", () => {
      cbSignOut();
    });
  }
};

const handleUserMenuOutsideClick = (event) => {
  if (!userMenuOpen) {
    return;
  }
  const menu = document.getElementById("cb-user-menu");
  const button = document.getElementById("cb-user-button");
  if (!menu || !button) {
    return;
  }
  const target = event.target;
  if (menu.contains(target) || button.contains(target)) {
    return;
  }
  hideUserMenu();
};

const handleUserMenuKeydown = (event) => {
  if (!userMenuOpen || event.key !== "Escape") {
    return;
  }
  hideUserMenu();
};

document.addEventListener("click", handleUserMenuOutsideClick);
document.addEventListener("keydown", handleUserMenuKeydown);
document.addEventListener("keydown", handleModalKeydown);

async function cbHandleOAuthSuccess(payload) {
  if (!payload || typeof payload !== "object") {
    console.warn("[CB_AUTH_LOGIN] invalid payload", payload);
    return;
  }
  const token = payload.token;
  if (!token || typeof token !== "string") {
    console.warn("[CB_AUTH_LOGIN] missing token in payload", payload);
    return;
  }
  try {
    window.localStorage.setItem("cb_token", token);
  } catch (error) {
    console.warn("[CB_AUTH_LOGIN] unable to persist cb_token", error);
  }
  try {
    const response = await fetch("/api/auth/me", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
    });
    console.log("[CB_AUTH_LOGIN] /api/auth/me status", response.status);
    if (!response.ok) {
      return;
    }
    const data = await response.json();
    const user = data?.user || data;
    const label =
      user?.name ||
      user?.email ||
      user?.username ||
      "Logged in";
    if (typeof window.cbUpdateAuthBadgeText === "function") {
      window.cbUpdateAuthBadgeText(label);
      return;
    }
    const fallbackBadge =
      document.querySelector(".cb-user-badge-email") ||
      document.querySelector("#cb-user-badge");
    if (fallbackBadge) {
      fallbackBadge.textContent = label;
    }
  } catch (error) {
    console.error("[CB_AUTH_LOGIN] error calling /api/auth/me", error);
  }
}

const handleOAuthMessage = async (event) => {
  if (!event || !event.data || event.data.source !== "coolbits-oauth") {
    return;
  }

  if (event.origin !== window.location.origin) {
    console.warn("[OAUTH] ignoring message from unexpected origin", event.origin);
    return;
  }

  let rawPayload = event.data.payload;
  let payload = rawPayload;
  if (typeof rawPayload === "string") {
    try {
      payload = JSON.parse(rawPayload);
    } catch (err) {
      console.warn("[OAUTH] failed to parse payload string", err, rawPayload);
      payload = null;
    }
  }

  if (!payload) {
    console.warn("[OAUTH] empty payload", event.data);
    setOnboardingError("Google sign-in failed. Please try again.");
    return;
  }

  if (payload.error) {
    console.warn("[OAUTH] error payload", payload.error);
    setOnboardingError("Google sign-in failed. Please try again.");
    if (cbGooglePopup && !cbGooglePopup.closed) {
      try {
        cbGooglePopup.close();
      } catch (err) {
        console.warn("[OAUTH] failed to close popup after error", err);
      }
    }
    return;
  }

  const token = payload.token;
  const user = payload.user;
  const returnTo = typeof payload.returnTo === "string" ? payload.returnTo : "/chat";

  if (!token || !user) {
    console.warn("[OAUTH] missing token or user", { source: event.data.source, payload });
    setOnboardingError("We couldn't complete sign-in. Please try again.");
    if (cbGooglePopup && !cbGooglePopup.closed) {
      try {
        cbGooglePopup.close();
      } catch (err) {
        console.warn("[OAUTH] failed to close popup after missing token/user", err);
      }
    }
    return;
  }

  setOnboardingError("");
  cbSetAuthToken(token);
  clearComposerError();
  elements.error?.setAttribute("hidden", "true");
  if (elements.button) {
    elements.button.removeAttribute("disabled");
  }
  if (elements.input) {
    elements.input.removeAttribute("disabled");
  }
  isSending = false;
  let authPayload = await cbFetchAndApplyAuthMe();
  if (!authPayload && user) {
    console.warn("[OAUTH] auth/me unavailable, falling back to popup payload");
    cbApplyAuthPayload(user);
  }
  cbMaybeSendPendingSeed();

  closeOnboardingModal();
  focusChatInput();
  if (cbGooglePopup && !cbGooglePopup.closed) {
    try {
      cbGooglePopup.close();
    } catch (err) {
      console.warn("[OAUTH] failed to close popup", err);
    }
  }
  cbGooglePopup = null;

  cbHandleOAuthSuccess(payload);

  if (!cbHasSeenPlansModal()) {
    try {
      const onboardingSummary = await fetchBillingSummary();
      cbMaybeShowPlansAfterLogin(onboardingSummary);
    } catch (error) {
      console.warn("[PLANS] onboarding fetch failed", error);
    }
  }

  console.log("[OAUTH] login success", {
    email: user?.email,
    planId: user?.planId,
    tokensRemaining: user?.tokensRemaining,
    returnTo,
  });
};
window.addEventListener("message", handleOAuthMessage);

const setupUpgradeButton = () => {
  const upgradeBtn = document.getElementById("cb-upgrade-button");
  if (!upgradeBtn) {
    return;
  }
  upgradeBtn.addEventListener("click", (event) => {
    event.preventDefault();
    cbOpenPlansModal({ source: "menu", highlightPlan: "agency", summary: cbLatestBillingSummary });
  });
};

const setupUserButton = () => {
  const button = document.getElementById("cb-user-button");
  if (!button) return;
  button.onclick = () => {
    if (!cbCurrentUser) {
      openOnboardingModal();
    } else {
      toggleUserMenu();
    }
  };
};

const setupOnboardingModalHandlers = () => {
  const notNowBtn = document.getElementById("cb-onboarding-not-now");
  const googleBtn = document.getElementById("cb-onboarding-google");

  if (notNowBtn) {
    notNowBtn.addEventListener("click", () => {
      closeOnboardingModal();
      focusChatInput();
    });
  }

  if (googleBtn) {
    googleBtn.addEventListener("click", () => {
      startGoogleLogin();
    });
  }
};

const setupGuestHintHandlers = () => {
  const guestButtons = document.querySelectorAll("[data-guest-login]");
  guestButtons.forEach((button) => {
    if (button.dataset.guestLoginBound === "true") {
      return;
    }
    button.addEventListener("click", (event) => {
      event.preventDefault();
      if (!cbIsAuthenticated()) {
        cbRequireAuthForChat("guest-hint");
      } else {
        focusChatInput();
      }
    });
    button.dataset.guestLoginBound = "true";
  });
};

const setupCouncilControls = () => {
  const button = shellElements.councilButton;
  if (button && button.dataset.councilBound !== "true") {
    button.addEventListener("click", () => {
      const isOpen = button.getAttribute("aria-expanded") === "true";
      cbToggleCouncilPopover(!isOpen);
    });
    button.dataset.councilBound = "true";
  }
  const agentsButton =
    shellElements.councilAgentsButton || document.getElementById("cb-council-agents-btn");
  if (agentsButton && agentsButton.dataset.councilAgentsBound !== "true") {
    agentsButton.addEventListener("click", (event) => {
      event.preventDefault();
      const url = cbBuildAgentsDirectoryUrl({ includeWorkspace: true });
      if (typeof cbOnCouncilModalClose === "function") {
        cbOnCouncilModalClose();
      } else if (typeof closeModal === "function") {
        closeModal("cb-council-popover", { silentFocus: true });
      }
      window.location.href = url;
    });
    agentsButton.dataset.councilAgentsBound = "true";
  }
  cbRenderCouncilList();
  cbInitCouncilChip();
  cbSyncCouncilUI();
};

const cbEnsureAgentsViewInitialized = () => {
  if (!cbAgentsState.initialized) {
    setupAgentsView();
    cbAgentsState.initialized = true;
  }
  cbUpdateAgentsAuthState();
  if (cbIsAuthenticated() && !cbAgentsState.registryLoaded) {
    cbFetchAgentsRegistry();
  }
};

const cbDashboardRouterState = {
  bound: false,
  current: "chat",
};

const cbNormalizeDashboardViewParam = (value) => {
  const v = (value || "").toString().trim().toLowerCase();
  if (v === "ga4") return "ga4";
  if (v === "googleads") return "googleads";
  if (v === "agents") return "agents";
  return "chat";
};

const cbViewParamToMainView = (param) => {
  const view = cbNormalizeDashboardViewParam(param);
  if (view === "ga4") return "ga4-dashboard";
  if (view === "googleads") return "googleads-dashboard";
  if (view === "agents") return "agents";
  return "chat";
};

const cbUpdateSidebarViewHighlight = (activeParam) => {
  const normalized = cbNormalizeDashboardViewParam(activeParam);
  const buttons = document.querySelectorAll("[data-sidebar-view]");
  buttons.forEach((btn) => {
    const target = cbNormalizeDashboardViewParam(btn.dataset.sidebarView);
    const isActive = target === normalized;
    btn.classList.toggle("is-active", isActive);
  });

  const connectorsToggle = shellElements.connectorsToggle || document.getElementById("cb-connectors-toggle");
  const connectorsActive = normalized === "ga4" || normalized === "googleads";
  if (connectorsToggle) {
    connectorsToggle.classList.toggle("is-active", connectorsActive);
  }

  const agentsButton =
    shellElements.agentsButton || document.querySelector("[data-sidebar-agents]");
  if (agentsButton) {
    agentsButton.classList.toggle("is-active", normalized === "agents");
  }
};

const cbApplyDashboardView = (viewParam) => {
  const normalized = cbNormalizeDashboardViewParam(viewParam);
  const mainView = cbViewParamToMainView(normalized);
  cbDashboardRouterState.current = normalized;
  cbSwitchMainView(mainView);
  cbUpdateSidebarViewHighlight(normalized);
  if (normalized === "ga4" && typeof cbInitGa4Dashboard === "function") {
    cbInitGa4Dashboard();
  } else if (normalized === "googleads" && typeof cbInitGoogleAdsDashboard === "function") {
    cbInitGoogleAdsDashboard();
  }
};

const cbSetDashboardView = (viewParam, { replace = false } = {}) => {
  const normalized = cbNormalizeDashboardViewParam(viewParam);
  const params = new URLSearchParams(window.location.search || "");
  if (normalized === "chat") {
    params.delete("view");
  } else {
    params.set("view", normalized);
  }
  const newQuery = params.toString();
  const newUrl = `${window.location.pathname}${newQuery ? `?${newQuery}` : ""}${window.location.hash || ""}`;
  window.history[replace ? "replaceState" : "pushState"]({}, "", newUrl);
  cbApplyDashboardView(normalized);
};

const cbSyncDashboardViewFromUrl = () => {
  const params = new URLSearchParams(window.location.search || "");
  const view = params.get("view");
  cbApplyDashboardView(view);
};

const cbSwitchMainView = (view) => {
  const views = document.querySelectorAll(".cb-main-view");
  views.forEach((container) => {
    const isMatch = container.dataset.view === view;
    container.hidden = !isMatch;
    container.classList.toggle("is-active", isMatch);
  });
  const tabs = document.querySelectorAll("[data-view-target]");
  tabs.forEach((tab) => {
    const isSelected = tab.dataset.viewTarget === view;
    tab.classList.toggle("is-active", isSelected);
    tab.setAttribute("aria-selected", isSelected ? "true" : "false");
  });
  if (view === "agents") {
    cbEnsureAgentsViewInitialized();
  }
};

const setupMainTabs = () => {
  const tabs = document.querySelectorAll("[data-view-target]");
  if (!tabs.length) return;
  tabs.forEach((tab) => {
    if (tab.dataset.viewBound === "true") return;
    tab.addEventListener("click", () => {
      const target = tab.dataset.viewTarget;
      if (target) {
        cbSwitchMainView(target);
      }
    });
    tab.dataset.viewBound = "true";
  });
};

const setupAgentsView = () => {
  const { select, runBtn, resultSection } = cbGetAgentsElements();
  if (select && select.dataset.agentSelectBound !== "true") {
    select.addEventListener("change", (event) => {
      cbAgentsState.selectedScenarioId = event.target.value;
      cbUpdateAgentsScenarioDetails();
    });
    select.dataset.agentSelectBound = "true";
  }
  if (runBtn && runBtn.dataset.agentRunBound !== "true") {
    runBtn.addEventListener("click", (event) => {
      event.preventDefault();
      cbRunSelectedAgent();
    });
    runBtn.dataset.agentRunBound = "true";
  }
  if (resultSection) {
    resultSection.hidden = true;
  }
  cbUpdateAgentsAuthState();
};

const initCoolBitsUI = () => {
  loadAuthFromStorage();
  if (cbGetAuthToken()) {
    refreshAccountUsage();
  }
  cbHandleStripeReturn();
  cbHandleConnectorReturn();

  const billingStatus = getQueryParam("billing");
  if (billingStatus === "success") {
    console.log("[BILLING] success return detected, refreshing usage");
    refreshAccountUsage();
  } else if (billingStatus === "cancel") {
    console.log("[BILLING] checkout canceled by user");
  }

  loadSettingsFromStorage();
  attachSettingsHandlers();
  setupUserButton();
  setupOnboardingModalHandlers();
  setupGuestHintHandlers();
  setupUserMenuHandlers();
  setupAccountBillingEntryPoints();
  setupSupportContactLinks();
  setupEnterpriseContactFormHandlers();
  setupAccountViewTabs();
  cbRenderConnectorsPanel();
  cbRefreshConnectorStatuses();
  setupUpgradeButton();
  setupModalCloseHandlers();
  setupDeleteModalHandlers();
  setupRenameModalHandlers();
  setupSidebarInteractions();
  syncWorkspaceShell();
  setupCouncilControls();
  cbInitModelMenu();
  cbEnsurePublicAgentsRegistry().then(() => cbRenderCouncilList());
  setupMainTabs();
  cbRenderCouncilBar();
  cbUpdateChatHeader();
  cbUpdateComposerSendState();
  cbInitStagedPayloads();
  cbLoadActiveContext().catch((error) => console.warn("[ACTIVE_CONTEXT] init failed", error));

  if (!cbDashboardRouterState.bound) {
    window.addEventListener("popstate", cbSyncDashboardViewFromUrl);
    cbDashboardRouterState.bound = true;
  }
  cbSyncDashboardViewFromUrl();
};

const renderMessages = () => {
  if (!elements.messages) return;
  cbBindChatScrollToBottomButton();
  const scrollContainer = cbGetChatScrollContainer();
  const shouldAutoScroll = cbChatForceScrollToBottom || cbIsChatNearBottom(scrollContainer, 140);
  cbChatForceScrollToBottom = false;
  elements.messages.innerHTML = "";

  if (!messages.length) {
    const placeholder = document.createElement("div");
    const showShellEmpty = cbShouldShowShellEmptyState();
    placeholder.className = showShellEmpty ? "chat-message system empty-state" : "chat-message system";
    placeholder.textContent = showShellEmpty
      ? "Start a new chat from the sidebar to begin."
      : "No conversation yet. Share your idea to begin.";
    elements.messages.appendChild(placeholder);
    if (shouldAutoScroll) {
      scrollToBottom();
    } else {
      cbUpdateChatScrollToBottomButton();
    }
    return;
  }

  messages.forEach((msg) => {
    if (msg.type === CB_MESSAGE_TYPE_COUNCIL_DECISION) {
      elements.messages.appendChild(cbRenderCouncilDecisionMessage(msg));
      return;
    }

    const bubble = document.createElement("div");
    const normalizedRole = msg.role === "assistant" ? "bot" : msg.role || "assistant";
    bubble.className = `chat-message ${normalizedRole}`;
    const shouldRenderMarkdown = normalizedRole === "bot";

    const hasCouncil =
      msg &&
      msg.council &&
      Array.isArray(msg.council.responses) &&
      msg.council.responses.length > 0;

    if (hasCouncil) {
      bubble.appendChild(cbRenderCouncilMessage(msg));
    } else if (shouldRenderMarkdown) {
      console.log("[MD_RENDER]", msg.content);
      const html = renderMarkdown(msg.content);
      if (html) {
        bubble.innerHTML = html;
      } else {
        bubble.textContent = msg.content;
      }
    } else {
      bubble.textContent = msg.content;
    }

    elements.messages.appendChild(bubble);
  });

  if (shouldAutoScroll) {
    scrollToBottom();
  } else {
    cbUpdateChatScrollToBottomButton();
  }
};

function cbRenderCouncilBar() {
  cbSyncCouncilUI();
}

function cbRenderCouncilMessage(msg) {
  const wrapper = document.createElement("div");
  wrapper.className = "cb-message-council";

  const header = document.createElement("div");
  header.className = "cb-message-council-header";
  const title = document.createElement("span");
  title.textContent = "Business Council";
  const count = document.createElement("span");
  count.className = "cb-message-council-count";
  count.textContent = `${msg.council.responses.length}`;
  header.appendChild(title);
  header.appendChild(count);
  wrapper.appendChild(header);

  const grid = document.createElement("div");
  grid.className = "cb-message-council-grid";

  msg.council.responses.forEach((resp) => {
    const card = document.createElement("div");
    card.className = "cb-message-council-card";

    const rTitle = document.createElement("div");
    rTitle.className = "cb-message-council-card-title";
    rTitle.textContent = resp.label || resp.memberId || "Council member";
    card.appendChild(rTitle);

    if (resp.content) {
      const rBody = document.createElement("div");
      rBody.className = "cb-message-council-card-body";
      const html = renderMarkdown(resp.content);
      rBody.innerHTML = html || resp.content;
      card.appendChild(rBody);
    }

    grid.appendChild(card);
  });

  wrapper.appendChild(grid);
  return wrapper;
}

function cbRenderCouncilDecisionMessage(msg) {
  const wrapper = document.createElement("div");
  wrapper.className = "cb-message cb-message-assistant";

  const bubble = document.createElement("div");
  bubble.className = "cb-message-bubble cb-council-decision";

  const header = document.createElement("div");
  header.className = "cb-council-decision-header";
  header.textContent = "Business Council verdict";
  bubble.appendChild(header);

  const verdictEl = document.createElement("div");
  verdictEl.className = "cb-council-decision-verdict";
  verdictEl.textContent = `Verdict: ${msg.councilVerdict}`;
  bubble.appendChild(verdictEl);

  if (msg.councilRisks && msg.councilRisks.length > 0) {
    const risksTitle = document.createElement("div");
    risksTitle.className = "cb-council-decision-subtitle";
    risksTitle.textContent = "Risks / edge cases:";
    bubble.appendChild(risksTitle);

    const ul = document.createElement("ul");
    ul.className = "cb-council-decision-risks";
    msg.councilRisks.forEach((r) => {
      const li = document.createElement("li");
      li.textContent = r;
      ul.appendChild(li);
    });
    bubble.appendChild(ul);
  }

  wrapper.appendChild(bubble);
  return wrapper;
}

const renderSuggestions = (list = []) => {
  if (!elements.suggestions) return;
  elements.suggestions.querySelectorAll("button").forEach((btn) => btn.remove());

  if (!suggestionsEnabled || !list.length) {
    setSuggestionsState(false);
    return;
  }

  setSuggestionsState(true);
  list.forEach((item) => {
    const suggestion = document.createElement("button");
    suggestion.type = "button";
    suggestion.className = "suggestion-button prompt-chip";
    suggestion.textContent = item;
    suggestion.addEventListener("click", () => {
      if (!elements.input) return;
      elements.input.value = item;
      elements.input.focus();
      cbResizeComposerInput();
    });
    elements.suggestions.appendChild(suggestion);
  });
};

const addMessage = (role, content, { persistHistory = true } = {}) => {
  messages.push({
    role,
    content,
    timestamp: Date.now(),
  });
  if (persistHistory) {
    const normalizedRole = role === "bot" ? "assistant" : role;
    if (normalizedRole === "user" || normalizedRole === "assistant") {
      history.push({ role: normalizedRole, content });
    }
  }
  saveHistory();
  cbChatForceScrollToBottom = true;
  renderMessages();
};

async function sendMessage(prefilledValue) {
  if (isSending) {
    return;
  }
  const input = elements.input || document.getElementById("chat-input");
  const sourceValue = typeof prefilledValue === "string" ? prefilledValue : input?.value || "";
  const message = sourceValue.trim();
  if (!message) {
    return;
  }

  const stagedPayloadIds = cbGetStagedPayloadIds();
  const shouldClearStaged = stagedPayloadIds.length > 0;

  if (!cbRequireAuthForChat("send-message")) {
    return;
  }

  if (cbActiveContextState.status !== "active") {
    showComposerError("Select agent/model and wait for green status before sending.");
    cbUpdateComposerSendState();
    return;
  }

  if (typeof prefilledValue === "string" && input) {
    input.value = prefilledValue;
    cbResizeComposerInput();
  }

  const councilActive = cbShouldUseCouncil();
  const isCouncilTicket = cbIsCouncilTicket(message);

  clearComposerError();
  isSending = true;
  elements.button?.setAttribute("disabled", "true");
  elements.input?.setAttribute("disabled", "true");

  try {
    addMessage("user", message);
    if (councilActive && isCouncilTicket) {
      cbRunCouncilEvaluation(message);
    }
    let autoRenameSource = null;
    if (cbChatsUnsupported) {
      const data = await legacyRequestChatReply(message, stagedPayloadIds);
      const reply = extractReply(data);
      if (!reply) {
        throw new Error("Chat service returned an empty reply.");
      }
      addMessage("assistant", reply);
      if (input) {
        input.value = "";
        cbResizeComposerInput();
        cbUpdatePromptMeter();
      }
    } else {
      let nextMessages = cbActiveChatMessages.slice();
      if (!cbActiveChatId) {
        const creation = await cbCreateChat(message, { payloadIds: stagedPayloadIds });
        cbActiveChatId = creation?.chat?.id || null;
        nextMessages = Array.isArray(creation?.messages) ? creation.messages : [];
        const firstAssistant = nextMessages.find(
          (msg) => typeof msg?.content === "string" && (msg.role || "").toLowerCase() === "assistant"
        );
        if (firstAssistant) {
          autoRenameSource = firstAssistant.content;
        }
      } else {
        const appendResult = await cbAppendChatMessage(cbActiveChatId, message, { payloadIds: stagedPayloadIds });
        const appended = Array.isArray(appendResult?.newMessages) ? appendResult.newMessages : [];
        nextMessages = nextMessages.concat(appended);
      }
      cbSetActiveChatMessages(nextMessages);
      if (input) {
        input.value = "";
        cbResizeComposerInput();
        cbUpdatePromptMeter();
      }
      await cbLoadChats();
      if (autoRenameSource && cbActiveChatId) {
        cbMaybeAutoRenameFromAssistant(cbActiveChatId, autoRenameSource);
      }
    }
    if (shouldClearStaged) {
      cbClearStagedPayloads();
    }
  } catch (error) {
    console.error(error);
    const fallback = error instanceof Error ? error.message : null;
    const messageText = fallback || "We couldn't reach the CoolBits backend right now. Please try again.";
    showComposerError(messageText);
    if (!error?.inlineOnly) {
      addMessage("system", messageText, { persistHistory: false });
    }
  } finally {
    isSending = false;
    cbUpdateComposerSendState();
    elements.input?.removeAttribute("disabled");
    elements.input?.focus();
  }
}

function cbIsCouncilTicket(text) {
  if (!text) return false;
  const t = text.trim().toLowerCase();
  return t.startsWith("council ticket:") || t.startsWith("council:");
}

async function cbRunCouncilEvaluation(ticketText) {
  try {
    const res = await fetch("/api/council/evaluate", {
      method: "POST",
      headers: cbGetAuthHeaders({ "Content-Type": "application/json" }),
      credentials: "include",
      body: JSON.stringify({
        ticket: ticketText,
        meta: {
          source: "coolbits-ui",
          workspaceId: cbCurrentWorkspaceId || "business",
          chatId: cbActiveChatId || null,
        },
      }),
    });
    if (!res.ok) {
      console.error("[COUNCIL] HTTP error", res.status);
      return;
    }
    const data = await res.json();
    cbAppendCouncilDecisionMessage(data);
  } catch (err) {
    console.error("[COUNCIL] network error", err);
  }
}

function cbAppendCouncilDecisionMessage(result) {
  const msg = {
    id: `council-${Date.now()}`,
    type: CB_MESSAGE_TYPE_COUNCIL_DECISION,
    councilVerdict: result?.parsed?.verdict || "UNKNOWN",
    councilRisks: Array.isArray(result?.parsed?.risks) ? result.parsed.risks : [],
    councilRaw: result?.raw || "",
    createdAt: new Date().toISOString(),
  };
  messages.push(msg);
  cbChatForceScrollToBottom = true;
  renderMessages();
}

const awaitSuggestions = async () => {
  if (!suggestionsEnabled) {
    setSuggestionsState(false);
    return;
  }
  try {
    const response = await fetch(API_SUGGESTIONS, {
      headers: cbGetAuthHeaders(),
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error("Suggestions unavailable");
    }
    const data = await response.json();
    renderSuggestions(data.suggestions || []);
  } catch (error) {
    console.warn(error);
    renderSuggestions([]);
  }
};

const resetHistory = () => {
  messages = [];
  history = [];
  saveHistory();
  renderMessages();
};

const startReasoningSession = async () => {
  if (!elements.reasoningButton) return;
  
  elements.reasoningButton.disabled = true;
  updateReasoningBadge('processing', 'Starting reasoning session...');
  
  try {
    const response = await fetch(API_REASONING_SESSION, {
      method: 'POST',
      headers: cbGetAuthHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'include',
      body: JSON.stringify({ visitorId }),
    });
    
    const data = await safeJson(response);
    
    if (!response.ok) {
      const errorMsg = data?.error || 'Failed to start reasoning session';
      throw new Error(errorMsg);
    }
    
    if (data.sessionId) {
      reasoningActive = true;
      startReasoningPolling();
      updateReasoningBadge('active', data.message || 'Reasoning active');
    }
  } catch (error) {
    console.error('Reasoning session error:', error);
    updateReasoningBadge('error', error.message || 'Failed to start session');
    elements.reasoningButton.disabled = false;
  }
};

const checkReasoningStatus = async () => {
  try {
    const response = await fetch(`${API_REASONING_STATUS}?visitor=${encodeURIComponent(visitorId)}`, {
      headers: cbGetAuthHeaders(),
      credentials: 'include',
    });
    
    const data = await safeJson(response);
    
    if (!response.ok || !data) {
      stopReasoningPolling();
      return;
    }
    
    if (data.active && data.expiresAt) {
      const expiryDate = new Date(data.expiresAt);
      const now = new Date();
      
      if (expiryDate > now) {
        const minutesLeft = Math.ceil((expiryDate - now) / 1000 / 60);
        updateReasoningBadge('active', `Reasoning active - expires in ${minutesLeft}m`);
        reasoningActive = true;
      } else {
        stopReasoningPolling();
      }
    } else {
      stopReasoningPolling();
    }
  } catch (error) {
    console.warn('Reasoning status check failed:', error);
  }
};

const startReasoningPolling = () => {
  if (reasoningPollInterval) {
    clearInterval(reasoningPollInterval);
  }
  reasoningPollInterval = setInterval(checkReasoningStatus, 30000);
};

const stopReasoningPolling = () => {
  if (reasoningPollInterval) {
    clearInterval(reasoningPollInterval);
    reasoningPollInterval = null;
  }
  reasoningActive = false;
  updateReasoningBadge('inactive', 'Reasoning inactive');
  if (elements.reasoningButton) {
    elements.reasoningButton.disabled = false;
  }
};

const updateReasoningBadge = (state, text) => {
  if (!elements.reasoningBadge) return;
  
  elements.reasoningBadge.textContent = text;
  elements.reasoningBadge.dataset.state = state;
};

const openCampaignModal = () => {
  const currentLevel = profile.level || 'level-0';
  const levelNum = parseInt(currentLevel.replace('level-', '')) || 0;
  
  if (levelNum < 4) {
    alert('Ultimate Campaign Plans require Level 4. Keep engaging to unlock this feature!');
    return;
  }
  
  const modal = document.getElementById('campaign-modal');
  if (!modal) {
    createCampaignModal();
  }
  const modalElement = document.getElementById('campaign-modal');
  if (modalElement) {
    modalElement.style.display = 'flex';
  }
};

const closeCampaignModal = () => {
  const modal = document.getElementById('campaign-modal');
  if (modal) {
    modal.style.display = 'none';
  }
};

const createCampaignModal = () => {
  const modal = document.createElement('div');
  modal.id = 'campaign-modal';
  modal.className = 'campaign-modal';
  modal.innerHTML = `
    <div class="campaign-modal-content">
      <div class="campaign-modal-header">
        <h2>Request Ultimate Campaign Plan</h2>
        <button class="campaign-modal-close" onclick="closeCampaignModal()">&times;</button>
      </div>
      <form id="campaign-form" class="campaign-form">
        <div class="campaign-form-group">
          <label for="businessGoals">Business Goals *</label>
          <textarea id="businessGoals" name="businessGoals" required placeholder="Describe your business objectives..."></textarea>
        </div>
        <div class="campaign-form-group">
          <label for="targetAudience">Target Audience *</label>
          <input type="text" id="targetAudience" name="targetAudience" required placeholder="Who are you trying to reach?" />
        </div>
        <div class="campaign-form-row">
          <div class="campaign-form-group">
            <label for="budget">Budget Range</label>
            <select id="budget" name="budget">
              <option value="">Select budget</option>
              <option value="under-1k">Under $1,000</option>
              <option value="1k-5k">$1,000 - $5,000</option>
              <option value="5k-10k">$5,000 - $10,000</option>
              <option value="10k-25k">$10,000 - $25,000</option>
              <option value="25k-plus">$25,000+</option>
            </select>
          </div>
          <div class="campaign-form-group">
            <label for="timeline">Timeline</label>
            <select id="timeline" name="timeline">
              <option value="">Select timeline</option>
              <option value="immediate">Immediate (1-2 weeks)</option>
              <option value="short">Short-term (1-3 months)</option>
              <option value="medium">Medium-term (3-6 months)</option>
              <option value="long">Long-term (6+ months)</option>
            </select>
          </div>
        </div>
        <div class="campaign-form-group">
          <label for="additionalContext">Additional Context</label>
          <textarea id="additionalContext" name="additionalContext" placeholder="Any other details that might help..."></textarea>
        </div>
        <div class="campaign-form-actions">
          <button type="button" class="btn-secondary" onclick="closeCampaignModal()">Cancel</button>
          <button type="submit" class="btn">Request Campaign Plan</button>
        </div>
        <div class="campaign-error" id="campaign-error" hidden></div>
      </form>
      <div class="campaign-results" id="campaign-results" hidden>
        <div class="campaign-results-header">
          <h3>Your Campaign Plan</h3>
        </div>
        <div class="campaign-results-content" id="campaign-results-content"></div>
        <div class="campaign-results-actions">
          <button type="button" class="btn" onclick="closeCampaignModal()">Close</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  const form = document.getElementById('campaign-form');
  if (form) {
    form.addEventListener('submit', handleCampaignSubmit);
  }
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeCampaignModal();
    }
  });
};

const handleCampaignSubmit = async (e) => {
  e.preventDefault();
  
  const form = e.target;
  const submitBtn = form.querySelector('button[type="submit"]');
  const errorDiv = document.getElementById('campaign-error');
  
  submitBtn.disabled = true;
  submitBtn.textContent = 'Requesting...';
  errorDiv.hidden = true;
  
  const formData = {
    visitorId,
    businessGoals: form.businessGoals.value,
    targetAudience: form.targetAudience.value,
    budget: form.budget.value,
    timeline: form.timeline.value,
    additionalContext: form.additionalContext.value,
  };
  
  try {
    const response = await fetch(API_CAMPAIGN_PLAN, {
      method: 'POST',
      headers: cbGetAuthHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'include',
      body: JSON.stringify(formData),
    });
    
    const data = await safeJson(response);
    
    if (!response.ok) {
      throw new Error(data?.error || 'Failed to generate campaign plan');
    }
    
    showCampaignResults(data);
  } catch (error) {
    console.error('Campaign plan error:', error);
    errorDiv.textContent = error.message || 'Failed to generate campaign plan';
    errorDiv.hidden = false;
    submitBtn.disabled = false;
    submitBtn.textContent = 'Request Campaign Plan';
  }
};

const showCampaignResults = (data) => {
  const form = document.getElementById('campaign-form');
  const results = document.getElementById('campaign-results');
  const content = document.getElementById('campaign-results-content');
  
  if (form) form.style.display = 'none';
  if (results) results.hidden = false;
  
  if (content && data) {
    let html = '';
    
    if (data.plan) {
      html += `<div class="campaign-plan">${data.plan.replace(/\n/g, '<br>')}</div>`;
    }
    
    if (data.estimatedCost) {
      html += `<div class="campaign-cost"><strong>Estimated Cost:</strong> $${data.estimatedCost.toLocaleString()}</div>`;
    }
    
    if (data.disclaimer) {
      html += `<div class="campaign-disclaimer">${data.disclaimer}</div>`;
    }
    
    content.innerHTML = html;
  }
};

window.closeCampaignModal = closeCampaignModal;

const bootstrap = () => {
  if (!elements.form || !elements.messages) return;

  messages = loadHistory();
  cbChatForceScrollToBottom = true;
  renderMessages();
  
  ensureProfile()
    .then(() => updateLevelBadge())
    .catch((error) => console.warn("profile ensure failed", error));

  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage();
  });
  cbSetupComposerInput();
  cbInitCouncilUI();

  if (elements.campaignButton) {
    elements.campaignButton.addEventListener('click', openCampaignModal);
  }

  awaitSuggestions();
  checkReasoningStatus();
  cbUpdateCouncilPill();

  const seedMessage = consumeSeedMessage();
  if (seedMessage) {
    resetHistory();
    if (elements.input) {
      elements.input.value = seedMessage;
      cbResizeComposerInput();
    }
    if (cbIsAuthenticated()) {
      sendMessage(seedMessage);
    } else {
      cbPendingFirstMessage = seedMessage;
    }
  }
};

const initializeCoolBitsPage = () => {
  initCoolBitsUI();
  bootstrap();
};

document.addEventListener("DOMContentLoaded", initializeCoolBitsPage);

function showComposerError(msg) {
  let el = document.getElementById("composer-error");
  if (!el) {
    el = document.createElement("div");
    el.id = "composer-error";
    el.className = "composer-error";
    document.body.appendChild(el);
  }
  el.textContent = msg;
}

function clearComposerError() {
  const el = document.getElementById("composer-error");
  if (el) el.remove();
}

// --- CoolBits build marker ---
console.log("[CB_CHAT_BUILD]", "v2025-12-02T15:30Z");

// --- CoolBits footer auth badge ---
(function () {
  const BADGE_SELECTOR = ".cb-user-badge-email";

  function getBadgeElement() {
    return (
      document.querySelector(BADGE_SELECTOR) ||
      document.querySelector("#cb-user-badge")
    );
  }

  function updateBadgeText(text) {
    const badge = getBadgeElement();
    if (!badge) {
      return;
    }
    badge.textContent = text;
  }

  async function refreshAuthBadge() {
    try {
      const response = await fetch("/api/auth/me", { credentials: "include" });
      if (!response.ok) {
        updateBadgeText("Guest");
        console.log("[CBT_BADGE]", "status", response.status);
        return;
      }
      const data = await response.json();
      const user = data?.user || data;
      const label =
        user?.name ||
        user?.email ||
        user?.username ||
        "Logged in";
      updateBadgeText(label);
      console.log("[CBT_BADGE]", "ok", label);
    } catch (error) {
      console.error("[CBT_BADGE] error", error);
    }
  }

  document.addEventListener("DOMContentLoaded", refreshAuthBadge);
  window.cbRefreshAuthBadge = refreshAuthBadge;
  window.cbUpdateAuthBadgeText = updateBadgeText;
  window.cbOpenPlansModal = cbOpenPlansModal;
})();

// === Responsive Council Pill Text ===
// Shrink "Council" to "C" on very narrow screens
(() => {
  const councilLabel = document.getElementById('cb-council-label');
  if (!councilLabel) return;

  const updateCouncilText = () => {
    const width = window.innerWidth;
    if (width < 480) {
      // Very narrow - show only "C"
      if (!councilLabel.dataset.originalText) {
        councilLabel.dataset.originalText = councilLabel.textContent;
      }
      councilLabel.textContent = 'C';
    } else {
      // Normal width - restore original
      if (councilLabel.dataset.originalText) {
        councilLabel.textContent = councilLabel.dataset.originalText;
      }
    }
  };

  window.addEventListener('resize', updateCouncilText);
  window.addEventListener('DOMContentLoaded', updateCouncilText);
  updateCouncilText(); // Initial call
})();






