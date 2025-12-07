## Analysis of Existing ARMED Styles

From the before-cleanup CSS, the current ARMED styles for the composer pill (.cb-council-wrapper.cb-council-armed) use a pale yellow background (#fef9c3) with a yellow glow (rgba(250, 204, 21, 0.95)) and inner elements with an orange-to-yellow gradient (linear-gradient(90deg, #f97316, #facc15)) and dark text (#111827). The header pill (.cb-council-pill.cb-council-pill--armed) has a green glow (rgba(80, 250, 123, 0.65)), which is not warm.

## Design Proposal

The new ARMED state uses a warm orange-to-yellow gradient for both pills, with a soft amber glow resembling a light bulb, and dark text for readability. No layout changes.

.cb-council-wrapper.cb-council-armed {
  background: linear-gradient(135deg, #f97316, #fde047);
  box-shadow: 0 0 0 2px #fbbf24, 0 0 20px rgba(245, 158, 11, 0.6);
  transform: translateY(-1px);
}

.cb-council-wrapper.cb-council-armed button,
.cb-council-wrapper.cb-council-armed .cb-pill,
.cb-council-wrapper.cb-council-armed [data-role="council-label"],
.cb-council-wrapper.cb-council-armed [data-role="council-count"] {
  background: linear-gradient(135deg, #f97316, #fde047);
  color: #0f172a;
  border-color: transparent;
}

.cb-council-pill.cb-council-pill--armed {
  background: linear-gradient(135deg, #fbbf24, #f97316);
  box-shadow: 0 0 0 2px #f59e0b, 0 0 18px rgba(245, 158, 11, 0.5);
}

.cb-council-pill.cb-council-pill--armed .cb-council-pill-main,
.cb-council-pill.cb-council-pill--armed .cb-council-pill-count {
  background: linear-gradient(135deg, #fbbf24, #f97316);
  color: #0f172a;
}
