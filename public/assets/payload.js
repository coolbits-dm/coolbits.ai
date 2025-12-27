const CONFIG = {
  API_BASE_URL: (window.COOLBITS_CONFIG && window.COOLBITS_CONFIG.API_BASE_URL) || "/api",
};

const API_BASE = CONFIG.API_BASE_URL;
const API_PAYLOADS = `${API_BASE}/payloads`;
const AUTH_TOKEN_KEY = "cb_auth_token";
const WORKSPACE_STORAGE_KEY = "coolbits:workspace";
const STAGED_PAYLOAD_STORAGE_KEY = "cb_staged_payloads";
const STAGED_PAYLOAD_IDS_KEY = "cb_staged_payload_ids";

const state = {
  items: [],
  nextCursor: null,
  loading: false,
  selectedId: null,
  selectedPayload: null,
  kind: "all",
  query: "",
};

const elements = {};

function getAuthToken() {
  try {
    return window.localStorage.getItem(AUTH_TOKEN_KEY) || "";
  } catch (_err) {
    return "";
  }
}

function getWorkspaceId() {
  try {
    const stored = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    return stored && stored.trim() ? stored.trim() : "business";
  } catch (_err) {
    return "business";
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

function formatHash(hash = "") {
  if (!hash) return "-";
  if (hash.length <= 12) return hash;
  return `${hash.slice(0, 4)}...${hash.slice(-4)}`;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function setLoading(isLoading) {
  state.loading = isLoading;
  if (elements.loadMore) {
    elements.loadMore.disabled = isLoading;
  }
}

function renderList() {
  if (!elements.list) return;
  elements.list.innerHTML = "";
  if (!state.items.length) {
    const empty = document.createElement("div");
    empty.className = "cb-payload-empty";
    empty.textContent = "No payloads found for this filter.";
    elements.list.appendChild(empty);
  } else {
    state.items.forEach((item) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "cb-payload-row";
      if (item.id === state.selectedId) {
        row.classList.add("is-active");
      }
      row.dataset.payloadId = item.id;
      const name = item.name && item.name.trim() ? item.name.trim() : "Untitled payload";
      const title = document.createElement("div");
      title.className = "cb-payload-row-title";
      title.textContent = name;
      const meta = document.createElement("div");
      meta.className = "cb-payload-row-meta";
      const kind = document.createElement("span");
      kind.textContent = item.kind || "selection";
      const hash = document.createElement("span");
      hash.textContent = formatHash(item.hash);
      const created = document.createElement("span");
      created.textContent = formatDate(item.createdAt);
      meta.append(kind, hash, created);
      row.append(title, meta);
      row.addEventListener("click", () => selectPayload(item.id));
      elements.list.appendChild(row);
    });
  }
  if (elements.loadMore) {
    elements.loadMore.hidden = !state.nextCursor;
  }
}

async function loadList({ reset = false } = {}) {
  if (state.loading) return;
  setLoading(true);
  if (reset) {
    state.items = [];
    state.nextCursor = null;
  }
  const params = new URLSearchParams();
  if (state.kind && state.kind !== "all") params.set("kind", state.kind);
  if (state.query) params.set("q", state.query);
  params.set("limit", "20");
  if (state.nextCursor) params.set("cursor", state.nextCursor);
  params.set("workspaceId", getWorkspaceId());

  const { ok, json } = await fetchJson(`${API_PAYLOADS}?${params.toString()}`, {
    method: "GET",
  });
  if (!ok) {
    renderInspectorError(json?.error || "Unable to load payloads.");
    setLoading(false);
    return;
  }
  const items = Array.isArray(json?.items) ? json.items : [];
  state.items = reset ? items : state.items.concat(items);
  state.nextCursor = json?.nextCursor || null;
  renderList();
  setLoading(false);
}

function setActiveFilter(kind) {
  state.kind = kind;
  if (!elements.filters) return;
  Array.from(elements.filters.querySelectorAll(".cb-filter-chip")).forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.kind === kind);
  });
}

function selectPayload(id) {
  if (!id || id === state.selectedId) return;
  state.selectedId = id;
  renderList();
  loadPayload(id);
}

async function loadPayload(id) {
  if (!id) return;
  const { ok, json } = await fetchJson(`${API_PAYLOADS}/${encodeURIComponent(id)}?workspaceId=${encodeURIComponent(getWorkspaceId())}`, {
    method: "GET",
  });
  if (!ok) {
    renderInspectorError(json?.error || "Unable to load payload.");
    return;
  }
  state.selectedPayload = json?.payload || null;
  renderInspector();
}

function renderInspectorError(message) {
  if (elements.empty) {
    elements.empty.textContent = message || "Unable to load payload.";
    elements.empty.hidden = false;
  }
  if (elements.detail) {
    elements.detail.hidden = true;
  }
}

function renderInspector() {
  const payload = state.selectedPayload;
  if (!payload) {
    renderInspectorError("Select a payload on the left to inspect its contents.");
    return;
  }
  if (elements.empty) elements.empty.hidden = true;
  if (elements.detail) elements.detail.hidden = false;

  const content = payload.contentJson || {};
  if (elements.nameInput) {
    elements.nameInput.value = payload.name || "";
  }
  if (elements.kindPill) {
    elements.kindPill.textContent = payload.kind || "selection";
  }
  if (elements.hash) {
    elements.hash.textContent = content.hash || payload.hash || "";
  }
  if (elements.raw) {
    elements.raw.textContent = JSON.stringify(content, null, 2);
  }

  renderSummary(content);
}

function renderSummary(content) {
  if (!elements.summaryPanel) return;
  const selection = content.selection || {};
  const ga4 = selection.ga4 || null;
  const ads = selection.googleads || null;
  const range = ads || ga4 || {};
  const availability = content.availability || {};

  const blocks = Array.isArray(range.blocks) ? range.blocks : [];
  const availabilityItems = Object.entries(availability);

  elements.summaryPanel.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "cb-payload-summary-grid";

  const addCard = (title, rows) => {
    const card = document.createElement("div");
    card.className = "cb-payload-summary-card";
    const header = document.createElement("h3");
    header.textContent = title;
    const list = document.createElement("ul");
    list.className = "cb-payload-summary-list";
    rows.forEach((row) => {
      const item = document.createElement("li");
      if (Array.isArray(row)) {
        const label = document.createElement("strong");
        label.textContent = `${row[0]}: `;
        const value = document.createElement("span");
        value.textContent = row[1] || "-";
        item.append(label, value);
      } else {
        item.textContent = row || "-";
      }
      list.appendChild(item);
    });
    card.append(header, list);
    grid.appendChild(card);
  };

  addCard("Selection", [
    ["Workspace", selection.workspaceId],
    ["Connector", selection.connector],
    ["From", range.from],
    ["To", range.to],
    ["Compare", range.compareMode],
    ["Compare from", range.compareFrom],
    ["Compare to", range.compareTo],
  ]);

  addCard("Identifiers", [
    ["Customer ID", ads?.customerId],
    ["Login CID", ads?.loginCustomerId],
    ["Property ID", ga4?.propertyId],
  ]);

  addCard("Blocks", [
    ["Count", String(blocks.length)],
    blocks.length ? blocks.join(", ") : "-",
  ]);

  const availabilityRows = availabilityItems.length
    ? availabilityItems.map(([key, value]) => {
      const note = value && value.note ? ` (${value.note})` : "";
      return [`${key}`, `${value.status || "-"}${note}`];
    })
    : ["-"];
  addCard("Availability", availabilityRows);

  elements.summaryPanel.appendChild(grid);
}

function shortHash(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.length <= 12) return raw;
  return `${raw.slice(0, 4)}...${raw.slice(-4)}`;
}

function getPayloadSummary(content) {
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
}

function computePayloadBytes(content) {
  try {
    const raw = JSON.stringify(content || {});
    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(raw).length;
    }
    return raw.length;
  } catch (_err) {
    return null;
  }
}

function buildStagedPayloadMeta(payload) {
  const content = payload?.contentJson || {};
  const hash = payload?.hash || content?.hash || "";
  const bytes = computePayloadBytes(content);
  return {
    id: payload?.id,
    name: payload?.name || "Untitled payload",
    kind: payload?.kind || content?.kind || "selection",
    hash,
    hashShort: shortHash(hash),
    bytes: Number.isFinite(bytes) ? bytes : null,
    summary: getPayloadSummary(content),
  };
}

function stagePayloads(payloads) {
  try {
    const ids = payloads.map((item) => item.id).filter(Boolean);
    window.localStorage.setItem(STAGED_PAYLOAD_STORAGE_KEY, JSON.stringify(payloads));
    window.localStorage.setItem(STAGED_PAYLOAD_IDS_KEY, JSON.stringify(ids));
  } catch (_err) {
    return;
  }
}

function handleSendToChat() {
  if (!state.selectedPayload) return;
  const meta = buildStagedPayloadMeta(state.selectedPayload);
  stagePayloads([meta]);
  window.location.href = "/chat";
}

function buildBlankPayload() {
  const workspaceId = getWorkspaceId();
  return {
    schemaVersion: "cbpl.v1",
    kind: "selection",
    selection: {
      workspaceId,
    },
    payload: {},
    availability: {},
    hash: "placeholder",
  };
}

async function createPayload(cbpl, nameOverride = null) {
  const name = nameOverride || cbpl?.name || "Untitled payload";
  const kind = cbpl?.kind || "selection";
  const body = {
    name,
    kind,
    cbpl,
    workspaceId: getWorkspaceId(),
  };
  const { ok, json } = await fetchJson(API_PAYLOADS, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!ok) {
    renderInspectorError(json?.message || "Unable to create payload.");
    return null;
  }
  return json?.payloadId || null;
}

async function handleUpload(file) {
  if (!file) return;
  const text = await file.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch (_err) {
    renderInspectorError("Invalid JSON file.");
    return;
  }
  const name = file.name.replace(/\.[^/.]+$/, "") || "Uploaded payload";
  const payloadId = await createPayload(parsed, name);
  if (payloadId) {
    await loadList({ reset: true });
    selectPayload(payloadId);
  }
}

async function handleDelete() {
  if (!state.selectedId) return;
  const confirmDelete = window.confirm("Delete this payload?");
  if (!confirmDelete) return;
  const { ok } = await fetchJson(`${API_PAYLOADS}/${encodeURIComponent(state.selectedId)}?workspaceId=${encodeURIComponent(getWorkspaceId())}`, {
    method: "DELETE",
  });
  if (!ok) {
    renderInspectorError("Unable to delete payload.");
    return;
  }
  state.items = state.items.filter((item) => item.id !== state.selectedId);
  state.selectedId = null;
  state.selectedPayload = null;
  renderList();
  renderInspector();
}

async function handleRename() {
  if (!state.selectedId || !elements.nameInput) return;
  const name = elements.nameInput.value.trim();
  const { ok, json } = await fetchJson(`${API_PAYLOADS}/${encodeURIComponent(state.selectedId)}?workspaceId=${encodeURIComponent(getWorkspaceId())}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!ok) {
    renderInspectorError(json?.message || "Unable to update name.");
    return;
  }
  const updated = json?.payload || null;
  if (updated) {
    state.selectedPayload = updated;
    state.items = state.items.map((item) => (item.id === updated.id ? { ...item, name: updated.name } : item));
    renderList();
    renderInspector();
  }
}

function handleCopyHash() {
  if (!elements.hash) return;
  const hash = elements.hash.textContent || "";
  if (!hash) return;
  navigator.clipboard?.writeText(hash).catch(() => {});
}

function handleDownload() {
  const payload = state.selectedPayload;
  if (!payload) return;
  const content = payload.contentJson || {};
  const blob = new Blob([JSON.stringify(content, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const name = (payload.name || payload.id || "payload").replace(/\s+/g, "-");
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}.cbpl`;
  link.click();
  URL.revokeObjectURL(url);
}

function setupTabs() {
  if (!elements.tabs) return;
  elements.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      elements.tabs.forEach((btn) => btn.classList.toggle("is-active", btn === tab));
      const target = tab.dataset.tab;
      elements.panels.forEach((panel) => {
        panel.hidden = panel.dataset.tabPanel !== target;
      });
    });
  });
}

function setupHandlers() {
  elements.search?.addEventListener("input", (event) => {
    const value = event.target.value || "";
    state.query = value.trim();
    loadList({ reset: true });
  });

  elements.filters?.addEventListener("click", (event) => {
    const btn = event.target.closest(".cb-filter-chip");
    if (!btn) return;
    const kind = btn.dataset.kind || "all";
    setActiveFilter(kind);
    loadList({ reset: true });
  });

  elements.loadMore?.addEventListener("click", () => loadList({ reset: false }));

  elements.upload?.addEventListener("click", () => elements.uploadInput?.click());
  elements.uploadInput?.addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (file) handleUpload(file);
    event.target.value = "";
  });

  elements.newButton?.addEventListener("click", async () => {
    const payloadId = await createPayload(buildBlankPayload(), "New payload");
    if (payloadId) {
      await loadList({ reset: true });
      selectPayload(payloadId);
    }
  });

  elements.send?.addEventListener("click", handleSendToChat);
  elements.delete?.addEventListener("click", handleDelete);
  elements.nameSave?.addEventListener("click", handleRename);
  elements.nameInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleRename();
    }
  });
  elements.copy?.addEventListener("click", handleCopyHash);
  elements.download?.addEventListener("click", handleDownload);
}

function hydrateElements() {
  elements.search = document.getElementById("cb-payload-search");
  elements.filters = document.getElementById("cb-payload-filters");
  elements.list = document.getElementById("cb-payload-list");
  elements.loadMore = document.getElementById("cb-payload-load-more");
  elements.empty = document.getElementById("cb-payload-empty");
  elements.detail = document.getElementById("cb-payload-detail");
  elements.nameInput = document.getElementById("cb-payload-name-input");
  elements.nameSave = document.getElementById("cb-payload-name-save");
  elements.kindPill = document.getElementById("cb-payload-kind-pill");
  elements.hash = document.getElementById("cb-payload-hash");
  elements.summaryPanel = document.querySelector('[data-tab-panel="summary"]');
  elements.raw = document.getElementById("cb-payload-raw");
  elements.upload = document.getElementById("cb-payload-upload");
  elements.uploadInput = document.getElementById("cb-payload-upload-input");
  elements.newButton = document.getElementById("cb-payload-new");
  elements.send = document.getElementById("cb-payload-send");
  elements.delete = document.getElementById("cb-payload-delete");
  elements.copy = document.getElementById("cb-payload-copy-hash");
  elements.download = document.getElementById("cb-payload-download");
  elements.tabs = Array.from(document.querySelectorAll(".cb-tab"));
  elements.panels = Array.from(document.querySelectorAll(".cb-payload-panel"));
}

function init() {
  hydrateElements();
  setupHandlers();
  setupTabs();
  renderInspector();
  setActiveFilter("all");
  loadList({ reset: true });
}

document.addEventListener("DOMContentLoaded", init);
