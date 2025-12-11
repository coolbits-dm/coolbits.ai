export const CB_COUNCIL_AXES = ['cbA', 'cbB', 'cbD', 'cbP'];

export const FIB_LEVELS = [
  1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597, 2584, 4181,
  6765, 10946, 17711,
];

export function fibBucket(x = 0) {
  if (x <= 0) return 1;
  for (let i = 0; i < FIB_LEVELS.length; i += 1) {
    if (x <= FIB_LEVELS[i]) return i + 1;
  }
  return 22;
}

export function computeAxisScore(metrics = {}) {
  const readyAgents = Number(metrics.readyAgents ?? metrics.ready ?? 0) || 0;
  const activeServices = Number(metrics.activeServices ?? 0) || 0;
  const alerts = Number(metrics.alerts ?? 0) || 0;
  return readyAgents * 1.0 + activeServices * 0.5 + alerts * 0.75;
}

export function normalizeOrbState(councilState = {}) {
  const readyByAxis = councilState.readyByAxis || {};
  const rawByAxis = councilState.rawByAxis || {};

  const totals_by_axis = CB_COUNCIL_AXES.reduce((acc, axis) => {
    const raw = rawByAxis[axis] || {
      readyAgents: readyByAxis[axis] || 0,
      activeServices: 0,
      alerts: 0,
      last24hTokens: 0,
    };
    acc[axis] = computeAxisScore(raw);
    return acc;
  }, {});

  const level_by_axis = CB_COUNCIL_AXES.reduce((acc, axis) => {
    acc[axis] = fibBucket(totals_by_axis[axis]);
    return acc;
  }, {});

  const total = CB_COUNCIL_AXES.reduce((acc, axis) => acc + (totals_by_axis[axis] || 0), 0);

  return {
    level_total: fibBucket(total),
    level_by_axis,
    totals_by_axis,
  };
}

export function buildCanonicalCouncilAxisState(workspaceMode = 'cbA', overrides = {}) {
  const byAxisInput = overrides.byAxis || overrides.by_axis || {};
  const rawByAxisInput = overrides.rawByAxis || {};

  const by_axis = CB_COUNCIL_AXES.reduce((acc, axis) => {
    const raw = byAxisInput[axis] || {};
    acc[axis] = {
      ready: Number(raw.ready ?? raw.readyAgents ?? 0) || 0,
      pressure: Number(raw.pressure ?? 0) || 0,
    };
    return acc;
  }, {});

  const readyByAxis = CB_COUNCIL_AXES.reduce((acc, axis) => {
    acc[axis] = Number(by_axis[axis]?.ready ?? 0) || 0;
    return acc;
  }, {});

  const rawByAxis = CB_COUNCIL_AXES.reduce((acc, axis) => {
    acc[axis] =
      rawByAxisInput[axis] || {
        readyAgents: readyByAxis[axis],
        activeServices: 0,
        alerts: 0,
        last24hTokens: 0,
      };
    return acc;
  }, {});

  const fib = normalizeOrbState({ mode: workspaceMode, readyByAxis, rawByAxis });

  return {
    workspace_mode: workspaceMode,
    by_axis,
    fib,
  };
}

export function decideCouncilTier(levelTotal = 1) {
  if (levelTotal <= 3) return 'shallow';
  if (levelTotal <= 8) return 'standard';
  if (levelTotal <= 13) return 'deep';
  return 'max';
}
