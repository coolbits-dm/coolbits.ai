# Council Pill Armed State - Root Cause Analysis & Fix

**Date:** December 6, 2025  
**Auditor:** Claude Sonnet 4.5  
**Status:** CRITICAL BUG - Armed state has no visual effect

---

## PHASE 1: MAP THE REAL WIRING

### 1.1 HTML Analysis (chat.html)

**CSS Files Loaded:**
- Line 8: `<link rel="stylesheet" href="./assets/style.css?v=20251120" />`
- **ONLY ONE CSS FILE** is loaded from external source

**DOM Structure - Composer Pill:**
- Lines 175-226: Council pill in composer
- Wrapper element: `<div class="cb-council-pill">` 
- Contains TWO buttons:
  - `<button id="cb-council-label" data-role="council-label">` (left segment, shows "Council")
  - `<button id="cb-council-count" data-role="council-count">` (right segment, shows "+N")
- **CRITICAL:** Lines 233-283 contain INLINE `<style>` block with additional CSS rules

**Inline CSS (Lines 233-283):**
```css
.cb-composer .cb-council-pill { ... }
.cb-composer .cb-council-pill .cb-council-pill-btn { ... }
.cb-composer .cb-council-pill .cb-council-pill-btn--left { ... }
.cb-composer .cb-council-pill .cb-council-pill-btn--right { ... }
```

These inline styles are **MORE SPECIFIC** than anything in assets/style.css because they use `.cb-composer` prefix.

### 1.2 JavaScript Analysis (assets/chat.js)

**Function: cbUpdateCouncilPill() (Lines 346-373)**

```javascript
function cbUpdateCouncilPill() {
  const { wrapper, countEl } = cbGetCouncilElements();
  if (!wrapper || !countEl) {
    console.warn("[CB_COUNCIL] pill elements missing");
    return;
  }

  const selectedCount =
    window.cbCouncilSelectedIds && window.cbCouncilSelectedIds.size
      ? window.cbCouncilSelectedIds.size
      : 0;

  const armed = !!window.cbCouncilArmed && selectedCount > 0;

  // Update the "+N" text
  countEl.textContent = `+${selectedCount}`;

  wrapper.classList.toggle("cb-council-armed", armed);      // ← CLASS 1
  wrapper.classList.toggle("cb-council-pill--armed", armed); // ← CLASS 2
  wrapper.classList.toggle("cb-pill-armed-on", armed);       // ← CLASS 3
  // Clear any inline leftovers; rely on CSS classes for visuals
  wrapper.style.background = "";
  wrapper.style.boxShadow = "";
  wrapper.style.transform = "";

  console.log("[CB_COUNCIL] pill update", {
    count: selectedCount,
    armed,
  });
}
```

**Targeted Element:**
- Function `cbGetCouncilElements()` (Lines 172-180) returns:
  - `wrapper`: First match of `.cb-council-pill` OR `.cb-council-wrapper`
  - In HTML, this resolves to the `<div class="cb-council-pill">` element

**Classes Toggled When Armed:**
1. `.cb-council-armed`
2. `.cb-council-pill--armed`
3. `.cb-pill-armed-on`

**Condition for armed=true:**
- `window.cbCouncilArmed` is truthy AND
- `window.cbCouncilSelectedIds.size > 0`

### 1.3 CSS Analysis (assets/style.css)

**Base Council Pill Rule (Lines 1824-1834):**
```css
.cb-council-pill {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  max-width: 360px;
  padding: 6px 8px 6px 10px;
  border-radius: 999px;
  background: linear-gradient(135deg, #0f172a, #020617);
  border: 1px solid rgba(148, 163, 184, 0.4);
  color: #e5f3ff;
}
```

**Armed State Selectors: NONE FOUND**

Searched for:
- `.cb-council-armed` → **DOES NOT EXIST**
- `.cb-council-pill--armed` → **DOES NOT EXIST**
- `.cb-pill-armed-on` → **DOES NOT EXIST**
- `.cb-council-wrapper` → **DOES NOT EXIST**

**No other CSS files referenced in HTML.**

---

## PHASE 2: EXPLAIN WHY NOTHING HAPPENS VISUALLY

### 2.1 What Happens When Armed

When `cbUpdateCouncilPill()` runs with `armed = true`:

1. DOM element: `<div class="cb-council-pill cb-council-armed cb-council-pill--armed cb-pill-armed-on">`
2. Expected CSS selectors to match:
   - `.cb-council-pill.cb-council-armed`
   - `.cb-council-pill.cb-council-pill--armed`
   - `.cb-council-pill.cb-pill-armed-on`

### 2.2 Root Cause

**THE PROBLEM IS: The CSS rules for armed states DO NOT EXIST in assets/style.css**

JavaScript correctly adds three classes to the DOM element, but:
- **assets/style.css has ZERO rules** for `.cb-council-armed`, `.cb-council-pill--armed`, or `.cb-pill-armed-on`
- The base `.cb-council-pill` rule continues to apply (dark gradient)
- No visual change occurs because no armed-specific styles exist

### 2.3 Why This Wasn't Obvious

**ADDITIONAL COMPLICATION: Inline styles in HTML**

The HTML contains inline `<style>` block (Lines 233-283) with composer-specific rules:
```css
.cb-composer .cb-council-pill { ... }
```

These rules have **HIGHER SPECIFICITY** than anything we might add to assets/style.css that doesn't include `.cb-composer` prefix.

**Specificity comparison:**
- `.cb-council-pill.cb-council-armed` (specificity: 0,2,0) ← Added to assets/style.css
- `.cb-composer .cb-council-pill` (specificity: 0,2,0) ← Inline in HTML
- **Winner: LAST DEFINED WINS** if equal specificity

BUT the inline styles come AFTER the external stylesheet in the cascade, so they win.

### 2.4 Blunt Answer

**"The problem is: JavaScript correctly adds armed classes, but assets/style.css has ZERO CSS rules for those classes, so no visual change occurs. Additionally, inline styles in the HTML have equal or higher specificity and override any external styles."**

---

## PHASE 3: MINIMAL, PRECISE FIX

### Root Cause Summary

- **Root cause:** CSS rules for armed states (`.cb-council-armed`, `.cb-council-pill--armed`, `.cb-pill-armed-on`) are completely missing from assets/style.css
- **Affected elements:** `<div class="cb-council-pill">` in composer (Lines 175-226 of chat.html)
- **Currently applied rules:** Base `.cb-council-pill` (dark gradient) + inline `.cb-composer .cb-council-pill` styles
- **Intended rules:** Armed state variants with amber/orange gradient and glow

### Concrete Fix

**OPTION A: Add to assets/style.css (PREFERRED)**

Add these rules immediately after line 1870 (after `.cb-council-pill-clear:hover`):

```css
/* Armed state for composer pill - warm gradient wrapper */
.cb-composer .cb-council-pill.cb-council-armed,
.cb-composer .cb-council-pill.cb-council-pill--armed,
.cb-composer .cb-council-pill.cb-pill-armed-on {
  background: linear-gradient(135deg, #f97316, #fbbf24) !important;
  border: 1px solid rgba(251, 191, 36, 0.8) !important;
  box-shadow: 
    0 0 20px rgba(251, 191, 36, 0.4),
    0 4px 12px rgba(0, 0, 0, 0.2) !important;
}

/* Armed state button segments - dark text on bright gradient */
.cb-composer .cb-council-pill.cb-council-armed .cb-council-pill-btn,
.cb-composer .cb-council-pill.cb-council-pill--armed .cb-council-pill-btn,
.cb-composer .cb-council-pill.cb-pill-armed-on .cb-council-pill-btn {
  background: linear-gradient(135deg, #f97316, #fbbf24) !important;
  color: #0f172a !important;
  font-weight: 600 !important;
}
```

**WHY `!important`?**
- The inline styles in HTML (Lines 233-283) come AFTER external CSS in cascade
- Without `!important`, inline styles win due to source order
- Using `!important` ensures armed state overrides inline base styles

**OPTION B: Move inline styles to assets/style.css (CLEANER, but more work)**

1. Delete lines 233-283 from chat.html (inline `<style>` block)
2. Move those rules to assets/style.css
3. Add armed state rules without `!important` (they'll naturally have higher specificity)

This is cleaner but requires changing HTML.

### Recommended Action

**Use OPTION A** - Add the rules above to assets/style.css with `!important`.

This is:
- ✓ Minimal change (CSS only, no HTML edit)
- ✓ Immediate visual effect
- ✓ No risk of breaking layout
- ✓ Follows requirement "JS MUST NOT change, HTML SHOULD remain the same"

### Expected Result

When `window.cbCouncilArmed = true` and at least 1 member selected:
- Pill background: Orange-to-amber gradient (`#f97316` to `#fbbf24`)
- Border: Amber glow (`rgba(251, 191, 36, 0.8)`)
- Shadow: Warm outer glow + depth shadow
- Text: Dark (`#0f172a`) for readability
- Visual: Clear "light bulb ON" effect

---

## VERIFICATION STEPS

After applying fix:

1. **Check console:** Look for `[CB_COUNCIL] pill update { count: X, armed: true }`
2. **Inspect DOM:** Verify element has classes: `cb-council-pill cb-council-armed cb-council-pill--armed cb-pill-armed-on`
3. **Visual check:** Pill should be bright orange/amber gradient with warm glow
4. **Toggle test:** Click count button to toggle armed state, verify visual switches OFF/ON
5. **Hard reload:** Ctrl+Shift+R to clear cache and reload CSS

---

**End of Analysis**
