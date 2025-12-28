import fs from "node:fs/promises";
import path from "node:path";

const REGISTRY_PATH = path.resolve(
  process.cwd(),
  "app",
  "shared",
  "connectorsRegistry.v1.json"
);

function fail(message) {
  console.error(`[fail] ${message}`);
  process.exit(1);
}

function ok(message) {
  console.log(`[ok] ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

async function loadRegistry() {
  try {
    const raw = await fs.readFile(REGISTRY_PATH, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    fail(`unable to read registry: ${error?.message || error}`);
  }
}

function assertPanels(registry) {
  const expected = ["personal", "business", "agency", "developer"];
  const panels = registry.panels || {};
  const keys = Object.keys(panels).sort();
  const expectedSorted = [...expected].sort();
  assert(
    JSON.stringify(keys) === JSON.stringify(expectedSorted),
    `panels keys must be ${expected.join(", ")}`
  );
  ok("panels keys match PBAD");

  expected.forEach((key) => {
    const list = panels[key];
    assert(Array.isArray(list), `panel ${key} must be an array`);
    assert(list.length === 10, `panel ${key} must have 10 ids`);
  });
  ok("panel lengths are 10");
}

function assertConnectorIds(registry) {
  const connectors = Array.isArray(registry.connectors) ? registry.connectors : [];
  const ids = connectors.map((item) => item?.id).filter(Boolean);
  const unique = new Set(ids);
  assert(ids.length === unique.size, "connector ids must be unique");
  ok("connector ids are unique");

  const panelIds = Object.values(registry.panels || {})
    .flat()
    .filter(Boolean);
  const missing = panelIds.filter((id) => !unique.has(id));
  assert(missing.length === 0, `panel ids missing in connectors: ${missing.join(", ")}`);
  ok("panel ids exist in connectors");

  const available = connectors.filter((item) => item?.availability === "available");
  available.forEach((item) => {
    const href = item?.ui?.href;
    assert(
      typeof href === "string" && href.trim().length > 0,
      `available connector ${item?.id || "unknown"} missing ui.href`
    );
  });
  ok("available connectors have ui.href");
}

async function main() {
  const registry = await loadRegistry();
  assert(
    registry?.schemaVersion === "cb-connectors-registry.v1",
    "schemaVersion must be cb-connectors-registry.v1"
  );
  ok("schemaVersion is valid");

  assert(
    registry?.clientAliases?.workspaceId?.dev === "developer",
    "clientAliases.workspaceId.dev must be developer"
  );
  ok("client alias dev -> developer is set");

  assertPanels(registry);
  assertConnectorIds(registry);
}

main();
