const CONFIG = {
  API_BASE_URL: (window.COOLBITS_CONFIG && window.COOLBITS_CONFIG.API_BASE_URL) || "/api",
};

const API_BASE = CONFIG.API_BASE_URL;
const AGENTS_REGISTRY_URL = "/api/public/agents-registry";
const API_CONTEXT_ACTIVE = `${API_BASE}/context/active`;
const API_CONTEXT_ACTIVATE = `${API_BASE}/context/activate`;
const AUTH_TOKEN_KEY = "cb_auth_token";

const PROVIDER_API_MAP = {
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

const PROVIDER_UI_MAP = {
  openai: "chatgpt",
  anthropic: "claude",
  google: "gemini",
  xai: "grok",
  deepseek: "auto",
  auto: "auto",
};

const WORKSPACE_LABELS = {
  business: "Business",
  agency: "Agency",
  developer: "Dev",
  personal: "Personal",
  custom: "Custom",
};

const WORKSPACE_ALIASES = {
  dev: "developer",
  developer: "developer",
  business: "business",
  agency: "agency",
  personal: "personal",
  cbp: "personal",
  cba: "agency",
  cbb: "business",
  cbd: "developer",
};

const COUNCIL_BY_WORKSPACE = {
  business: "business",
  agency: "performance",
  developer: "build",
};

const ROLE_OVERRIDES = {
  "cbAgent-P-001-axis": { roleSlug: "camarad", roleLabel: "Camarad" },
  "cbAgent-P-002-finance": { roleSlug: "finance", roleLabel: "Finance" },
  "cbAgent-P-003-ops": { roleSlug: "ops", roleLabel: "Ops" },
  "cbAgent-P-004-focus": { roleSlug: "focus", roleLabel: "Focus" },
  "cbAgent-P-005-lifetrack": { roleSlug: "life", roleLabel: "Life" },
};

const SAMPLE_BY_WORKSPACE = {
  business: [
    "Review quarterly KPIs and flag risks.",
    "Summarize priorities for the next 30 days.",
    "Outline a growth experiment brief.",
  ],
  agency: [
    "Audit PPC performance and propose next steps.",
    "Draft a creative brief for a new campaign.",
    "Identify tracking gaps in GA4.",
  ],
  developer: [
    "Outline an API spec for a new integration.",
    "Assess technical risks and rollout steps.",
    "Summarize infra guardrails for a release.",
  ],
  personal: [
    "Plan your focus blocks for today.",
    "Review a weekly habits snapshot.",
    "Draft a personal routine experiment.",
  ],
  custom: [
    "Describe what you want this agent to do.",
    "Draft a short brief to guide the agent.",
  ],
};

const CONNECTOR_STORAGE_PREFIX = "coolbits:agent-connector:";
const CONNECTOR_DEFAULT_STATE = {
  mode: "premium",
  byokConnected: false,
  byokLast4: "",
  premiumEnabled: false,
  premiumUsed: 0,
  premiumLimit: 200,
};

const ROLE_HINTS = {
  ceo: "Focus on strategy, priorities, and trade-offs.",
  cto: "Architecture, technical risks, and delivery.",
  cfo: "Budgets, ROI, and financial guardrails.",
  coo: "Execution, ops, and process alignment.",
  cmo: "Growth strategy, messaging, and funnel ideas.",
  ppc: "Paid media performance and structure.",
  analytics: "KPI snapshots and insight summaries.",
  creative: "Copy and asset directions.",
  cro: "Conversion optimization hypotheses.",
  account: "Client strategy and expectations.",
  devops: "Reliability, infra, and cost guardrails.",
  leaddev: "Delivery plans and architecture.",
  backend: "APIs, data models, and services.",
  frontend: "UI architecture and UX quality.",
  security: "Risk and access posture.",
  camarad: "Personal context orchestration.",
  finance: "Personal budgeting and planning.",
  ops: "Routines and systems.",
  focus: "Productivity and priorities.",
  life: "Personal tracking and insights.",
};

const activeContextState = {
  status: "idle",
  context: null,
  error: null,
};

const $ = (id) => document.getElementById(id);

function getAuthToken() {
  try {
    return window.localStorage.getItem(AUTH_TOKEN_KEY) || "";
  } catch (_err) {
    return "";
  }
}

function getAuthHeaders(base = {}) {
  const headers = { Accept: "application/json", ...base };
  const token = getAuthToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function fetchJson(input, init = {}) {
  try {
    const response = await fetch(input, {
      ...init,
      headers: getAuthHeaders(init.headers || {}),
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
    console.warn("[AGENTS_FETCH]", error);
    return { ok: false, status: 0, json: null };
  }
}

function normalizeProviderForApi(value) {
  if (!value) return "auto";
  const key = String(value).trim().toLowerCase();
  return PROVIDER_API_MAP[key] || "auto";
}

function normalizeProviderForUi(value) {
  if (!value) return "auto";
  const key = String(value).trim().toLowerCase();
  return PROVIDER_UI_MAP[key] || (PROVIDER_API_MAP[key] ? key : "auto");
}

function formatModelLabel(value) {
  if (!value) return "Auto";
  return String(value).trim().replace(/^vertex-/, "").replace(/^openai-/, "");
}

function getConnectorStorageKey(agentId) {
  return `${CONNECTOR_STORAGE_PREFIX}${agentId}`;
}

function loadConnectorState(agentId) {
  const key = getConnectorStorageKey(agentId);
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return { ...CONNECTOR_DEFAULT_STATE };
    const parsed = JSON.parse(raw);
    return {
      ...CONNECTOR_DEFAULT_STATE,
      ...parsed,
      premiumUsed: Number(parsed?.premiumUsed) || 0,
      premiumLimit: Number(parsed?.premiumLimit) || CONNECTOR_DEFAULT_STATE.premiumLimit,
    };
  } catch (_err) {
    return { ...CONNECTOR_DEFAULT_STATE };
  }
}

function saveConnectorState(agentId, state) {
  const key = getConnectorStorageKey(agentId);
  try {
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch (_err) {
    // Ignore storage errors in preview-only UI.
  }
}

function initConnectorCard(agent, enabled, onBillingChange) {
  const byokInput = $("cb-agent-byok-key");
  const byokSave = $("cb-agent-byok-save");
  const byokStatus = $("cb-agent-byok-status");
  const premiumToggle = $("cb-agent-premium-toggle");
  const premiumStatus = $("cb-agent-premium-status");
  const premiumUsage = $("cb-agent-premium-usage");
  const modeInputs = Array.from(
    document.querySelectorAll('input[name="cb-agent-connector-mode"]')
  );
  const byokBody = document.querySelector('[data-connector-mode="byok"]');
  const premiumBody = document.querySelector('[data-connector-mode="premium"]');
  const byokOption = document.querySelector('[data-connector-option="byok"]');
  const premiumOption = document.querySelector('[data-connector-option="premium"]');

  if (!byokInput || !byokSave || !premiumToggle || !byokStatus || !premiumStatus) {
    return;
  }

  const state = loadConnectorState(agent.id);

  const updateStatusClass = (el, status) => {
    if (!el) return;
    el.classList.remove("is-ok", "is-warn");
    if (status) {
      el.classList.add(status);
    }
  };

  const updateView = () => {
    modeInputs.forEach((input) => {
      input.checked = input.value === state.mode;
    });
    if (byokBody) {
      byokBody.classList.toggle("is-active", state.mode === "byok");
    }
    if (premiumBody) {
      premiumBody.classList.toggle("is-active", state.mode === "premium");
    }
    if (byokOption) {
      byokOption.classList.toggle("is-active", state.mode === "byok");
    }
    if (premiumOption) {
      premiumOption.classList.toggle("is-active", state.mode === "premium");
    }

    if (byokStatus) {
      if (state.byokConnected) {
        byokStatus.textContent = state.byokLast4
          ? `Connected · ••••${state.byokLast4}`
          : "Connected";
        updateStatusClass(byokStatus, "is-ok");
      } else {
        byokStatus.textContent = "Not connected";
        updateStatusClass(byokStatus, "is-warn");
      }
    }

    if (premiumStatus) {
      premiumStatus.textContent = state.premiumEnabled ? "Enabled" : "Not enabled";
      updateStatusClass(premiumStatus, state.premiumEnabled ? "is-ok" : "is-warn");
    }

    if (premiumUsage) {
      premiumUsage.textContent = `Premium requests: ${state.premiumUsed} / ${state.premiumLimit}`;
    }

    if (premiumToggle) {
      premiumToggle.textContent = state.premiumEnabled
        ? "Disable premium tokens"
        : "Enable premium tokens";
    }

    saveConnectorState(agent.id, state);
  };

  modeInputs.forEach((input) => {
    if (input.dataset.bound !== "true") {
      input.addEventListener("change", () => {
        state.mode = input.value || "premium";
        updateView();
        if (typeof onBillingChange === "function") {
          onBillingChange(state);
        }
      });
      input.dataset.bound = "true";
    }
    input.disabled = !enabled;
  });

  if (!enabled) {
    byokInput.disabled = true;
    byokSave.disabled = true;
    premiumToggle.disabled = true;
  }

  if (byokSave && byokSave.dataset.bound !== "true") {
    byokSave.addEventListener("click", () => {
      const value = (byokInput.value || "").trim();
      if (value.length < 10) {
        if (byokStatus) {
          byokStatus.textContent = "Enter a valid API key.";
          updateStatusClass(byokStatus, "is-warn");
        }
        return;
      }
      state.byokConnected = true;
      state.byokLast4 = value.slice(-4);
      state.mode = "byok";
      byokInput.value = "";
      updateView();
      if (typeof onBillingChange === "function") {
        onBillingChange(state);
      }
    });
    byokSave.dataset.bound = "true";
  }

  if (premiumToggle && premiumToggle.dataset.bound !== "true") {
    premiumToggle.addEventListener("click", () => {
      state.premiumEnabled = !state.premiumEnabled;
      state.mode = "premium";
      updateView();
      if (typeof onBillingChange === "function") {
        onBillingChange(state);
      }
    });
    premiumToggle.dataset.bound = "true";
  }

  updateView();
  return state;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeWorkspaceSlug(value) {
  if (!value) return null;
  const key = String(value || "").toLowerCase();
  return WORKSPACE_ALIASES[key] || null;
}

function deriveWorkspace(agentId) {
  if (agentId.includes("-B-")) return "business";
  if (agentId.includes("-A-")) return "agency";
  if (agentId.includes("-D-")) return "developer";
  if (agentId.includes("-P-")) return "personal";
  if (agentId.includes("-X-")) return "custom";
  return "custom";
}

function deriveRole(agent) {
  const override = ROLE_OVERRIDES[agent.id];
  if (override) return override;
  const label = agent.label || "";
  return { roleSlug: slugify(label), roleLabel: label || "Agent" };
}

function parseNameSegment(segment) {
  if (!segment) return { defaultName: "", customName: "" };
  const decoded = decodeURIComponent(segment);
  const parts = decoded.split("--");
  const normalize = (value) => value.replace(/-/g, " ").trim();
  const defaultName = normalize(parts[0] || "");
  const customName = normalize(parts[1] || "");
  return { defaultName, customName };
}

function getDisplayName({ defaultName, customName, fallback }) {
  if (customName) return customName;
  if (defaultName) return defaultName;
  return fallback;
}

function getInitials(name) {
  const safe = String(name || "").trim();
  if (!safe) return "CB";
  const parts = safe.split(" ").filter(Boolean);
  const initials = parts.slice(0, 2).map((p) => p[0].toUpperCase()).join("");
  return initials || safe.slice(0, 2).toUpperCase();
}

function buildNameSlug(value) {
  return encodeURIComponent(String(value || "").trim().replace(/\s+/g, "-"));
}

function buildAgentPath(agent, { defaultName, customName } = {}) {
  const workspace = deriveWorkspace(agent.id);
  const role = deriveRole(agent);
  const defaultLabel = defaultName || role.roleLabel || agent.label || agent.id;
  const base = [
    "agents",
    workspace,
    role.roleSlug || slugify(agent.label || agent.id),
    agent.id,
  ];
  const nameBits = [buildNameSlug(defaultLabel)];
  if (customName) {
    nameBits.push(buildNameSlug(customName));
  }
  base.push(nameBits.join("--"));
  return `/${base.join("/")}`;
}

function setText(el, value) {
  if (!el) return;
  el.textContent = value || "";
}

function buildInfoRows(items) {
  const wrap = document.createElement("div");
  wrap.className = "cb-agent-kv";
  items.forEach(({ label, value }) => {
    const row = document.createElement("div");
    row.className = "cb-agent-kv-row";
    const key = document.createElement("div");
    key.className = "cb-agent-kv-label";
    key.textContent = label;
    const val = document.createElement("div");
    val.textContent = value || "-";
    row.appendChild(key);
    row.appendChild(val);
    wrap.appendChild(row);
  });
  return wrap;
}

function getStatusLabel(status) {
  if (status === "active") return "Active";
  if (status === "pending") return "Pending";
  if (status === "error") return "Error";
  return "Idle";
}

function updateActiveStatusUi(status) {
  const led = $("cb-agent-active-led");
  const text = $("cb-agent-active-text");
  const modelStatus = $("cb-agent-model-status");
  const normalized = status || "idle";
  const label = getStatusLabel(normalized);
  if (led) {
    led.setAttribute("data-status", normalized);
  }
  if (text) {
    text.textContent = label;
  }
  if (modelStatus) {
    modelStatus.textContent = label;
  }
}

function updateActiveAgentInfo(context, agent, params = {}) {
  const info = $("cb-agent-info");
  if (!info) return;
  info.innerHTML = "";
  if (!context) {
    info.appendChild(
      buildInfoRows([{ label: "Status", value: getStatusLabel(activeContextState.status) }])
    );
    return;
  }
  const workspaceSlug =
    normalizeWorkspaceSlug(context.workspace) ||
    (String(context.workspace || "").toLowerCase() === "custom" ? "custom" : null);
  const workspaceLabel = WORKSPACE_LABELS[workspaceSlug] || workspaceSlug || "Workspace";
  const billingLabel = context.billingSource === "byok" ? "BYOK" : "CoolBits";
  const rows = [
    { label: "Workspace", value: workspaceLabel },
    { label: "Role", value: context.role || agent?.label || "-" },
    { label: "Agent ID", value: context.agentId || agent?.id || "-" },
    { label: "Status", value: getStatusLabel(context.status) },
    { label: "Default name", value: context.defaultName || agent?.label || "-" },
    { label: "Custom name", value: context.customName || "-" },
    { label: "Provider", value: context.provider || "auto" },
    { label: "Model", value: formatModelLabel(context.model || "auto") },
    { label: "Billing", value: billingLabel },
  ];
  info.appendChild(buildInfoRows(rows));

  const displayName = context.customName || context.defaultName || agent?.label || agent?.id || "Agent";
  setText($("cb-agent-name"), displayName);
  setText($("cb-agent-role"), `${context.role || agent?.label || "Agent"} - ${context.agentId || agent?.id || ""}`);
  setText($("cb-agent-icon-id"), context.agentId || agent?.id || "");
  setText($("cb-agent-avatar"), getInitials(displayName));
  if (workspaceLabel) {
    setText($("cb-agent-workspace"), workspaceLabel);
  }
}

function applyContextToEditor(context) {
  if (!context) return;
  const modelSelect = $("cb-agent-model-select");
  if (!modelSelect) return;
  const uiProvider = normalizeProviderForUi(context.provider);
  if (uiProvider && modelSelect.value !== uiProvider) {
    modelSelect.value = uiProvider;
  }
}

async function activateContext(requested, reason) {
  if (typeof window.cbActivateContext === "function") {
    return window.cbActivateContext(requested, { reason });
  }
  const { ok, json } = await fetchJson(API_CONTEXT_ACTIVATE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requested || {}),
  });
  if (!ok || !json?.ok) {
    return null;
  }
  return json.context;
}

function buildActiveContextPayload(agent, params, connectorState, overrides = {}) {
  const workspace = deriveWorkspace(agent.id);
  const names = parseNameSegment(params?.nameSegment);
  const modelSelect = $("cb-agent-model-select");
  const providerValue = modelSelect?.value || "auto";
  const provider = normalizeProviderForApi(providerValue);
  const billingSource =
    connectorState?.mode === "byok" && connectorState.byokConnected
      ? "byok"
      : "coolbits";

  return {
    workspace,
    agentId: agent.id,
    provider,
    model: "auto",
    billingSource,
    customName: names.customName || null,
    byokKeyPresent: connectorState?.byokConnected || false,
    byokKeyLast4: connectorState?.byokLast4 || "",
    ...overrides,
  };
}

async function activateContextForAgent(agent, params, connectorState, reason, overrides = {}) {
  if (!getAuthToken()) {
    activeContextState.status = "idle";
    updateActiveStatusUi("idle");
    return null;
  }
  updateActiveStatusUi("pending");
  activeContextState.status = "pending";
  const payload = buildActiveContextPayload(agent, params, connectorState, overrides);
  const context = await activateContext(payload, reason || "agent-page");
  if (!context) {
    activeContextState.status = "error";
    activeContextState.error = { message: "Unable to activate context." };
    updateActiveStatusUi("error");
    updateActiveAgentInfo(activeContextState.context, agent, params);
    return null;
  }
  activeContextState.status = context.status || "active";
  activeContextState.context = context;
  activeContextState.error = null;
  updateActiveStatusUi(activeContextState.status);
  applyContextToEditor(context);
  updateActiveAgentInfo(context, agent, params);
  return context;
}

function renderSamples(samples, enabled) {
  const container = $("cb-agent-samples");
  if (!container) return;
  container.innerHTML = "";
  samples.forEach((sample) => {
    const div = document.createElement("div");
    div.className = "cb-agent-sample";
    if (!enabled) {
      div.classList.add("is-disabled");
    }
    div.textContent = sample;
    container.appendChild(div);
  });
}

function renderAgent(agent, params) {
  const root = document.body;
  const workspace = deriveWorkspace(agent.id);
  const workspaceLabel = WORKSPACE_LABELS[workspace] || "Workspace";
  const role = deriveRole(agent);
  const names = parseNameSegment(params.nameSegment);
  const displayName = getDisplayName({
    defaultName: names.defaultName,
    customName: names.customName,
    fallback: role.roleLabel || agent.label || agent.id,
  });
  const roleHint = ROLE_HINTS[role.roleSlug] || "";
  const description = agent.role || roleHint;
  const enabled = Boolean(agent.enabled);

  root.classList.toggle("is-disabled", !enabled);
  setText($("cb-agent-workspace"), workspaceLabel);
  setText($("cb-agent-name"), displayName);
  setText($("cb-agent-role"), `${role.roleLabel} - ${agent.id}`);
  setText($("cb-agent-description"), description);
  setText($("cb-agent-icon-id"), agent.id);
  setText($("cb-agent-avatar"), getInitials(displayName));

  const icon = $("cb-agent-icon");
  if (icon) {
    icon.dataset.workspace = workspace;
    icon.dataset.agentId = agent.id;
  }

  const statusPill = $("cb-agent-status-pill");
  if (statusPill) {
    statusPill.textContent = enabled ? "Enabled" : "Coming soon";
    statusPill.classList.toggle("is-disabled", !enabled);
  }

  const banner = $("cb-agent-banner");
  if (banner) {
    banner.hidden = enabled;
  }

  updateActiveStatusUi(activeContextState.status);
  updateActiveAgentInfo(activeContextState.context, agent, params);
  applyContextToEditor(activeContextState.context);

  const grid = $("cb-agent-grid");
  if (grid) {
    grid.hidden = false;
  }

  const modelSelect = $("cb-agent-model-select");
  const connectorState = loadConnectorState(agent.id);
  if (modelSelect) {
    modelSelect.disabled = !enabled;
  }
  updateActiveStatusUi(enabled ? activeContextState.status : "idle");

  if (modelSelect && enabled) {
    modelSelect.addEventListener("change", () => {
      activateContextForAgent(agent, params, connectorState, "provider-change");
    });
  }

  const samples = SAMPLE_BY_WORKSPACE[workspace] || SAMPLE_BY_WORKSPACE.custom;
  renderSamples(samples, enabled);

  const sandboxInput = $("cb-agent-sandbox-input");
  const sandboxSend = $("cb-agent-sandbox-send");
  const sandboxOutput = $("cb-agent-sandbox-output");

  if (sandboxInput) sandboxInput.disabled = !enabled;
  if (sandboxSend) sandboxSend.disabled = !enabled;

  if (sandboxSend && sandboxOutput && enabled) {
    sandboxSend.addEventListener("click", () => {
      const value = sandboxInput?.value?.trim() || "Your prompt";
      sandboxOutput.textContent = `Simulation only. "${displayName}" would respond to: ${value}`;
    });
  }

  const boundConnectorState = initConnectorCard(agent, enabled, (nextState) => {
    if (nextState) {
      connectorState.mode = nextState.mode;
      connectorState.byokConnected = nextState.byokConnected;
      connectorState.byokLast4 = nextState.byokLast4;
      connectorState.premiumEnabled = nextState.premiumEnabled;
      connectorState.premiumUsed = nextState.premiumUsed;
      connectorState.premiumLimit = nextState.premiumLimit;
    }
    activateContextForAgent(agent, params, connectorState, "billing-change");
  });
  if (boundConnectorState) {
    connectorState.mode = boundConnectorState.mode;
    connectorState.byokConnected = boundConnectorState.byokConnected;
    connectorState.byokLast4 = boundConnectorState.byokLast4;
    connectorState.premiumEnabled = boundConnectorState.premiumEnabled;
    connectorState.premiumUsed = boundConnectorState.premiumUsed;
    connectorState.premiumLimit = boundConnectorState.premiumLimit;
  }

  if (enabled) {
    activateContextForAgent(agent, params, connectorState, "agent-load");
  }

  document.title = `${displayName} - Agent - CoolBits.ai`;
}

function renderDirectory(
  agents,
  { workspaceSlug, roleSlug } = {},
  { notFound = false, activeCouncil = null } = {}
) {
  const directory = $("cb-agent-directory");
  const grid = $("cb-agent-directory-grid");
  const title = $("cb-agent-directory-title");
  const subtitle = $("cb-agent-directory-subtitle");
  if (!directory || !grid) return;

  const hero = $("cb-agent-hero");
  const statusPill = $("cb-agent-status-pill");
  const banner = $("cb-agent-banner");
  const cards = $("cb-agent-grid");
  if (hero) hero.hidden = true;
  if (statusPill) statusPill.hidden = true;
  if (banner) banner.hidden = true;
  if (cards) cards.hidden = true;

  directory.hidden = false;
  grid.innerHTML = "";

  const workspace = normalizeWorkspaceSlug(workspaceSlug);
  const councilSlug = activeCouncil ? String(activeCouncil) : null;
  const filtered = agents.filter((agent) => {
    if (workspace && deriveWorkspace(agent.id) !== workspace) return false;
    if (roleSlug) {
      const role = deriveRole(agent);
      if (role.roleSlug !== slugify(roleSlug)) return false;
    }
    return true;
  });

  const heading = workspace ? `${WORKSPACE_LABELS[workspace] || "Agents"} agents` : "Agent Directory";
  setText(title, notFound ? "Agent not found" : heading);
  if (subtitle) {
    subtitle.textContent = notFound
      ? "We could not locate that agent. Pick another profile below."
      : "Pick an agent to preview its profile and mocked interface.";
  }

  const list = filtered.length ? filtered : agents;
  list.forEach((agent) => {
    const role = deriveRole(agent);
    const workspaceKey = deriveWorkspace(agent.id);
    const defaultName = role.roleLabel || agent.label || agent.id;
    const href = buildAgentPath(agent, { defaultName });
    const card = document.createElement("a");
    card.href = href;
    card.className = "cb-agent-directory-card";
    if (!agent.enabled) {
      card.classList.add("is-disabled");
    }
    const inCouncil =
      councilSlug &&
      Array.isArray(agent.councils) &&
      agent.councils.includes(councilSlug);
    if (inCouncil) {
      card.classList.add("is-in-council");
    }

    const meta = document.createElement("div");
    meta.className = "cb-agent-directory-meta";

    const avatar = document.createElement("div");
    avatar.className = "cb-agent-directory-avatar";
    avatar.textContent = getInitials(defaultName);

    const text = document.createElement("div");
    const titleEl = document.createElement("div");
    titleEl.className = "cb-agent-directory-title";
    titleEl.textContent = `${defaultName} - ${role.roleLabel}`;
    const subtitleEl = document.createElement("div");
    subtitleEl.className = "cb-agent-directory-subtitle";
    subtitleEl.textContent = WORKSPACE_LABELS[workspaceKey] || "Workspace";
    text.appendChild(titleEl);
    text.appendChild(subtitleEl);

    meta.appendChild(avatar);
    meta.appendChild(text);

    const status = document.createElement("div");
    status.className = "cb-agent-directory-status";
    status.textContent = agent.enabled ? "Enabled" : "Coming soon";

    card.appendChild(meta);
    const footer = document.createElement("div");
    footer.className = "cb-agent-directory-footer";
    if (inCouncil) {
      const badge = document.createElement("div");
      badge.className = "cb-agent-directory-badge";
      badge.textContent = "In Council";
      footer.appendChild(badge);
    }
    footer.appendChild(status);
    card.appendChild(footer);
    grid.appendChild(card);
  });
}

async function fetchAgents() {
  const res = await fetch(AGENTS_REGISTRY_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error("registry_unavailable");
  }
  const data = await res.json().catch(() => ({}));
  const list = Array.isArray(data.agents) ? data.agents : [];
  return list.map((agent) => ({
    ...agent,
    councils: Array.isArray(agent.councils) ? agent.councils.filter(Boolean) : [],
  }));
}

function parsePath() {
  const segments = window.location.pathname.split("/").filter(Boolean);
  if (!segments.length || segments[0] !== "agents") {
    return {};
  }
  const [workspaceSlug, roleSlug, agentId, nameSegment] = segments.slice(1);
  return {
    workspaceSlug,
    roleSlug,
    agentId,
    nameSegment,
  };
}

async function init() {
  let agents = [];
  try {
    agents = await fetchAgents();
  } catch (_err) {
    renderDirectory([], {}, { notFound: true });
    return;
  }

  const params = parsePath();
  const query = new URLSearchParams(window.location.search || "");
  const queryWorkspace = normalizeWorkspaceSlug(query.get("workspace"));
  const pathWorkspace = normalizeWorkspaceSlug(params.workspaceSlug);
  const activeWorkspace = pathWorkspace || queryWorkspace;
  const activeCouncil = activeWorkspace ? COUNCIL_BY_WORKSPACE[activeWorkspace] || null : null;
  if (!params.agentId) {
    const directoryParams = {
      workspaceSlug: params.workspaceSlug || queryWorkspace,
      roleSlug: params.roleSlug,
    };
    renderDirectory(agents, directoryParams, { activeCouncil });
    return;
  }

  const agent = agents.find((item) => item.id === params.agentId);
  if (!agent) {
    const directoryParams = {
      workspaceSlug: params.workspaceSlug || queryWorkspace,
      roleSlug: params.roleSlug,
    };
    renderDirectory(agents, directoryParams, { notFound: true, activeCouncil });
    return;
  }

  renderAgent(agent, params);
}

init();
