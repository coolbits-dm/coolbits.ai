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
    tokensPerMonth: 100000,
  },
  agency: {
    code: "agency",
    label: "Agency",
    price: 79,
    currency: "EUR",
    trialDays: 15,
    workspaces: "Business + Agency workspaces",
    workspacesCount: 2,
    projects: 5,
    agents: 15,
    tokensPerMonth: 400000,
  },
  dev: {
    code: "dev",
    label: "Developer",
    price: 79,
    currency: "EUR",
    trialDays: 15,
    workspaces: "Business + Dev workspaces",
    workspacesCount: 2,
    projects: 5,
    agents: 15,
    tokensPerMonth: 400000,
  },
  enterprise: {
    code: "enterprise",
    label: "Enterprise",
    price: 199,
    currency: "EUR",
    trialDays: null,
    workspaces: "All workspaces",
    workspacesCount: "all",
    projects: 10,
    agents: "all",
    tokensPerMonth: 1500000,
  },
};

const PLAN_CODES = Object.keys(PLAN_DEFINITIONS);

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
window.cbCouncilArmed = !!window.cbCouncilArmed;
let cbCouncilSelectedIds = window.cbCouncilSelectedIds;
let cbCouncilArmed = window.cbCouncilArmed;
let cbCouncilSendStatus = {};
let cbCouncilEnabled = false;

function cbGetCouncilElements() {
  const wrapper =
    document.querySelector(".cb-council-pill") ||
    document.querySelector(".cb-council-wrapper");
  const labelEl = wrapper ? wrapper.querySelector('[data-role="council-label"]') : null;
  const countEl = wrapper ? wrapper.querySelector('[data-role="council-count"]') : null;
  return { wrapper, labelEl, countEl };
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

const cbShouldUseCouncil = () =>
  cbCouncilArmed && cbCouncilSelectedIds.size > 0;

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

  if (!window.cbCouncilSelectedIds || !(window.cbCouncilSelectedIds instanceof Set)) {
    window.cbCouncilSelectedIds = new Set();
  }
  if (typeof window.cbCouncilArmed !== "boolean") {
    window.cbCouncilArmed = false;
  }
  cbCouncilSelectedIds = window.cbCouncilSelectedIds;
  cbCouncilArmed = window.cbCouncilArmed;

  const rows = document.querySelectorAll("[data-council-id]");
  rows.forEach((row) => {
    const id = row.getAttribute("data-council-id");
    const checkbox = row.querySelector(".cb-council-checkbox");
    if (!id || !checkbox) return;

    checkbox.checked = window.cbCouncilSelectedIds.has(id);

    checkbox.addEventListener("change", function () {
      cbOnCouncilCheckboxChange(id, this.checked);
    });
  });

  // Ensure pill shows correct count/armed state
  cbUpdateCouncilPill();
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
}

function cbUpdateCouncilPill() {
  const { wrapper, countEl } = cbGetCouncilElements();
  if (!wrapper || !countEl) {
    console.warn("[CB_COUNCIL] pill elements missing");
    return;
  }

  const selectedCount =
    window.cbCouncilSelectedIds && window.cbCouncilSelectedIds.size
      ? window.cbCouncilSelectedIds.size
      : 0;

  const armed = !!window.cbCouncilArmed && selectedCount > 0;

  // Update the "+N" text
  countEl.textContent = `+${selectedCount}`;

  wrapper.classList.toggle("cb-council-armed", armed);
  wrapper.classList.toggle("cb-council-pill--armed", armed);
  wrapper.classList.toggle("cb-pill-armed-on", armed);
  
  // Clear any inline styles
  wrapper.style.background = "";
  wrapper.style.boxShadow = "";
  wrapper.style.color = "";
  wrapper.style.transform = "";

  console.log("[CB_COUNCIL] pill update", {
    count: selectedCount,
    armed,
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
  cbOnCouncilLabelClick(new Event("click"));
}

// Checkbox change handler (used by inline and legacy)
function cbOnCouncilCheckboxChange(id, checked) {
  if (!window.cbCouncilSelectedIds || !(window.cbCouncilSelectedIds instanceof Set)) {
    window.cbCouncilSelectedIds = new Set();
  }

  if (checked) {
    window.cbCouncilSelectedIds.add(id);
  } else {
    window.cbCouncilSelectedIds.delete(id);
  }

  if (window.cbCouncilSelectedIds.size === 0) {
    window.cbCouncilArmed = false;
  }

  cbUpdateCouncilPill();
}

// Right segment: selector only
function cbOnCouncilCountClick() {
  console.log("[CB_COUNCIL]", "count click");
  cbOpenCouncilModal();
}

// Left segment: toggle only if there is a selection
function cbOnCouncilLabelClick() {
  const count = window.cbCouncilSelectedIds ? window.cbCouncilSelectedIds.size : 0;
  console.log("[CB_COUNCIL]", "label click", { count, armed: window.cbCouncilArmed });

  if (!count) {
    console.log("[CB_COUNCIL]", "label ignored (no selection)");
    return;
  }

  window.cbCouncilArmed = !window.cbCouncilArmed;
  cbUpdateCouncilPill();
}

window.cbOnCouncilCheckboxChange = cbOnCouncilCheckboxChange;

// CB202: Modern pill toggle function for council panel
function cbToggleCouncilMember(id, buttonElement) {
  if (!window.cbCouncilSelectedIds || !(window.cbCouncilSelectedIds instanceof Set)) {
    window.cbCouncilSelectedIds = new Set();
  }

  // Toggle selection
  if (window.cbCouncilSelectedIds.has(id)) {
    window.cbCouncilSelectedIds.delete(id);
    buttonElement.classList.remove('is-selected');
  } else {
    window.cbCouncilSelectedIds.add(id);
    buttonElement.classList.add('is-selected');
  }

  // Disarm if no members selected
  if (window.cbCouncilSelectedIds.size === 0) {
    window.cbCouncilArmed = false;
  }

  cbUpdateCouncilPill();
}

window.cbToggleCouncilMember = cbToggleCouncilMember;
window.cbOnCouncilCountClick = cbOnCouncilCountClick;
window.cbOnCouncilLabelClick = cbOnCouncilLabelClick;

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

const cbDeriveUsageMetrics = (summary) => {
  const tokensIncluded =
    typeof summary?.limits?.tokensPerMonth === "number"
      ? summary.limits.tokensPerMonth
      : null;
  let tokensRemaining =
    typeof summary?.usage?.tokensRemaining === "number"
      ? summary.usage.tokensRemaining
      : null;
  let tokensUsed =
    typeof summary?.usage?.tokensUsedThisPeriod === "number"
      ? summary.usage.tokensUsedThisPeriod
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
    typeof tokensIncluded === "number" ? 0.25 * tokensIncluded : null;
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
  councilButton: document.getElementById("cb-council-button"),
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
  connectors: false,
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
    contactBtn.addEventListener("click", () => {
      window.location.href = "mailto:office@coolbits.ai?subject=Enterprise%20plan";
    });
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
  const rows = document.querySelectorAll("[data-council-id]");
  rows.forEach((row) => {
    const id = row.getAttribute("data-council-id");
    const checkbox = row.querySelector(".cb-council-checkbox");
    if (!id || !checkbox) return;

    const isChecked = cbCouncilSelectedIds.has(id);
    checkbox.checked = isChecked;
    row.classList.toggle("is-selected", isChecked);
    row.setAttribute("aria-selected", isChecked ? "true" : "false");
  });

  cbUpdateCouncilPill();
  cbRenderCouncilActive();
  cbRenderCouncilBar();
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
  const useCouncil = cbShouldUseCouncil();
  const councilMembers = useCouncil ? Array.from(cbCouncilSelectedIds) : [];
  if (useCouncil) {
    cbSetCouncilStatus(councilMembers, CB_COUNCIL_STATUS_PENDING);
  }
  const payload = {
    message,
    history: history.map((entry) => ({ ...entry })),
    tier: profile?.capabilities?.tier || profile?.tier || "guest",
    visitorId,
  };
  if (useCouncil) {
    payload.council = { enabled: true, members: councilMembers };
  }
  cbCouncilArmed = false;
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
  const useCouncil = cbShouldUseCouncil();
  const councilMembers = useCouncil ? Array.from(cbCouncilSelectedIds) : [];
  if (useCouncil) cbSetCouncilStatus(councilMembers, CB_COUNCIL_STATUS_PENDING);
  const payload = {
    firstMessage,
    workspaceId: workspaceKey,
    projectId: cbCurrentProjectId || null,
  };
  if (useCouncil) payload.council = { enabled: true, members: councilMembers };
  cbCouncilArmed = false;
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
  const useCouncil = cbShouldUseCouncil();
  const councilMembers = useCouncil ? Array.from(cbCouncilSelectedIds) : [];
  if (useCouncil) cbSetCouncilStatus(councilMembers, CB_COUNCIL_STATUS_PENDING);
  const payload = useCouncil
    ? { content, council: { enabled: true, members: councilMembers } }
    : { content };
  cbCouncilArmed = false;
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
    const nextCharge = cbFormatFriendlyDate(summary?.stripe?.currentPeriodEnd);
    if (nextCharge) {
      planNextChargeEl.textContent = `Next charge on ${nextCharge}`;
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
    usageEl.textContent = `Used: ${usedText} – Remaining: ${remainingText}`;
  }
  if (progressFill) {
    progressFill.style.width = `${Math.round((progressRatio || 0) * 100)}%`;
  }
  if (warningEl) {
    warningEl.hidden = !showLowTokens;
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
      window.location.href =
        "mailto:office@coolbits.ai?subject=CoolBits%20Billing";
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

const cbOpenAccountBilling = async () => {
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

const cbShowBillingToast = (type = "success") => {
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
    type === "cancel"
      ? "You canceled the billing update. Your current plan is unchanged."
      : "Your CoolBits subscription was updated successfully.";
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






