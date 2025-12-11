function toSection(title, content) {
  return { title, content };
}

export function renderUltimatePlan({ input, plan, engine }) {
  const now = new Date().toISOString();
  return {
    generatedAt: now,
    engine,
    strategy: plan.strategy,
    budget: plan.budget,
    kpis: plan.kpis,
    platforms: plan.platforms,
    milestones: plan.milestones,
    metadata: {
      business: input.businessProfile,
      timeframe: input.timeframe,
    },
    sections: [
      toSection('Strategy', plan.strategy),
      toSection('Budget', plan.budget),
      toSection('KPIs', plan.kpis),
      toSection('Platforms', plan.platforms),
      toSection('Milestones', plan.milestones),
    ],
  };
}
