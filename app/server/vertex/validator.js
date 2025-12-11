function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function ensureObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

export function validateUltimateInput(payload = {}) {
  const errors = [];
  if (!ensureObject(payload.businessProfile)) {
    errors.push('businessProfile is required');
  } else {
    if (!isNonEmptyString(payload.businessProfile.name)) {
      errors.push('businessProfile.name is required');
    }
    if (!isNonEmptyString(payload.businessProfile.industry)) {
      errors.push('businessProfile.industry is required');
    }
  }

  if (!ensureObject(payload.objectives)) {
    errors.push('objectives is required');
  } else if (!isNonEmptyString(payload.objectives.primary)) {
    errors.push('objectives.primary is required');
  }

  if (!ensureObject(payload.budget)) {
    errors.push('budget is required');
  } else {
    if (typeof payload.budget.amount !== 'number' || payload.budget.amount <= 0) {
      errors.push('budget.amount must be a positive number');
    }
    if (!isNonEmptyString(payload.budget.currency)) {
      errors.push('budget.currency is required');
    }
  }

  if (!Array.isArray(payload.platforms) || payload.platforms.length === 0) {
    errors.push('platforms must include at least one entry');
  }

  if (!ensureObject(payload.timeframe)) {
    errors.push('timeframe is required');
  } else {
    if (!isNonEmptyString(payload.timeframe.start)) {
      errors.push('timeframe.start is required');
    }
    if (!isNonEmptyString(payload.timeframe.end)) {
      errors.push('timeframe.end is required');
    }
  }

  return { valid: errors.length === 0, errors };
}
