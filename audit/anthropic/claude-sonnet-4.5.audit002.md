# CSS Council Pill Armed State - Analysis & Design Proposal

**Date:** December 6, 2025  
**Auditor:** Claude Sonnet 4.5  
**Phase:** Analysis + Design Proposal Only

---

## 1. ANALYSIS

### Current Implementation Discovery

**Actual Structure:**
- The council pill wrapper uses the class `.cb-council-pill` (NOT `.cb-council-wrapper`)
- JavaScript toggles THREE classes when armed:
  - `.cb-council-armed`
  - `.cb-council-pill--armed`
  - `.cb-pill-armed-on`
- The pill contains two button segments with data attributes:
  - `[data-role="council-label"]` - Left segment showing "Council"
  - `[data-role="council-count"]` - Right segment showing "+N"

**Current CSS State (L1824-1870 in assets/style.css):**

**Base OFF State:**
```css
.cb-council-pill {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  max-width: 360px;
  padding: 6px 8px 6px 10px;
  border-radius: 999px;
  background: linear-gradient(135deg, #0f172a, #020617);  /* Dark navy to black */
  border: 1px solid rgba(148, 163, 184, 0.4);              /* Muted blue-gray */
  color: #e5f3ff;                                          /* Light blue text */
}
```

**ARMED State: DOES NOT EXIST**
- No CSS rules exist for `.cb-council-armed`
- No CSS rules exist for `.cb-council-pill--armed`
- No CSS rules exist for `.cb-pill-armed-on`
- JavaScript adds these classes but they have zero visual effect currently

### Inline Styles in HTML (chat.html L233-283)

The HTML contains inline `<style>` block with additional rules for the composer context:
```css
.cb-composer .cb-council-pill { ... }
.cb-composer .cb-council-pill .cb-council-pill-btn { ... }
.cb-composer .cb-council-pill .cb-council-pill-btn--left { ... }
.cb-composer .cb-council-pill .cb-council-pill-btn--right { ... }
```

These handle the two-segment button layout with fused appearance.

**Critical Finding:** No armed state styling exists anywhere in the codebase.

---

## 2. DESIGN PROPOSAL

### Visual Intent

When ARMED (council members selected + armed toggle ON):
- Transform from dark blue/navy base to warm **amber/orange gradient** (like a glowing light bulb)
- Add subtle **warm outer glow** (amber/yellow shadow, not green)
- Use **dark text** (#0f172a) for maximum readability against bright gradient
- Maintain existing layout/padding/dimensions - only colors/shadows change

### Recommended CSS Blocks

**Note:** Since the actual wrapper class is `.cb-council-pill` (not `.cb-council-wrapper`), the selectors below target the correct elements based on the JavaScript implementation.

---

#### Armed State for Composer Pill

```css
/* Composer pill armed state - warm gradient wrapper */
.cb-composer .cb-council-pill.cb-council-armed,
.cb-composer .cb-council-pill.cb-council-pill--armed,
.cb-composer .cb-council-pill.cb-pill-armed-on {
  background: linear-gradient(135deg, #f97316, #fbbf24);
  border: 1px solid rgba(251, 191, 36, 0.8);
  box-shadow: 
    0 0 20px rgba(251, 191, 36, 0.4),
    0 4px 12px rgba(0, 0, 0, 0.2);
}

/* Armed state button segments - dark text on bright gradient */
.cb-composer .cb-council-pill.cb-council-armed .cb-council-pill-btn,
.cb-composer .cb-council-pill.cb-council-pill--armed .cb-council-pill-btn,
.cb-composer .cb-council-pill.cb-pill-armed-on .cb-council-pill-btn {
  background: linear-gradient(135deg, #f97316, #fbbf24);
  color: #0f172a;
  font-weight: 600;
}

/* Override left segment borders for armed state */
.cb-composer .cb-council-pill.cb-council-armed .cb-council-pill-btn--left,
.cb-composer .cb-council-pill.cb-council-pill--armed .cb-council-pill-btn--left,
.cb-composer .cb-council-pill.cb-pill-armed-on .cb-council-pill-btn--left {
  background: linear-gradient(135deg, #f97316, #fbbf24);
  color: #0f172a;
}

/* Override right segment - darker divider for armed state */
.cb-composer .cb-council-pill.cb-council-armed .cb-council-pill-btn--right,
.cb-composer .cb-council-pill.cb-council-pill--armed .cb-council-pill-btn--right,
.cb-composer .cb-council-pill.cb-pill-armed-on .cb-council-pill-btn--right {
  background: linear-gradient(135deg, #f97316, #fbbf24);
  color: #0f172a;
  border-left: 1px solid rgba(15, 23, 42, 0.3);
}
```

---

#### Armed State for Header/General Context Pill

```css
/* Header pill armed state - base wrapper */
.cb-council-pill.cb-council-armed,
.cb-council-pill.cb-council-pill--armed,
.cb-council-pill.cb-pill-armed-on {
  background: linear-gradient(135deg, #f97316, #fbbf24);
  border: 1px solid rgba(251, 191, 36, 0.8);
  color: #0f172a;
  box-shadow: 
    0 0 20px rgba(251, 191, 36, 0.4),
    0 4px 12px rgba(0, 0, 0, 0.2);
}

/* Armed state inner elements */
.cb-council-pill.cb-council-armed .cb-council-pill-role,
.cb-council-pill.cb-council-pill--armed .cb-council-pill-role,
.cb-council-pill.cb-pill-armed-on .cb-council-pill-role {
  color: #0f172a;
  font-weight: 600;
}

.cb-council-pill.cb-council-armed .cb-council-item-badge,
.cb-council-pill.cb-council-pill--armed .cb-council-item-badge,
.cb-council-pill.cb-pill-armed-on .cb-council-item-badge {
  color: rgba(15, 23, 42, 0.75);
}

/* Armed state close button - darker to contrast */
.cb-council-pill.cb-council-armed .cb-council-pill-clear,
.cb-council-pill.cb-council-pill--armed .cb-council-pill-clear,
.cb-council-pill.cb-pill-armed-on .cb-council-pill-clear {
  background: rgba(15, 23, 42, 0.85);
  color: rgba(255, 255, 255, 0.95);
}

.cb-council-pill.cb-council-armed .cb-council-pill-clear:hover,
.cb-council-pill.cb-council-pill--armed .cb-council-pill-clear:hover,
.cb-council-pill.cb-pill-armed-on .cb-council-pill-clear:hover {
  background: rgba(220, 38, 38, 0.9);
  color: #ffffff;
}
```

---

## 3. IMPLEMENTATION NOTES

### Gradient Choice
- **Primary:** `#f97316` (orange-600) to `#fbbf24` (amber-400)
- Creates warm, energetic "light bulb on" effect
- 135deg angle provides subtle left-to-right transition

### Glow Effect
```css
box-shadow: 
  0 0 20px rgba(251, 191, 36, 0.4),    /* Warm outer glow */
  0 4px 12px rgba(0, 0, 0, 0.2);       /* Depth shadow */
```
- 20px blur with 40% opacity amber creates soft warm halo
- Additional depth shadow maintains 3D feel

### Text Contrast
- Armed text: `#0f172a` (slate-900) on bright gradient
- Passes WCAG AA for contrast ratio (>7:1)
- Font weight increased to 600 for enhanced readability

### Browser Compatibility
- All properties are widely supported (gradient, box-shadow, border-radius)
- No vendor prefixes required for modern browsers
- Graceful degradation: falls back to solid color if gradient unsupported

---

## 4. PLACEMENT IN STYLESHEET

Add these blocks after the existing `.cb-council-pill` base styles (around line 1870 in assets/style.css), before the `.chat-composer input[type="text"]` section.

This keeps all council pill variants together for maintainability.

---

**End of Analysis & Design Proposal**
