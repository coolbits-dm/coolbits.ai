Visual intent: keep the existing dark/blue OFF states, but when armed, both the composer pill wrapper and header pill flip to a warm orange–yellow gradient with a soft amber halo and dark, high-contrast text so they read as an illuminated “ON” light without looking neon.

.cb-council-wrapper.cb-council-armed {
  background: linear-gradient(135deg, #f97316, #fde047);
  box-shadow: 0 0 0 1px rgba(248, 250, 252, 0.6),
              0 0 18px rgba(251, 191, 36, 0.55);
}

.cb-council-wrapper.cb-council-armed button,
.cb-council-wrapper.cb-council-armed .cb-pill,
.cb-council-wrapper.cb-council-armed [data-role="council-label"],
.cb-council-wrapper.cb-council-armed [data-role="council-count"] {
  background: transparent;
  color: #0f172a;
}

.cb-council-wrapper.cb-council-armed .cb-pill {
  background: linear-gradient(135deg, #fbbf24, #f97316);
  box-shadow: 0 6px 18px rgba(251, 191, 36, 0.5);
}

.cb-council-pill.cb-council-pill--armed {
  background: linear-gradient(135deg, #f97316, #fde047);
  border-color: rgba(248, 250, 252, 0.9);
  box-shadow: 0 0 0 1px rgba(248, 250, 252, 0.5),
              0 0 22px rgba(251, 191, 36, 0.55);
  color: #111827;
}

.cb-council-pill.cb-council-pill--armed .cb-council-pill-main,
.cb-council-pill.cb-council-pill--armed .cb-council-pill-count {
  color: #111827;
}

.cb-council-pill.cb-council-pill--armed .cb-council-pill-main {
  background: linear-gradient(135deg, #fbbf24, #f97316);
}
