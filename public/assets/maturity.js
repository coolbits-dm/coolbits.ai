const MATRIX_URL = "/assets/cmi-matrix.json";
const FORMULA_URL = "/assets/cmi-formulas.json";

const FALLBACK_MATRIX = {
  lastCalculated: "2025-12-25T15:34:00Z",
  indices: {
    pmi: {
      label: "Personal Maturity Index",
      summary: "Personal momentum, habits, and resilience across the last 30 days.",
      metrics: [
        { key: "focusScore", value: 79, description: "Depth and consistency of focused work sessions." },
        { key: "habitRegularity", value: 85, description: "Daily habit cadence and streak reliability." },
        { key: "decisionAutonomy", value: 77, description: "Speed of decisions made without external escalation." },
        { key: "selfRefinement", value: 81, description: "Quality of post-action reflection and improvement." },
        { key: "councilBalance", value: 75, description: "Balance between self direction and council guidance." },
      ],
    },
    bmi: {
      label: "Business Maturity Index",
      summary: "Business operating health, pipeline stability, and client retention.",
      metrics: [
        { key: "kpiCoverage", value: 68, description: "Share of KPIs instrumented across active accounts." },
        { key: "campaignSync", value: 74, description: "Alignment between campaigns, targets, and reporting." },
        { key: "councilDiscipline", value: 70, description: "Consistency of strategic council reviews." },
        { key: "budgetAlignment", value: 72, description: "Budget pacing and allocation precision." },
        { key: "snapshotUtilization", value: 71, description: "Regular use of snapshot reports for tracking." },
        { key: "industryContextScore", value: 60, description: "Incorporation of industry context in decisions." },
      ],
    },
    ami: {
      label: "Agentic Maturity Index",
      summary: "Agent orchestration, diversity, and workflow efficiency coverage.",
      metrics: [
        { key: "agentDiversity", value: 62, description: "Variety of AI agents and tools deployed." },
        { key: "agentDepth", value: 65, description: "Depth of agent integration and specialization." },
        { key: "modelExperimentation", value: 63, description: "Frequency of model experimentation and updates." },
        { key: "customizationLevel", value: 66, description: "Degree of customization of agent behaviors." },
        { key: "agentEfficiency", value: 64, description: "Efficiency gains from agent usage." },
      ],
    },
    dmi: {
      label: "Development Maturity Index",
      summary: "Release cadence, test coverage, and deployment discipline.",
      metrics: [
        { key: "releaseCadence", value: 80, description: "Frequency and regularity of releases." },
        { key: "infraCoverage", value: 78, description: "Infrastructure coverage and automation." },
        { key: "buildCouncilDepth", value: 72, description: "Depth of build and architecture reviews." },
        { key: "testInclusionRate", value: 85, description: "Rate of test inclusion in development." },
        { key: "deploymentDiscipline", value: 75, description: "Adherence to deployment best practices." },
      ],
    },
  },
  connectorInputs: [
    {
      source: "Google Ads",
      metrics: {
        kpiCoverage: 0.68,
        campaignSync: 0.74,
        agentEfficiency: 0.64,
        decisionAutonomy: 0.77,
      },
      addOns: [
        {
          key: "conversionQualityIndex",
          value: 0.85,
          category: "bmi",
          description: "Quality score of conversions versus cost.",
        },
      ],
    },
  ],
};

const FALLBACK_FORMULAS = {
  weights: {
    pmi: 0.4,
    bmi: 0.35,
    ami: 0.15,
    dmi: 0.1,
  },
  tiers: [
    { key: "high", min: 75, label: "Strong", className: "cb-maturity-badge--green" },
    { key: "mid", min: 50, label: "Balanced", className: "cb-maturity-badge--yellow" },
    { key: "low", min: 0, label: "At Risk", className: "cb-maturity-badge--red" },
  ],
};

const INDEX_KEYS = ["pmi", "bmi", "ami", "dmi"];

async function loadJson(url, fallback) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      return fallback;
    }
    const data = await response.json();
    return data || fallback;
  } catch (error) {
    return fallback;
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeValue(rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return null;
  }
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return null;
  return value <= 1 ? value * 100 : value;
}

function formatScore(value) {
  if (!Number.isFinite(value)) return "--";
  const formatted = value.toFixed(1);
  return formatted.endsWith(".0") ? formatted.slice(0, -2) : formatted;
}

function formatMetricValue(value) {
  return Number.isFinite(value) ? Math.round(value).toString() : "--";
}

function formatHeadline(value) {
  if (!Number.isFinite(value)) return "CMI: -- / 100";
  return `CMI: ${formatScore(value)} / 100`;
}

function formatTimestamp(iso) {
  if (!iso) return "--";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(
    date.getUTCHours(),
  )}:${pad(date.getUTCMinutes())}`;
}

function computeAverage(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) return 0;
  const sum = valid.reduce((acc, value) => acc + value, 0);
  return sum / valid.length;
}

function computeIndexScores(indices) {
  return INDEX_KEYS.reduce((acc, key) => {
    const metrics = indices[key]?.metrics || [];
    const values = metrics.map((metric) => normalizeValue(metric.value)).filter(Number.isFinite);
    acc[key] = computeAverage(values);
    return acc;
  }, {});
}

function computeCmi(scores, weights) {
  return INDEX_KEYS.reduce((acc, key) => {
    const weight = Number(weights?.[key] ?? 0);
    const value = Number(scores[key] || 0);
    return acc + weight * value;
  }, 0);
}

function getTiers(formulas) {
  const tiers = Array.isArray(formulas?.tiers) ? formulas.tiers : FALLBACK_FORMULAS.tiers;
  return tiers.slice().sort((a, b) => Number(b.min || 0) - Number(a.min || 0));
}

function getTier(value, tiers) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return tiers.find((tier) => safeValue >= Number(tier.min || 0)) || tiers[tiers.length - 1];
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function setMeter(index, value) {
  const meter = document.querySelector(`.cb-maturity-meter[data-index="${index}"]`);
  if (!meter) return;
  if (!Number.isFinite(value)) {
    meter.style.setProperty("--percent", 0);
    return;
  }
  const clamped = clamp(value, 0, 100);
  meter.style.setProperty("--percent", clamped);
}

function setBadge(value, tiers) {
  const badge = document.getElementById("cb-cmi-badge");
  if (!badge) return;
  const match = getTier(value, tiers);
  const classNames = tiers.map((tier) => tier.className).filter(Boolean);
  classNames.forEach((className) => badge.classList.remove(className));
  if (match?.className) {
    badge.classList.add(match.className);
  }
  badge.textContent = match?.label || "--";
}

function normalizeIndices(indices) {
  return INDEX_KEYS.reduce((acc, key) => {
    const index = indices?.[key] || {};
    acc[key] = {
      ...index,
      metrics: Array.isArray(index.metrics) ? index.metrics.slice() : [],
    };
    return acc;
  }, {});
}

function applyConnectorInputs(indices, connectorInputs) {
  const connectorMetrics = new Map();
  const addOnsByCategory = {};
  const inputs = Array.isArray(connectorInputs) ? connectorInputs : [];

  inputs.forEach((input) => {
    const source = input?.source || "Connector";
    const metrics = input?.metrics && typeof input.metrics === "object" ? input.metrics : {};
    Object.entries(metrics).forEach(([key, value]) => {
      const normalized = normalizeValue(value);
      if (!Number.isFinite(normalized)) return;
      connectorMetrics.set(key, { value: normalized, source });
    });

    const addOns = Array.isArray(input?.addOns) ? input.addOns : [];
    addOns.forEach((addon) => {
      const normalized = normalizeValue(addon?.value);
      if (!Number.isFinite(normalized)) return;
      const category = String(addon?.category || "").toLowerCase();
      if (!INDEX_KEYS.includes(category)) return;
      const entry = {
        key: addon?.key || "addonMetric",
        value: normalized,
        description: addon?.description || "",
        source,
        isAddon: true,
      };
      if (!addOnsByCategory[category]) {
        addOnsByCategory[category] = [];
      }
      addOnsByCategory[category].push(entry);
    });
  });

  INDEX_KEYS.forEach((key) => {
    const index = indices[key];
    if (!index?.metrics) return;
    index.metrics = index.metrics.map((metric) => {
      const normalized = normalizeValue(metric?.value);
      const override = connectorMetrics.get(metric?.key);
      if (!override) {
        return {
          ...metric,
          value: normalized,
        };
      }
      return {
        ...metric,
        value: override.value,
        source: override.source,
      };
    });
  });

  return { connectorMetrics, addOnsByCategory };
}

function setIndexSummaries(indices) {
  INDEX_KEYS.forEach((key) => {
    const card = document.querySelector(`.cb-maturity-card[data-index="${key}"]`);
    const note = card?.querySelector(".cb-maturity-card-note");
    if (!note) return;
    const summary = indices[key]?.summary;
    if (summary) {
      note.textContent = summary;
    }
  });
}

function renderMetrics(indices, addOnsByCategory, tiers) {
  INDEX_KEYS.forEach((key) => {
    const container = document.getElementById(`cb-${key}-metrics`);
    if (!container) return;
    const metrics = indices[key]?.metrics || [];
    const addOns = addOnsByCategory?.[key] || [];
    const list = document.createElement("ul");
    list.className = "cb-maturity-metric-list";
    container.innerHTML = "";
    [...metrics, ...addOns].forEach((metric) => {
      const item = document.createElement("li");
      item.className = "cb-maturity-metric";
      const title = document.createElement("div");
      title.className = "cb-maturity-metric-title";
      const nameWrap = document.createElement("span");
      nameWrap.className = "cb-maturity-metric-name-wrap";
      const name = document.createElement("span");
      name.className = "cb-maturity-metric-name";
      name.textContent = metric.key;
      nameWrap.appendChild(name);
      if (metric.isAddon) {
        const tag = document.createElement("span");
        tag.className = "cb-maturity-metric-tag";
        tag.textContent = "Add-on";
        nameWrap.appendChild(tag);
      }
      title.appendChild(nameWrap);
      const value = document.createElement("span");
      value.className = "cb-maturity-metric-value";
      const numericValue = normalizeValue(metric.value);
      value.textContent = formatMetricValue(numericValue);
      if (Number.isFinite(numericValue)) {
        value.dataset.tier = getTier(numericValue, tiers)?.key || "mid";
      }
      title.appendChild(value);
      const description = document.createElement("p");
      description.className = "cb-maturity-metric-description";
      description.textContent = metric.description || "";
      item.appendChild(title);
      item.appendChild(description);
      const extraParts = [];
      if (metric.example) {
        extraParts.push(metric.example);
      }
      if (metric.source) {
        extraParts.push(`Source: ${metric.source}`);
      }
      if (extraParts.length) {
        const extra = document.createElement("p");
        extra.className = "cb-maturity-metric-extra";
        extra.textContent = extraParts.join(" ");
        item.appendChild(extra);
      }
      list.appendChild(item);
    });
    container.appendChild(list);
  });
}

function buildMetricLookup(indices) {
  const lookup = new Map();
  INDEX_KEYS.forEach((key) => {
    const metrics = indices[key]?.metrics || [];
    metrics.forEach((metric) => {
      const normalized = normalizeValue(metric.value);
      if (Number.isFinite(normalized)) {
        lookup.set(metric.key, normalized);
      }
    });
  });
  return lookup;
}

function renderConnectorInputs(connectorMetrics, metricLookup) {
  const targets = ["decisionAutonomy", "kpiCoverage", "campaignSync", "agentEfficiency"];
  targets.forEach((key) => {
    const override = connectorMetrics.get(key);
    const value = override?.value ?? metricLookup.get(key);
    setText(`cb-inject-${key}`, formatMetricValue(value));
  });
}

async function initMaturityPage() {
  const [matrixData, formulaData] = await Promise.all([
    loadJson(MATRIX_URL, FALLBACK_MATRIX),
    loadJson(FORMULA_URL, FALLBACK_FORMULAS),
  ]);

  const indices = normalizeIndices(matrixData?.indices || FALLBACK_MATRIX.indices);
  const { connectorMetrics, addOnsByCategory } = applyConnectorInputs(
    indices,
    matrixData?.connectorInputs,
  );
  const tiers = getTiers(formulaData);
  const scores = computeIndexScores(indices);
  const cmiValue = computeCmi(scores, formulaData?.weights || FALLBACK_FORMULAS.weights);
  const snapshot = {
    cmi: cmiValue,
    ...scores,
    lastUpdated: matrixData?.lastCalculated || FALLBACK_MATRIX.lastCalculated,
  };

  setText("cb-cmi-score", formatHeadline(snapshot.cmi));
  setText("cb-cmi-meter-value", formatScore(snapshot.cmi));
  setMeter("cmi", snapshot.cmi);
  setBadge(snapshot.cmi, tiers);

  INDEX_KEYS.forEach((key) => {
    const value = Number(snapshot[key]);
    setText(`cb-${key}-value`, formatScore(value));
    setText(`cb-${key}-meter`, formatScore(value));
    setMeter(key, value);
  });

  const timeElement = document.getElementById("cb-last-updated");
  if (timeElement) {
    timeElement.dateTime = snapshot.lastUpdated || "";
    timeElement.textContent = formatTimestamp(snapshot.lastUpdated);
  }

  setIndexSummaries(indices);
  renderMetrics(indices, addOnsByCategory, tiers);
  renderConnectorInputs(connectorMetrics, buildMetricLookup(indices));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMaturityPage, { once: true });
} else {
  initMaturityPage();
}
