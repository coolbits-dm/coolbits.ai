const CONFIG = {
  API_BASE_URL: (window.COOLBITS_CONFIG && window.COOLBITS_CONFIG.API_BASE_URL) || "/api",
};

const API_BASE = CONFIG.API_BASE_URL;
const API_WORKSPACES = `${API_BASE}/workspaces`;
const API_REGISTRY = `${API_BASE}/connectors/registry`;
const AUTH_TOKEN_KEY = "cb_auth_token";
const WORKSPACE_STORAGE_KEY = "coolbits:workspace";

const state = {
  registry: null,
  workspaces: [],
  activeWorkspaceId: "business",
};

const elements = {
  workspaceList: document.getElementById("cb-connectors-workspaces"),
  grid: document.getElementById("cb-connectors-grid"),
  empty: document.getElementById("cb-connectors-empty"),
};

function getAuthToken() {
  try {
    return window.localStorage.getItem(AUTH_TOKEN_KEY) || "";
  } catch (_err) {
    return "";
  }
}

function getStoredWorkspaceId() {
  try {
    const stored = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    return stored && stored.trim() ? stored.trim() : "business";
  } catch (_err) {
    return "business";
  }
}

function saveWorkspaceId(value) {
  try {
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, value);
  } catch (_err) {
    // ignore
  }
}

function normalizeWorkspaceId(value, registry) {
  const trimmed = String(value || "").trim().toLowerCase();
  if (!trimmed) return "business";
  const alias = registry?.clientAliases?.workspaceId || {};
  return alias[trimmed] || trimmed;
}

function getAuthHeaders(base = {}) {
  const headers = { Accept: "application/json", ...base };
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function fetchJson(url, init = {}) {
  try {
    const response = await fetch(url, {
      ...init,
      headers: getAuthHeaders(init.headers || {}),
      credentials: "include",
    });
    const json = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, json };
  } catch (error) {
    return { ok: false, status: 0, json: { error: error?.message || "Network error" } };
  }
}

function setActiveWorkspace(workspaceId) {
  state.activeWorkspaceId = workspaceId;
  saveWorkspaceId(workspaceId);
  renderWorkspaces();
  renderGrid();
}

function renderWorkspaces() {
  if (!elements.workspaceList) return;
  const registry = state.registry;
  const fallback = Array.isArray(registry?.workspaces) ? registry.workspaces : [];
  const items = state.workspaces.length ? state.workspaces : fallback;
  elements.workspaceList.innerHTML = "";

  items.forEach((ws) => {
    const id = ws.id;
    const label = ws.name || ws.label || id;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cb-connectors-workspace-btn";
    btn.textContent = label;
    btn.classList.toggle("is-active", id === state.activeWorkspaceId);
    btn.title = `Switch to ${label}`;
    btn.addEventListener("click", () => setActiveWorkspace(id));
    elements.workspaceList.appendChild(btn);
  });
}

function buildConnectorMap(registry) {
  const map = new Map();
  (registry?.connectors || []).forEach((connector) => {
    if (connector?.id) map.set(connector.id, connector);
  });
  return map;
}

function formatAvailability(value) {
  if (!value) return "unknown";
  return value.replace(/_/g, " ");
}

function buildIconLabel(label) {
  if (!label) return "CB";
  const tokens = label.split(/\s+/).filter(Boolean);
  if (!tokens.length) return label.slice(0, 2).toUpperCase();
  return tokens[0].slice(0, 2).toUpperCase();
}

function renderGrid() {
  if (!elements.grid || !state.registry) return;
  const registry = state.registry;
  const panel = registry.panels?.[state.activeWorkspaceId] || [];
  const connectors = buildConnectorMap(registry);
  elements.grid.innerHTML = "";

  panel.forEach((connectorId) => {
    const connector = connectors.get(connectorId);
    const tile = document.createElement("div");
    tile.className = "cb-connector-tile";

    const header = document.createElement("div");
    header.className = "cb-connector-tile-header";

    const icon = document.createElement("div");
    icon.className = "cb-connector-icon";
    icon.textContent = buildIconLabel(connector?.label || connectorId);

    const title = document.createElement("div");
    title.className = "cb-connector-title";

    const name = document.createElement("h3");
    name.textContent = connector?.label || connectorId;

    const vendor = document.createElement("span");
    vendor.textContent = connector?.vendor ? connector.vendor : "";

    title.append(name, vendor);

    const badge = document.createElement("span");
    const availability = connector?.availability || "coming_soon";
    badge.className = `cb-connector-badge is-${availability}`;
    badge.textContent = formatAvailability(availability);

    header.append(icon, title, badge);

    const actions = document.createElement("div");
    actions.className = "cb-connector-actions";

    if (availability === "available" && connector?.ui?.href) {
      const action = document.createElement("a");
      action.className = "cb-connector-action";
      action.href = connector.ui.href;
      action.title = "Open";
      action.setAttribute("aria-label", "Open connector");
      action.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 17l10-10M9 7h8v8" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>`;
      actions.appendChild(action);
    } else {
      const action = document.createElement("button");
      action.type = "button";
      action.className = "cb-connector-action is-disabled";
      action.disabled = true;
      action.title = "Coming soon";
      action.setAttribute("aria-label", "Coming soon");
      action.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 12h12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"></path>
      </svg>`;
      actions.appendChild(action);
    }

    tile.append(header, actions);
    elements.grid.appendChild(tile);
  });
}

async function init() {
  const registryRes = await fetchJson(API_REGISTRY);
  if (!registryRes.ok) {
    if (elements.empty) {
      elements.empty.hidden = false;
    }
    return;
  }
  state.registry = registryRes.json;

  const workspaceRes = await fetchJson(API_WORKSPACES);
  const registryIds = new Set(state.registry.workspaces.map((ws) => ws.id));
  if (workspaceRes.ok && Array.isArray(workspaceRes.json?.items)) {
    state.workspaces = workspaceRes.json.items.filter(
      (ws) => ws.workspaceType === "system" && registryIds.has(ws.id)
    );
  }

  const stored = normalizeWorkspaceId(getStoredWorkspaceId(), state.registry);
  const fallback = registryIds.has("business") ? "business" : state.registry.workspaces[0]?.id;
  state.activeWorkspaceId = registryIds.has(stored) ? stored : fallback;

  renderWorkspaces();
  renderGrid();
}

init();
