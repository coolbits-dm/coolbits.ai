# gpt‑5.1.audit003 – Council pill “armed but not visible” bug

Date: 2025‑12‑06
Scope: `coolbits/chat.html`, `assets/chat.js`, `assets/style.css`

---

## 1. Wiring recap

- **DOM (composer header pill):**
  - Wrapper: `<div class="cb-council-pill">` inside `#cb-composer .cb-composer-inner`.
  - Left button: `#cb-council-label` with `data-role="council-label"` → toggles armed state.
  - Right button: `#cb-council-count` with `data-role="council-count"` → opens modal.
  - Inline `<style>` in `chat.html` already normalizes the fused pill geometry for this exact structure.
- **JS wiring (in `assets/chat.js`):**
  - `cbGetCouncilElements()` returns `{ wrapper, labelEl, countEl }` where `wrapper` is the first `.cb-council-pill` in the document.
  - `cbOnCouncilCheckboxChange(id, checked)` maintains `window.cbCouncilSelectedIds` and turns `window.cbCouncilArmed` off when the last member is deselected, then calls `cbUpdateCouncilPill()`.
  - `cbOnCouncilLabelClick()` toggles `window.cbCouncilArmed` **only if there is at least one selected council member**, then calls `cbUpdateCouncilPill()`.
  - `cbOnCouncilCountClick()` opens the council modal.
  - `cbUpdateCouncilPill()`:
    - Computes `selectedCount` from `window.cbCouncilSelectedIds.size`.
    - Computes `armed = !!window.cbCouncilArmed && selectedCount > 0`.
    - Updates text: `countEl.textContent = "+" + selectedCount`.
    - Toggles classes on `wrapper`:
      - `cb-council-armed`
      - `cb-council-pill--armed`
      - `cb-pill-armed-on`
    - Clears any inline `background`, `boxShadow`, `transform` on the wrapper and logs `[CB_COUNCIL] pill update { count, armed }`.
  - `cbShouldUseCouncil()` reads `cbCouncilArmed` and `cbCouncilSelectedIds.size` when sending a message but does **not** affect visuals beyond what `cbUpdateCouncilPill()` already did.
  - `cbInitCouncilUI()` is called from auth/usage paths (via `cbSyncCouncilUI()` -> `cbUpdateCouncilPill()`) so the pill visuals are always recomputed after login/token updates.

Conclusion: **JS is correctly toggling the three armed‑state classes on `.cb-council-pill` and logs armed: true when expected.**

---

## 2. CSS state recap

- Composer layout / base pill styles (from `assets/style.css`):
  - `.chat-composer` defines fixed glassmorphic bar at the bottom.
  - `.cb-composer-inner` arranges the pill and textarea horizontally.
  - `.cb-composer-addon` and `[data-has-selection="true"]` are the **old council entry point**, used for the previous single “+” button pattern.
  - `.cb-council-active` is a container row above the composer.
  - `.cb-council-pill` base rule (the canonical visual today):
    - Inline‑flex dark pill with:
      - `background: linear-gradient(135deg, #0f172a, #020617);`
      - `border: 1px solid rgba(148, 163, 184, 0.4);`
      - `color: #e5f3ff;`
  - **Critically**: there are **no rules** for any of the armed‑state classes that JS toggles:
    - `.cb-council-armed`
    - `.cb-council-pill--armed`
    - `.cb-pill-armed-on`
  - The only “selected” look for council historically was attribute‑based (`.cb-composer-addon[data-has-selection="true"]`) on the old button, not on the new fused header pill.
- That means: when `cbUpdateCouncilPill()` adds these classes, they currently **do not change any CSS**; the pill remains visually identical to the idle state.

---

## 3. Root cause

**Primary cause:**

- The **new JS state classes** (`cb-council-armed`, `cb-council-pill--armed`, `cb-pill-armed-on`) added by the `council-pill-v3` wiring **have no corresponding CSS rules in `assets/style.css`**.
- The prior visual design for “council selected” was attached to the old `.cb-composer-addon[data-has-selection="true"]` selector. The current DOM no longer uses that element for the council pill, so those styles never apply to the new fused header pill.

**Why it presents as “CSS changed but no effect in prod”:**

- The inline `<style>` inside `chat.html` controls only geometry (padding, border‑radius, left/right segments). It resets most visual properties (borders, shadows) of the inner buttons but **does not define any armed/off color states**.
- Any CSS edits that only touched `.cb-council-wrapper.cb-council-armed` (a non‑existent DOM element) or that relied on `[data-has-selection="true"]` on `.cb-composer-addon` will never be triggered by the current JS and DOM wiring.
- In production, you see console logs like:
  - `[CB_COUNCIL] label click { count: 2, armed: true }`
  - `[CB_COUNCIL] pill update { count: 2, armed: true }`
  but the pill stays visually identical because **no CSS responds to those classes**.

There is no evidence of a race condition, build issue, or caching bug here; the behaviour is fully explained by **missing / mismatched selectors** between JS and CSS.

---

## 4. Minimal, robust fix

Goal: **Make the council pill clearly change to a warm “armed” visual when `armed = true`, without changing layout or OFF behaviour.**

### 4.1. Add armed‑state CSS for the existing wrapper

Attach the armed visual directly to `.cb-council-pill` when the JS‑managed classes are present. Because the wrapper is the element that JS toggles classes on, a single rule can cover all three class names.

Add the following to `assets/style.css` near the existing `.cb-council-pill` block:

```css
/* Council pill ARMED state – wired to JS classes */
.cb-council-pill.cb-council-armed,
.cb-council-pill.cb-council-pill--armed,
.cb-council-pill.cb-pill-armed-on {
  background: linear-gradient(135deg, #facc15, #f97316);
  border-color: rgba(251, 191, 36, 0.9);
  color: #111827;
  box-shadow:
    0 0 0 1px rgba(251, 191, 36, 0.6),
    0 0 22px rgba(251, 146, 60, 0.75);
}

.cb-council-pill.cb-council-armed .cb-council-pill-btn,
.cb-council-pill.cb-council-pill--armed .cb-council-pill-btn,
.cb-council-pill.cb-pill-armed-on .cb-council-pill-btn {
  color: #111827;
}
```

Notes:

- This rule set is intentionally small and piggybacks on the existing `.cb-council-pill` layout and the inline segment geometry from `chat.html`.
- It explicitly targets all three possible JS classes to be future‑proof if the JS toggling logic is simplified later.
- It does **not** touch OFF state; when `armed` is false, the pill uses the existing dark gradient and border.

### 4.2. (Optional) Remove stale attribute‑based highlight later

Once production has the fused pill fully wired and you no longer rely on the old `+` button, you can safely clean up:

- `.cb-composer-addon[data-has-selection="true"]` and its descendants.

This is non‑functional debt and does not affect the current bug, so it can be deferred to a follow‑up cleanup pass.

---

## 5. Verification checklist

To confirm the fix end‑to‑end in production:

1. **Select council members:**
   - Open the “Council” modal via the `+N` right segment.
   - Tick at least one checkbox.
   - Observe console: `[CB_COUNCIL] pill update { count: n, armed: false }`.
   - Pill should show `+n` on the right segment but remain in OFF (dark) visual.
2. **Arm the council:**
   - Click the left “Council” segment.
   - Observe console: `[CB_COUNCIL] label click { count: n, armed: true }` and `[CB_COUNCIL] pill update { count: n, armed: true }`.
   - Visually, the entire pill should flip to the warm amber/orange gradient with glow while text turns dark.
3. **Disarm:**
   - Click the left segment again.
   - Armed classes should be removed; pill returns to dark base style.
4. **Clear selection:**
   - Deselect all members in the modal.
   - JS resets `window.cbCouncilArmed` to false and `cbUpdateCouncilPill()` removes armed classes; pill stays OFF regardless of clicking (until new selections are made).

If all four checks pass, the original “armed but not visible” bug is resolved with minimal CSS change and no JS/DOM modifications.
