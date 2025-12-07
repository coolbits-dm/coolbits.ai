# Raptor mini audit 003 — Council Pill ARMED state (debug)
Date: 2025-12-06

Summary
-------
- Root cause: JavaScript toggles armed classes on the Council pill wrapper, but the loaded CSS (assets/style.css + inline composer CSS) contains NO selectors that use those armed classes. Because the armed classes are not present in the deployed stylesheet, toggling them does not produce any visual change.
- Affected elements: composer `div.cb-council-pill` (canonical) and the council popover/header; JS toggles classes on the wrapper element found by `.cb-council-pill` or `.cb-council-wrapper`.
- Fix recommended: Add small, focused CSS rules to `assets/style.css` that style `.cb-council-pill.cb-council-pill--armed` and aliases (`.cb-council-pill.cb-council-armed`, `.cb-council-wrapper.cb-council-armed`, `.cb-council-pill.cb-pill-armed-on`). Do NOT change JS/HTML unless necessary.

Phase 1 — Mapping the real wiring
---------------------------------

1) Which CSS file(s) are actually loaded
	 - `./assets/style.css?v=20251120` is loaded from the head of `chat.html`.
	 - `chat.html` also contains an inline `<style>` block in the composer that defines `.cb-composer .cb-council-pill` and various inner button styles (this is important for cascade ordering and specificity). See `chat.html` lines where the composer pill is defined.

2) DOM structure for the Council pill in the composer
	 - Wrapper: <div class="cb-council-pill" ...> (one container with two `button` children)
	 - Left segment: `button#cb-council-label` with class: `btn btn-gradient cb-council-pill-btn cb-council-pill-btn--left`, attribute `data-role="council-label"` and inline click handler `onclick="cbOnCouncilLabelClick()"`.
	 - Right segment: `button#cb-council-count` with class: `btn btn-gradient cb-council-pill-btn cb-council-pill-btn--right`, attribute `data-role="council-count"` and inline click handler `onclick="cbOnCouncilCountClick()"`.
	 - There is a popover (`#cb-council-popover` / `.cb-council-popover`) with list entries (`[data-council-id]`) and checkboxes; there is no `cb-council-wrapper` in the HTML — the canonical wrapper in the composer is `.cb-council-pill`.

3) Which selectors/attributes are used in the existing stylesheet
	 - `assets/style.css` contains a `base` rule for `.cb-council-pill` (dark gradient background, light text, border, etc.).
	 - The composer inline style also includes `.cb-composer .cb-council-pill` rules to adjust padding/segmentation behavior.
	 - The composer button also uses `[data-has-selection="true"]` on `.cb-composer-addon` to show a blue accent for selected state; but JS does NOT set that attribute in the `cbUpdateCouncilPill` implementation — JS toggles classes instead.

Phase 1 — Mapping the JS wiring
-------------------------------

- Source: `assets/chat.js` (module).
- Relevant pieces (summarized):
	- cbGetCouncilElements() — finds wrapper by selecting `.cb-council-pill` first, falling back to `.cb-council-wrapper`.
	- cbUpdateCouncilPill() — called on initialization and whenever selection/armed state changes.
		- Determines selectedCount from `window.cbCouncilSelectedIds.size`.
		- armed = `!!window.cbCouncilArmed && selectedCount > 0`.
		- Updates `countEl.textContent = `+${selectedCount}`;
		- Toggles classes on `wrapper`: `cb-council-armed`, `cb-council-pill--armed`, `cb-pill-armed-on` (exact code):

```javascript
	wrapper.classList.toggle("cb-council-armed", armed);
	wrapper.classList.toggle("cb-council-pill--armed", armed);
	wrapper.classList.toggle("cb-pill-armed-on", armed);
```

	- Clears inline style remnant on wrapper (background, boxShadow, transform) to rely on class-based CSS for visuals.
	- cbOnCouncilLabelClick() toggles `window.cbCouncilArmed` (only if count>0), then calls `cbUpdateCouncilPill()`.

Conclusion of wiring: JS is toggling classes correctly on the canonical wrapper element (`.cb-council-pill`) but CSS must define how those classes produce the visual change.

Phase 2 — Why NOTHING happens visually (blunt answer)
----------------------------------------------------

1) Evidence:
	 - JS toggles classes: `cb-council-armed`, `cb-council-pill--armed`, `cb-pill-armed-on` (verified in `assets/chat.js`.)
	 - The loaded stylesheet `assets/style.css` contains *no rules* for `.cb-council-armed`, `.cb-council-pill--armed`, or `.cb-pill-armed-on`.
	 - The inline `<style>` block inside `chat.html` defines `.cb-composer .cb-council-pill` (base) but *not* an armed variant.
	 - The stylesheet uses `[data-has-selection="true"]` on `.cb-composer-addon` for a different (blue) visual state. The JS does not set this attribute; it sets classes.

2) Result:
	 - Adding the classes in JS changes the DOM's `classList` but there are *no CSS selectors* that match these new classes. Therefore the style engine cannot create the visual change. That's the exact reason the UI does not reflect the armed visuals.

3) Other potential blockers and why they don’t explain the issue alone:
	 - Inline `style` on the wrapper (e.g. `border:1px solid rgba(0,0,0,0.9)`) might affect border color, but armed visuals are primarily background + shadow; inline border does not prevent background/box-shadow unless CSS uses `!important` incorrectly.
	 - Caching (browser/CDN) could prevent updated CSS from showing up if the deployed CSS file differs from the local one — if you changed `assets/style.css` but did not update the version query param (`?v=...`) in `chat.html`, the page may still load an older CSS file. But in the reported case we found there were simply no armed selectors in the loaded stylesheet.

Phase 3 — Minimal, precise fix (no JS/HTML changes recommended)
-----------------------------------------------------------

Choose the option that fits your policy/priorities below. The **smallest** and least invasive fix is OPTION A (recommended):

OPTION A (recommended): Add armed state CSS to the canonical wrapper selector in `assets/style.css`.
Place these rules adjacent to the existing `.cb-council-pill` base rule (i.e. near L1824 in current CSS) so it’s easy to maintain/collapse with the rest of the pill styles.

Minimal CSS to add (drop-in):

```css
/* Armed state — visible, amber/orange highlight + glow */
.cb-council-pill.cb-council-pill--armed,
.cb-council-pill.cb-council-armed,
.cb-council-wrapper.cb-council-armed,
.cb-council-pill.cb-pill-armed-on {
	background: linear-gradient(90deg, #fef3c7 0%, #fcd34d 100%); /* warm amber */
	color: #111827; /* dark text for contrast */
	box-shadow: 0 8px 20px rgba(250, 204, 21, 0.12);
	/* don't assume you can change the inline border; background + shadow are the core: */
}

.cb-council-pill.cb-council-pill--armed .cb-council-pill-btn,
.cb-council-pill.cb-council-armed .cb-council-pill-btn,
.cb-council-pill.cb-pill-armed-on .cb-council-pill-btn {
	color: #111827;
	font-weight: 600;
}

/* Optional: make the right count segment integrate visually with the left one */
.cb-council-pill.cb-council-pill--armed .cb-council-pill-btn--right {
	border-left: 1px solid rgba(0,0,0,0.06);
}
```

Notes about that CSS:
	- It targets all three class-names that JS toggles (aliases) so it will work for both `.cb-council-pill` and `.cb-council-wrapper` variants.
	- It avoids trying to override inline `border` property (the wrapper has inline `border: 1px solid rgba(0,0,0,0.9)`) because inline border is high-priority. The background and shadow are enough to visually highlight the `armed` state. If you prefer the border color to change as well, either remove the inline border from HTML or switch to `border-color: ... !important` in CSS (less preferred).

OPTION B (alternate): Use the existing `data-has-selection` selector.
	- If you prefer the existing (blue) visual behavior to represent a selection/armed state, update the JS to set `data-has-selection` on the `.cb-composer-addon` (or on `body`) instead of toggling classes. This keeps the CSS unchanged but will require a small JS change (set the attribute on selection state). This is slightly more invasive and not required if you opt for Option A.

Option C (if you prefer a header-only change): Add the armed CSS for `.cb-council-pill.cb-council-pill--armed` only — that is sufficient for the header pill. But since JS can toggle armed on both `.cb-council-wrapper` and `.cb-council-pill`, include both variants for robustness.

Deployment/testing steps (small checklist)
----------------------------------------
1) Add the CSS to `assets/style.css` near the `.cb-council-pill` base rule.
2) Increment the version in `chat.html` (`?v=20251120 → ?v=20251206`) or ensure your CDN/bundle picks up the updated file to avoid cache issues.
3) Deploy the app and do a hard refresh (Shift+Reload) to ensure a new CSS is loaded.
4) Verify the DOM after toggling the armed state:
	 - Inspect the wrapper `div.cb-council-pill` in devtools: it should now have `cb-council-armed cb-council-pill--armed cb-pill-armed-on` when armed.
	 - The new amber background + subtle glow should be visible (or the border changes if you implemented the optional border override).
5) Optional: remove the inline `border:1px solid rgba(0,0,0,0.9)` from the wrapper HTML if you want the border to change with the armed state as well.

Why not change JS
------------------
JS is already correct: it toggles canonical classes on the wrapper and helps keep DOM state consistent (`window.cbCouncilArmed`, `window.cbCouncilSelectedIds`). The problem is missing CSS hooks. Given your constraints, CSS-only fix is the minimal and most maintainable approach.

Wrap-up / Final notes
---------------------
- Root cause: missing armed selectors in `assets/style.css` (JS toggles classes but the stylesheet doesn't respond to them).
- Minimal fix: add the CSS snippet above (in `style.css`) adjacent to `.cb-council-pill` block.
- Quick test: open devtools, toggle `.cb-council-pill--armed` class manually on the wrapper: you should see the amber background/visuals; if you do, the problem is solved.

If you'd like, I can paste a minimal `diff` (exact patch content) to add to `assets/style.css` (but you asked this audit to be only in the `raptor-mini.audit003.md` file—so I'm only proposing the change here). If you prefer, I can also implement the change and test it locally and then revert if necessary — but per your last message I will not modify production files here.

End of audit — raptor-mini.audit003.md

