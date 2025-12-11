import { marked } from "./vendor/marked.esm.js";
console.log("[CB_CHAT_BUILD]", "council-pill-v3");
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
  { id: "business", label: "Business connectors" },
  { id: "agency", label: "Agency connectors" },
  { id: "dev", label: "Developer connectors" },
];

const CONNECTORS_CONFIG = [
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

const cbNormalizeAgentWorkspace = (workspaceId) => {
  if (!workspaceId) return "business";
  const key = workspaceId.toString().toLowerCase();
  if (key === "dev" || key === "developer") return "developer";
  return key;
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
    shortDescription: "Executive view on priorities, ROI, and trade-offs.",
    connectors: [],
    showInCouncil: true,
  },
  {
    workspace: "business",
    key: "cmo",
    label: "CMO \u2013 Growth",
    shortDescription: "Acquisition, paid media, and performance marketing (Google Ads, Meta, etc.).",
    connectors: ["googleads", "meta_ads", "tiktok_ads", "linkedin_ads", "ga4", "tracking_debugger"],
    showInCouncil: true,
  },
  {
    workspace: "business",
    key: "cfo",
    label: "CFO \u2013 Finance",
    shortDescription: "Budgets, forecasts, and performance guardrails.",
    connectors: ["stripe", "googleads"],
    showInCouncil: true,
  },
  {
    workspace: "business",
    key: "coo",
    label: "COO \u2013 Ops",
    shortDescription: "Execution, processes, and cross-team alignment.",
    connectors: ["ga4", "google_ads_mcc"],
    showInCouncil: true,
  },
  {
    workspace: "business",
    key: "cto",
    label: "CTO \u2013 Tech",
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
  chatsList: document.querySelector("[data-sidebar-chat-list]"),
  featureButtons: Array.from(document.querySelectorAll("[data-sidebar-feature]")),
  accountViewButtons: Array.from(document.querySelectorAll("[data-account-view-btn]")),
  accountViews: Array.from(document.querySelectorAll("[data-account-view]")),
  connectorsCategories: document.getElementById("cb-connectors-categories"),
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
  councilActive: document.getElementById("cb-council-active"),
  councilPopover: document.getElementById("cb-council-popover"),
  councilList: document.getElementById("cb-council-list"),
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
let cbAuthToken = null;
let cbCurrentUser = null;
let cbCouncilAxisState = { mode: null, readyByAxis: {} };
let userMenuOpen = false;
let cbGooglePopup = null;
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
const WORKSPACE_STORAGE_KEY = "coolbits:workspace";
const cbWorkspaces = [
  { id: "business", label: "Business" },
  { id: "agency", label: "Agency" },
  { id: "developer", label: "Developer" },
];
let cbCurrentWorkspaceId = "business";
let cbWorkspaceMenuOpen = false;
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
  hint.hidden = cbIsAuthenticated();
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

const scrollToBottom = () => {
  if (!elements.messages) return;
  requestAnimationFrame(() => {
    elements.messages.scrollTop = elements.messages.scrollHeight;
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
  const { projectMenu, projectSelector, workspaceMenu, workspaceSelector } = shellElements;
  if (cbProjectMenuOpen && projectMenu && projectSelector && !projectMenu.hidden) {
    cbPositionSidebarMenu(projectMenu, projectSelector);
  }
  if (cbWorkspaceMenuOpen && workspaceMenu && workspaceSelector && !workspaceMenu.hidden) {
    cbPositionSidebarMenu(workspaceMenu, workspaceSelector);
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

const cbHandleSidebarMenuOutside = (event) => {
  const target = event.target;
  const { projectSection, workspaceSection } = shellElements;
  if (cbProjectMenuOpen && projectSection && !projectSection.contains(target)) {
    cbToggleProjectMenu(false);
  }
  if (cbWorkspaceMenuOpen && workspaceSection && !workspaceSection.contains(target)) {
    cbToggleWorkspaceMenu(false);
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

const cbRenderCouncilList = () => {
  const container =
    shellElements.councilList ||
    document.getElementById("cb-council-list") ||
    document.querySelector('[data-role="council-list"]');
  if (container) {
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

      const role = document.createElement("span");
      role.className = "cb-council-pill-role";
      role.textContent = agent.label?.split(" – ")[0] || agent.label || agent.key;
      const desc = document.createElement("span");
      desc.className = "cb-council-pill-desc";
      desc.textContent = agent.shortDescription || "Preview agent";
      toggle.appendChild(role);
      toggle.appendChild(desc);

      const detailsBtn = document.createElement("button");
      detailsBtn.type = "button";
      detailsBtn.className = "cb-council-detail-btn";
      detailsBtn.textContent = "Details";
      detailsBtn.addEventListener("click", (event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        cbOpenAgentDetail(agent.workspace, agent.key);
      });

      row.appendChild(toggle);
      row.appendChild(detailsBtn);
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

const legacyRequestChatReply = async (message) => {
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

async function cbCreateChat(firstMessage) {
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

async function cbAppendChatMessage(chatId, content) {
  if (cbChatsUnsupported) {
    throw new Error("Chat persistence unavailable.");
  }
  const councilPayload = getCouncilPayload();
  const hasCouncil = Array.isArray(councilPayload.agents) && councilPayload.agents.length > 0;
  const councilMembers = hasCouncil ? councilPayload.agents.slice() : [];
  const useCouncil = hasCouncil;
  if (hasCouncil) cbSetCouncilStatus(councilMembers, CB_COUNCIL_STATUS_PENDING);
  const payload = { content };
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

const setupSidebarInteractions = () => {
  const {
    sidebar,
    sidebarToggle,
    sidebarLogo,
    mobileSidebarToggle,
    sidebarClose,
    sidebarBackdrop,
    newChatButton,
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
      if (!cbRequireAuthForChat("new-chat")) {
        return;
      }
      cbHandleStartNewChat();
      closeMobileSidebar();
    });
  }
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
    customerName: null,
    propertyId: null,
    lastSyncAt: null,
    lastError: null,
    properties: [],
    ...current,
    ...partial,
  };
  cbRenderConnectorsPanel();
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
  const { ok, status, json } = await cbFetchJson(`${connector.apiBase}/status`);
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
  if (!workspaceId) return null;
  const params = new URLSearchParams({
    workspaceId: workspaceId,
    dateRange: "last_7_days",
  });
  const { ok, json } = await cbFetchJson(
    `/api/connectors/ga4/summary?${params.toString()}`
  );
  if (ok && json) {
    return json;
  }
  throw new Error("Failed to load GA4 summary.");
};

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
  const { ok, status, json } = await cbFetchJson(`${connector.apiBase}/auth/url`);
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
  const { ok, status, json } = await cbFetchJson(`${connector.apiBase}/disconnect`, { method: "POST" });
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

const cbLoadGa4Properties = async () => {
  const connector = CONNECTORS_CONFIG.find((c) => c.key === "ga4");
  if (!connector || !connector.apiBase) return;
  cbConnectorDetailState.ga4Loading = true;
  cbConnectorDetailState.ga4Error = null;
  cbRenderConnectorDetail(connector);
  const { ok, json, status } = await cbFetchJson(`${connector.apiBase}/properties`);
  if (ok && Array.isArray(json)) {
    cbConnectorDetailState.ga4Properties = json;
    cbConnectorDetailState.ga4Error = null;
  } else {
    const message =
      (json && (json.error || json.message)) ||
      (status === 401 ? "Please sign in to view GA4 properties." : "Unable to load GA4 properties.");
    cbConnectorDetailState.ga4Error = message;
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

const cbSaveGoogleAdsCustomer = async (customerId) => {
  const connector = CONNECTORS_CONFIG.find((c) => c.key === "googleads");
  if (!connector || !connector.apiBase || !customerId) return;
  cbConnectorDetailState.googleAdsLoading = true;
  cbConnectorDetailState.googleAdsError = null;
  cbRenderConnectorDetail(connector);
  const { ok, json, status } = await cbFetchJson(`${connector.apiBase}/customer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customerId }),
  });
  if (ok) {
    cbUpdateConnectorState("googleads", { customerId, status: "connected" });
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
  const { ok, json, status } = await cbFetchJson(`${connector.apiBase}/property`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ propertyId }),
  });
  if (ok) {
    cbUpdateConnectorState("ga4", { propertyId, status: "connected" });
    cbConnectorDetailState.ga4Error = null;
    cbRefreshConnectorStatuses();
  } else {
    const message =
      (json && (json.error || json.message)) ||
      (status === 401 ? "Please sign in to save GA4 property." : "Unable to save GA4 property.");
    cbConnectorDetailState.ga4Error = message;
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
        const formatPercent = (val) =>
          typeof val === "number" && Number.isFinite(val)
            ? `${val.toFixed(2)}%`
            : "-";
        appendHtmlBlock(`
          <section class="cb-account-card">
            <header class="cb-account-card-header">
              <div>
                <p class="cb-account-card-subtitle">GA4</p>
                <h3>Last 7 days</h3>
              </div>
            </header>
            <div class="cb-enterprise-inline">
              <div>
                <p class="cb-modal-note">Sessions</p>
                <p class="cb-modal-value">${formatValue(s.sessions)}</p>
              </div>
              <div>
                <p class="cb-modal-note">Users</p>
                <p class="cb-modal-value">${formatValue(s.users)}</p>
              </div>
              <div>
                <p class="cb-modal-note">New users</p>
                <p class="cb-modal-value">${formatValue(s.newUsers)}</p>
              </div>
              <div>
                <p class="cb-modal-note">Session conversion rate</p>
                <p class="cb-modal-value">${formatPercent(s.sessionConversionRate)}</p>
              </div>
              <div>
                <p class="cb-modal-note">Total revenue</p>
                <p class="cb-modal-value">${formatValue(s.totalRevenue, 2)}</p>
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
        cbAgentDetailState.ga4Summary = summary;
        cbAgentDetailState.ga4SummaryError = null;
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
      if (state.customerId) parts.push(`Customer ID: ${state.customerId}`);
      if (state.lastSyncAt) parts.push(`Last sync: ${state.lastSyncAt}`);
      accountLine.textContent = parts.length ? parts.join(" \u00b7 ") : "Account: -";
      if (effectiveStatus === "connected") {
        const accountsWrap = document.createElement("div");
        accountsWrap.className = "cb-enterprise-inline";

        const select = document.createElement("select");
        select.id = "cb-googleads-customer-select";
        select.className = "cb-input";
        select.disabled = !!cbConnectorDetailState.googleAdsLoading;
        const loading = cbConnectorDetailState.googleAdsLoading;
        const customers = Array.isArray(cbConnectorDetailState.googleAdsCustomers)
          ? cbConnectorDetailState.googleAdsCustomers
          : [];
        const defaultOpt = document.createElement("option");
        defaultOpt.value = "";
        defaultOpt.textContent = loading ? "Loading accounts..." : "Select a primary account";
        select.appendChild(defaultOpt);
        customers.forEach((cust) => {
          const opt = document.createElement("option");
          opt.value = cust.customerId || cust.customer_id || "";
          const label = cust.descriptiveName || cust.descriptive_name || opt.value;
          opt.textContent = label ? `${label} (${opt.value})` : opt.value;
          select.appendChild(opt);
        });
        if (state.customerId) select.value = state.customerId;

        const saveBtn = document.createElement("button");
        saveBtn.type = "button";
        saveBtn.className = "btn btn-primary";
        saveBtn.textContent = cbConnectorDetailState.googleAdsLoading ? "Saving..." : "Save";
        saveBtn.disabled = cbConnectorDetailState.googleAdsLoading;
        saveBtn.addEventListener("click", () => {
          const value = select.value;
          if (!value) return;
          cbSaveGoogleAdsCustomer(value);
        });

        accountsWrap.appendChild(select);
        accountsWrap.appendChild(saveBtn);
        accountLine.appendChild(accountsWrap);

        if (cbConnectorDetailState.googleAdsError) {
          const err = document.createElement("p");
          err.className = "cb-form-error";
          err.textContent = cbConnectorDetailState.googleAdsError;
          accountLine.appendChild(err);
        } else if (!loading && !customers.length) {
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
        current.textContent = `Property: ${state.propertyId}${state.lastSyncAt ? ` · Last sync: ${state.lastSyncAt}` : ""}`;
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
        saveBtn.disabled = cbConnectorDetailState.ga4Loading;
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
      cbLoadGoogleAdsCustomers();
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
    const message = params.get("message") || "";
    if (connector !== "googleads" && connector !== "ga4") return;

    params.delete("connector");
    params.delete("status");
    params.delete("message");
    const newQuery = params.toString();
    const newUrl = `${window.location.pathname}${newQuery ? `?${newQuery}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", newUrl);

    const isGoogleAds = connector === "googleads";
    if (status === "success") {
      cbShowBillingToast("success", isGoogleAds ? "Google Ads was connected successfully." : "GA4 connected successfully.");
      await cbRefreshConnectorStatuses();
    } else if (status === "error") {
      cbShowBillingToast("cancel", isGoogleAds ? "We could not connect Google Ads. Please try again." : "We could not connect GA4. Please try again.");
      if (message) {
        console.error(isGoogleAds ? "[CONNECTOR_GOOGLE_ADS]" : "[CONNECTOR_GA4]", message);
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
  setupMainTabs();
  cbRenderCouncilBar();
};

const renderMessages = () => {
  if (!elements.messages) return;
  elements.messages.innerHTML = "";

  if (!messages.length) {
    const placeholder = document.createElement("div");
    const showShellEmpty = cbShouldShowShellEmptyState();
    placeholder.className = showShellEmpty ? "chat-message system empty-state" : "chat-message system";
    placeholder.textContent = showShellEmpty
      ? "Start a new chat from the sidebar to begin."
      : "No conversation yet. Share your idea to begin.";
    elements.messages.appendChild(placeholder);
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

  scrollToBottom();
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

  if (!cbRequireAuthForChat("send-message")) {
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
      const data = await legacyRequestChatReply(message);
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
        const creation = await cbCreateChat(message);
        cbActiveChatId = creation?.chat?.id || null;
        nextMessages = Array.isArray(creation?.messages) ? creation.messages : [];
        const firstAssistant = nextMessages.find(
          (msg) => typeof msg?.content === "string" && (msg.role || "").toLowerCase() === "assistant"
        );
        if (firstAssistant) {
          autoRenameSource = firstAssistant.content;
        }
      } else {
        const appendResult = await cbAppendChatMessage(cbActiveChatId, message);
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
    elements.button?.removeAttribute("disabled");
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
  renderMessages();
  
  // Force scroll to bottom after render completes
  requestAnimationFrame(() => {
    setTimeout(() => {
      scrollToBottom();
    }, 100);
  });
  
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






