# CSS/JS Council Pill Audit – Codex 5.1 (audit002)

**Date:** 2025-12-06  
**Files:** `assets/style.css`, `assets/chat.js`  
**Sources read:**  
- `audit/anthropic/claude-sonnet-4.5.audit002.md`  
- `audit/xai/grok-code-fast-1.audit002.md`  
- `audit/openai/gpt-5.1.audit002.md`  

## 1) What all audits agree on
- **JS is fine:** State lives in `window.cbCouncilSelectedIds` (Set) and `window.cbCouncilArmed` (boolean). `cbUpdateCouncilPill()` updates count and toggles classes `.cb-council-armed`, `.cb-council-pill--armed`, `.cb-pill-armed-on` on the wrapper (prefers `.cb-council-pill`, fallback `.cb-council-wrapper`). Any visual change must come from CSS honoring those classes.
- **Current CSS is noisy/duplicated:** Multiple generations of council-pill styles and composer layout rules overlap. Armed visuals are missing/overridden (header still blue; composer has multiple conflicting blocks).
- **Desired armed look:** Warm amber/orange “bulb on” gradient with dark text; not just a subtle border/glow. OFF state stays dark/blue.

## 2) Key CSS targets to normalize
1) **`.chat-composer`**  
   - Keep exactly one glassmorphic block (position relative, blur, padding 12/20/16, margin-top 20, margin-bottom 12, z-index 50, max-width 1000).  
   - Delete other `.chat-composer` blocks that change padding/margins.
2) **`.chat-page .cb-app-shell`**  
   - Exactly one rule with `padding-bottom: 0;`. Remove any 72px variant if present.
3) **Composer pill – `.cb-council-wrapper`**  
   - Keep one cluster: dark base + amber armed (`background: #fef9c3`, `box-shadow` with `#facc15`, orange→yellow segments with dark text).  
   - Delete cyan/fused experiments and any `council-pill*` without `cb-`.
4) **Header pill – `.cb-council-pill`**  
   - Keep base blue pill + segments.  
   - Ensure a single armed modifier on `.cb-council-pill.cb-council-pill--armed` that flips to amber/orange fill, strong yellow-ish glow, and dark text. Remove green-glow-only variants.

## 3) Recommended visual spec (common palette)
- **Armed gradient:** `linear-gradient(130–135deg, #f97316, #fbbf24)` (orange → amber).  
- **Armed text:** Dark slate `#0f172a` / `#111827`.  
- **Glow (optional):** Amber halo `box-shadow: 0 0 0 2px rgba(250, 204, 21, 0.8), 0 0 18–22px rgba(251, 191, 36, 0.5–0.6)`.

## 4) Minimal edits to apply (CSS only)
1) Collapse `.chat-composer` to the canonical block; remove all duplicates.  
2) Ensure a single `.chat-page .cb-app-shell { padding-bottom: 0; }`.  
3) Prune `.cb-council-wrapper` to the final dark/amber version only; delete other generations and legacy `council-pill*`.  
4) Add/keep one amber armed rule for `.cb-council-pill.cb-council-pill--armed` with dark text; remove green-glow-only armed rules.

## 5) Verification checklist after cleanup
- One `.chat-composer` rule; composer sits above footer with consistent padding/margins.  
- One `.chat-page .cb-app-shell { padding-bottom: 0; }`.  
- One `.cb-council-wrapper` cluster; composer pill turns amber/orange when armed.  
- One `.cb-council-pill.cb-council-pill--armed` rule; header pill turns amber/orange when armed.  
- OFF states unchanged (dark/blue). JS untouched.

## 6) Notes on state hooks
- JS toggles three classes; CSS may target any/all of `.cb-council-armed`, `.cb-council-pill--armed`, `.cb-pill-armed-on` on the wrapper found by `cbGetCouncilElements()`.  
- Segments are referenced by `[data-role="council-label"]` and `[data-role="council-count"]`; header segments also have `.cb-council-pill-main/count`.  
- No inline styles should be needed once CSS is normalized.

## 7) Conclusion
The only real work is CSS hygiene: dedupe layout rules, keep one composer pill implementation, and add a true armed fill for the header pill. JS/state is already correct. Once the CSS is cleaned, armed mode will be visually obvious (amber fill) without further JS/HTML changes.
