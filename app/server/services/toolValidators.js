export function validateToolInput(toolName, params) {
  switch (toolName) {
    case 'briefs.write': {
      if (!params || typeof params.objective !== 'string' || !params.objective.trim()) {
        throw new Error('validation_error:briefs.write:objective_required');
      }
      if (params.budget_monthly_eur != null && isNaN(Number(params.budget_monthly_eur))) {
        throw new Error('validation_error:briefs.write:budget_not_numeric');
      }
      return;
    }
    case 'ppc_plan.write': {
      if (!params || !params.channel) {
        throw new Error('validation_error:ppc_plan.write:channel_required');
      }
      if (!Array.isArray(params.structure) || params.structure.length === 0) {
        throw new Error('validation_error:ppc_plan.write:empty_structure');
      }
      return;
    }
    case 'analytics.snapshots.write': {
      if (!params || !params.period_from || !params.period_to) {
        throw new Error('validation_error:analytics.snapshots.write:period_required');
      }
      if (!params.kpi_summary || typeof params.kpi_summary !== 'object') {
        throw new Error('validation_error:analytics.snapshots.write:kpi_summary_required');
      }
      return;
    }
    default:
      return;
  }
}

export function validateToolOutput(toolName, result) {
  switch (toolName) {
    case 'briefs.write':
    case 'ppc_plan.write':
    case 'ppc_changes.write':
    case 'analytics.snapshots.write':
    case 'insights.write': {
      if (!result || !result.id || !result.workspace_id) {
        throw new Error(`validation_error:${toolName}:invalid_result_shape`);
      }
      return;
    }
    default:
      return;
  }
}

export default { validateToolInput, validateToolOutput };
