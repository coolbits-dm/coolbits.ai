# Analysis of Council Pill Armed State Bug

## PHASE 1 – Map the Real Wiring

### From the HTML (chat.html):
- **CSS file loaded**: `./assets/style.css?v=20251120` (exact path: assets/style.css with cache buster).
- **DOM structure**:
  - Only one Council pill present: the composer pill.
  - Wrapper element: `<div class="cb-council-pill">` (inside `#chat-composer .chat-composer`).
  - Inner elements:
    - Left button: `<button data-role="council-label">` with classes `btn btn-gradient cb-council-pill-btn cb-council-pill-btn--left`.
    - Right button: `<button data-role="council-count">` with classes `btn btn-gradient cb-council-pill-btn cb-council-pill-btn--right`.
- No header pill present in HTML.

### From the JS (assets/chat.js):
- **Update function**: `cbUpdateCouncilPill()` (lines 345-375).
- **DOM targeting**: Uses `cbGetCouncilElements()` which queries `document.querySelector(".cb-council-pill")` first (line 174), so targets the `.cb-council-pill` wrapper.
- **Classes toggled**:
  - `.cb-council-pill--armed` on the wrapper (line 363).
  - `.cb-pill-armed-on` on the wrapper (line 364).
  - Note: Also toggles `.cb-council-armed` but that's not applied since the wrapper is `.cb-council-pill`, not `.cb-council-wrapper`.
- **Armed condition**: `armed = !!window.cbCouncilArmed && selectedCount > 0` (line 357).
- **Pill targeted**: Only the composer pill (`.cb-council-pill`).

### From the CSS (assets/style.css):
- **Rules present**:
  - `.cb-council-pill` (line 1824): Base styles with dark gradient background.
  - No rules for `.cb-council-pill.cb-council-pill--armed`, `.cb-council-pill--armed`, or `.cb-pill-armed-on`.
  - No rules for `.cb-council-wrapper` or its armed variants.
- **Multiple stylesheets**: Only one CSS file loaded (`assets/style.css`).

## PHASE 2 – Explain Why NOTHING Happens Visually

1) **Classes on DOM when armed = true**:
   - Wrapper gets: `.cb-council-pill .cb-council-pill--armed .cb-pill-armed-on`.
   - Inner buttons keep their existing classes.

2) **CSS selectors that SHOULD match**:
   - `.cb-council-pill.cb-council-pill--armed` for the wrapper.
   - Potentially `.cb-council-pill .cb-council-pill--armed` or similar for descendants.

**Why the visual change doesn't appear**:
- The armed CSS rules are completely missing from `assets/style.css`.
- When `armed = true`, the classes `.cb-council-pill--armed` and `.cb-pill-armed-on` are added to the DOM, but no CSS rules exist to style them.
- The base `.cb-council-pill` rule remains in effect, so the pill stays in its OFF state visually.
- No overriding rules; simply no armed rules present.

## PHASE 3 – Minimal, Precise Fix

### Short Summary
- **Root cause**: Armed CSS rules for `.cb-council-pill.cb-council-pill--armed` and inner elements are missing from `assets/style.css`.
- **Affected elements**: The `.cb-council-pill` wrapper and its child buttons with `data-role` attributes.
- **Currently applied rules vs intended rules**: Only base `.cb-council-pill` applies; no armed rules exist to override for visual feedback.

### Concrete Fix
Add the following CSS blocks to `assets/style.css` (insert after the base `.cb-council-pill` rule around line 1830):

```css
.cb-council-pill.cb-council-pill--armed {
  background: linear-gradient(135deg, #f97316, #fde047);
  box-shadow: 0 0 0 2px #fbbf24, 0 0 20px rgba(245, 158, 11, 0.6);
  transform: translateY(-1px);
}

.cb-council-pill.cb-council-pill--armed .cb-council-pill-btn,
.cb-council-pill.cb-council-pill--armed [data-role="council-label"],
.cb-council-pill.cb-council-pill--armed [data-role="council-count"] {
  background: linear-gradient(135deg, #f97316, #fde047);
  color: #0f172a;
  border-color: transparent;
}
```

This adds the warm orange/yellow gradient and glow for the ARMED state, ensuring readability with dark text, while leaving OFF state unchanged.
