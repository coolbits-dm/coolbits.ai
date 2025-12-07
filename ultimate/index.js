const visitorId = (() => {
  if (window.coolbitsVisitorId) {
    return window.coolbitsVisitorId;
  }
  try {
    const stored = localStorage.getItem('coolbits:visitor-id');
    if (stored) {
      window.coolbitsVisitorId = stored;
      return stored;
    }
  } catch (_) {
    // ignore storage errors
  }
  const generated =
    typeof window.crypto !== 'undefined' && window.crypto.randomUUID
      ? window.crypto.randomUUID()
      : `visitor-${Date.now()}`;
  try {
    localStorage.setItem('coolbits:visitor-id', generated);
  } catch (_) {
    // ignore
  }
  window.coolbitsVisitorId = generated;
  return generated;
})();

const apiBase = window.COOLBITS_API_BASE || '/';
const body = document.body || document.documentElement;
const vertexModeEnv = (window.COOLBITS_VERTEX_MODE || body?.dataset?.vertexMode || 'live').toLowerCase();
const vertexModeBanner = document.querySelector('[data-vertex-mode-banner]');
const form = document.querySelector('[data-wizard-form]');
const panels = Array.from(document.querySelectorAll('[data-step-panel]'));
const indicators = Array.from(document.querySelectorAll('[data-step-indicator]'));
const btnNext = document.querySelector('[data-next]');
const btnPrev = document.querySelector('[data-prev]');
const btnSubmit = document.querySelector('[data-submit]');
const alertBox = document.querySelector('[data-alert]');
const planOutput = document.querySelector('[data-plan-output]');
const planStatus = document.querySelector('[data-plan-status]');
const planEngine = document.querySelector('[data-plan-engine]');
const reviewList = document.querySelector('[data-review-list]');

let currentStep = 0;

function updateModeBanner(mode = vertexModeEnv) {
  if (!vertexModeBanner) return;
  const normalized = mode || 'live';
  if (['real', 'live', 'vertex'].includes(normalized)) {
    vertexModeBanner.textContent = 'Vertex orchestration is active. Ultimate calls will consume reasoning credits.';
  } else {
    vertexModeBanner.textContent = 'Vertex orchestration unavailable. Plans may queue until service resumes.';
  }
}
updateModeBanner();

function goToStep(step) {
  currentStep = Math.max(0, Math.min(step, panels.length - 1));
  panels.forEach((panel, index) => {
    panel.classList.toggle('is-active', index === currentStep);
  });
  indicators.forEach((el, index) => {
    el.classList.toggle('is-active', index === currentStep);
  });
  btnPrev.disabled = currentStep === 0;
  btnNext.style.display = currentStep >= panels.length - 1 ? 'none' : 'inline-flex';
  btnSubmit.style.display = currentStep === panels.length - 1 ? 'inline-flex' : 'none';
  if (currentStep === panels.length - 1) {
    updateReview();
  }
}

function displayAlert(message, link) {
  if (!alertBox) return;
  alertBox.textContent = message;
  if (link) {
    const anchor = document.createElement('a');
    anchor.href = link.href;
    anchor.textContent = link.label;
    anchor.className = 'vertex-secondary';
    anchor.style.marginLeft = '8px';
    alertBox.appendChild(anchor);
  }
  alertBox.classList.add('is-visible');
  alertBox.hidden = false;
}

function clearAlert() {
  if (!alertBox) return;
  alertBox.textContent = '';
  alertBox.hidden = true;
  alertBox.classList.remove('is-visible');
}

function collectFormData() {
  const data = new FormData(form);
  const secondary = data
    .get('secondaryObjectives')
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const platforms = Array.from(form.querySelectorAll('input[name="platforms"]:checked')).map((input) => input.value);
  const timeframeStart = data.get('timeframeStart') || new Date().toISOString().slice(0, 10);
  const timeframeEnd = data.get('timeframeEnd') || new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10);
  return {
    visitorId,
    businessProfile: {
      name: data.get('businessName'),
      industry: data.get('industry'),
      website: data.get('website'),
      geo: data.get('geo'),
      notes: data.get('notes'),
    },
    objectives: {
      primary: data.get('primaryObjective'),
      secondary: secondary || [],
    },
    budget: {
      amount: Number(data.get('budgetAmount')),
      currency: data.get('budgetCurrency') || 'USD',
      period: data.get('budgetPeriod') || 'seasonal',
    },
    platforms: platforms.length ? platforms : ['google-ads'],
    timeframe: { start: timeframeStart, end: timeframeEnd },
    reasoningBoost: Boolean(data.get('reasoningBoost')),
  };
}

function updateReview() {
  if (!reviewList) return;
  const payload = collectFormData();
  reviewList.innerHTML = '';
  const items = [
    `Business: ${payload.businessProfile.name} (${payload.businessProfile.industry})`,
    `Primary objective: ${payload.objectives.primary}`,
    `Budget: ${payload.budget.amount} ${payload.budget.currency} (${payload.budget.period})`,
    `Platforms: ${payload.platforms.join(', ')}`,
    `Timeframe: ${payload.timeframe.start} → ${payload.timeframe.end}`,
  ];
  items.forEach((text) => {
    const li = document.createElement('li');
    li.textContent = text;
    reviewList.appendChild(li);
  });
}

function renderList(list) {
  if (!Array.isArray(list)) return '';
  return `<ul>${list
    .map((item) => `<li>${typeof item === 'object' ? renderObject(item) : item}</li>`)
    .join('')}</ul>`;
}

function renderObject(obj) {
  if (!obj || typeof obj !== 'object') return String(obj);
  const entries = Object.entries(obj)
    .map(([key, value]) => `<div><strong>${key}:</strong> ${formatValue(value)}</div>`)
    .join('');
  return `<div class="object-block">${entries}</div>`;
}

function formatValue(value) {
  if (Array.isArray(value)) {
    return renderList(value);
  }
  if (value && typeof value === 'object') {
    return renderObject(value);
  }
  return String(value ?? '');
}

function renderPlan(plan) {
  if (!planOutput) return;
  planOutput.innerHTML = '';
  const sections = plan.sections || [
    { title: 'Strategy', content: plan.strategy },
    { title: 'Budget', content: plan.budget },
    { title: 'KPIs', content: plan.kpis },
    { title: 'Platforms', content: plan.platforms },
    { title: 'Milestones', content: plan.milestones },
  ];
  sections.forEach((section) => {
    const div = document.createElement('div');
    div.className = 'plan-section';
    div.innerHTML = `<h3>${section.title}</h3>${formatValue(section.content)}`;
    planOutput.appendChild(div);
  });
}

async function submitPlan() {
  clearAlert();
  const payload = collectFormData();
  planStatus.textContent = 'Submitting...';
  btnSubmit.disabled = true;
  try {
    const response = await fetch(`${apiBase}/api/ultimate/campaign-plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Visitor-Id': visitorId,
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (data.error === 'reasoning_required') {
        displayAlert('Ultimate mode needs a reasoning boost or account upgrade.', {
          label: 'Boost reasoning',
          href: '/chat.html',
        });
      } else if (data.error === 'level_too_low') {
        displayAlert('Reach level 1 by chatting with Andy before running Ultimate.', {
          label: 'Open chat',
          href: '/chat.html',
        });
      } else if (data.error === 'validation_failed') {
        displayAlert(`Validation failed: ${data.details.join(', ')}`);
      } else {
        displayAlert('Ultimate planner is temporarily unavailable.');
      }
      planStatus.textContent = 'Error';
      return;
    }
    planStatus.textContent = `${data.level?.label || 'level-?'} • Reasoning: ${
      data.reasoning?.active ? 'active' : data.reasoning?.pending ? 'pending' : 'inactive'
    }`;
    planEngine.textContent = `${data.engine?.source || 'unknown'} / ${data.engine?.model || '-'}`;
    if (data.engine?.source === 'vertex') {
      updateModeBanner('real');
    }
    renderPlan(data.plan);
  } catch (error) {
    console.error(error);
    displayAlert('Could not generate plan. Try again in a minute.');
    planStatus.textContent = 'Error';
  } finally {
    btnSubmit.disabled = false;
  }
}

btnNext?.addEventListener('click', () => goToStep(currentStep + 1));
btnPrev?.addEventListener('click', () => goToStep(currentStep - 1));
btnSubmit?.addEventListener('click', submitPlan);

goToStep(0);
