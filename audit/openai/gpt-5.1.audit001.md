## CSS Audit – chat & council components (assets/style.css)

**Date:** 2025-12-06  
**Auditor:** GPT-5.1 (Preview)  
**File:** `coolbits/assets/style.css` (≈2.2k lines)

Scope: analysis only, focused on chat layout and council-related UI. No CSS changes proposed; this is a mapping and conflict report you can use for manual cleanup.

---

### 1) High-level map

- **Design tokens & base:** `:root` variables and global reset (`body`, `*, *::before, *::after`) at the top.
- **Chat page + wrapper:** `.chat-page`, `.chat-wrapper` and app shell / sidebar system (`.cb-app-shell`, `.cb-sidebar`, shell-active/mobile variants) near the top.
- **Navigation & user area:** `.top-bar`, `.cb-user-menu`, user avatar/menu, token banner.
- **Chat container & messages:** `.chat-container`, `.chat-shell`, `.chat-header`, `.chat-body`, `.chat-messages`, `.chat-message*` and related typography/markdown rules.
- **Composer & council-in-composer:** `.chat-composer` (glassmorphic fixed footer composer), `#cb-composer` textarea/input, `.cb-composer-inner`, `.cb-composer-addon`, `.cb-council-plus`, `.cb-council-active`, `.cb-council-pill*` (active selection pill in/near composer).
- **Council modal/popover:** `.cb-modal*`, `.cb-council-popover*`, `.cb-council-item*` for the selection list.
- **Climate badge & chat footer:** `.climate-badge`, `.chat-footer`, `.site-footer`.
- **Overlays, onboarding, settings, legal:** Footer overlay, onboarding modal, settings toggle, legal-document, user overlay, responsive media queries at the bottom.

**Generational “layers” for chat/council:**
- **Older shell-structured chat:** `.chat-shell`, `.chat-header`, `.chat-body`, `.chat-container`, `.chat-panel` – a more monolithic chat card layout.
- **Newer “page + fixed composer” chat:** `.chat-page`, `.chat-wrapper` plus a fixed `.chat-composer` and a free-standing `.chat-footer`/`.climate-badge` – this looks like the current canonical layout.
- **Council UX:** The file only contains a single generation of council styles, all under the `cb-` prefix (no older cyan vs amber split within CSS itself). The “armed” amber/yellow concept from JS is **not yet reflected in CSS**; states are currently blue-accented.

---

### 2) Selector inventory for critical pieces

Line numbers are approximate and based on the current file.

#### 2.1 `.chat-composer`

1. **Container (canonical glassmorphism composer)**  
	 - **Selector:** `.chat-composer`  
	 - **Lines:** ~L330–L345  
	 - **Summary:** Fixed bar near bottom, horizontally centered using `left: calc(50% + var(--cb-sidebar-offset, 0px))` and `transform: translateX(-50%)`; `max-width: 780px`; dark translucent background (`rgba(17, 24, 39, 0.95)`), `backdrop-filter: blur(12px)`, `border-top` and top-rounded corners, padding, `z-index: 999`, upward box-shadow.  
	 - **Assessment:** **Newer/canonical** – clearly the intended glassmorphic composer.

2. **Composer form & inner layout**  
	 - **Selectors:** `.chat-composer form`, `.cb-composer-inner`, `#cb-composer textarea`, `#cb-composer #chat-input`, `.cb-composer-addon`, `#cb-composer .btn`  
	 - **Lines:** ~L345–L385  
	 - **Summary:** Flex row, gap between input and buttons; inner flex `cb-composer-inner`; shared sizing for textarea/input and buttons.
	 - **Assessment:** **Newer/canonical** – matches current DOM/JS naming (`#cb-composer`).

3. **Legacy text-input implementation**  
	 - **Selector:** `.chat-composer input[type="text"]` (+ `:focus`, `::placeholder`)  
	 - **Lines:** ~L405–L425  
	 - **Summary:** Styled single-line input (height: 48px, border, background, placeholder).  
	 - **Assessment:** **Older/legacy** – superseded by textarea-based path; JS and markup point to `#cb-composer textarea` now.

4. **Textarea implementation**  
	 - **Selector:** `.chat-composer textarea` (+ `:focus`, `::placeholder`)  
	 - **Lines:** ~L430–L455  
	 - **Summary:** Multiline field with border, dark background, smooth focus state, no resize, `min-height: 44px`, `overflow-y: hidden`.  
	 - **Assessment:** **Newer/canonical** – used by `#cb-composer` and consistent with current UX.

5. **Submit button**  
	 - **Selector:** `.chat-composer button` (+ `:hover`, `:disabled`)  
	 - **Lines:** ~L455–L485  
	 - **Summary:** Gradient background from `var(--accent)` to blue, padding, rounded corners, subtle motion/shadow on hover; disabled state dims and removes transform.  
	 - **Assessment:** **Newer/canonical** for send button.


#### 2.2 `.chat-page .cb-app-shell` and `.cb-app-shell`

1. **Base app shell**  
	 - **Selector:** `.cb-app-shell`  
	 - **Lines:** ~L70–L75  
	 - **Summary:** `width: 100%`, `flex: 1`; serves as the main shell wrapper.
	 - **Assessment:** **Canonical base**.

2. **Shell active layout**  
	 - **Selector:** `body.cb-shell-active .cb-app-shell`  
	 - **Lines:** ~L75–L82  
	 - **Summary:** `display: flex`, `gap: 0`, `min-height: 100vh`; engages sidebar + main panel layout when shell is active.
	 - **Assessment:** **Canonical “workspace” mode**.

3. **Mobile shell behavior**  
	 - **Selector:** `body.cb-mobile .cb-app-shell`  
	 - **Lines:** ~L115–L120  
	 - **Summary:** Ensures min-height 100vh under mobile body flag.  
	 - **Assessment:** **Canonical responsive variant**.

There is no explicit `.chat-page .cb-app-shell { … }` block; the chat page context is provided by `.chat-page` wrapping plus shell/body classes.


#### 2.3 `.chat-wrapper`

1. **Base wrapper**  
	 - **Selector:** `.chat-wrapper`  
	 - **Lines:** ~L40–L55  
	 - **Summary:** Constrains width to 820px, centers via margin auto, `padding: 20px 20px 110px 20px`, `flex: 1`, column layout, `overflow: hidden`.  
	 - **Assessment:** **Canonical base** – this bottom padding is what clears the fixed composer.

2. **Shell-active wrapper**  
	 - **Selector:** `body.cb-shell-active .chat-wrapper`  
	 - **Lines:** ~L90–L100  
	 - **Summary:** Removes max-width limit, zeroes margins, sets `padding: 24px 32px 140px 32px`.  
	 - **Assessment:** **Canonical shell variant** – more spacious layout when the sidebar shell is enabled.

3. **Tablet shell override**  
	 - **Selector:** `body.cb-shell-active .chat-wrapper` inside `@media (max-width: 1024px)`  
	 - **Lines:** ~L220–L230  
	 - **Summary:** `padding: 20px 20px 120px;` (three-value shorthand).  
	 - **Assessment:** **Canonical responsive override** – adjusts padding on mid-sized screens.

4. **General responsive wrapper**  
	 - **Selector:** `.chat-wrapper` and `body.cb-shell-active .chat-wrapper` inside `@media (max-width: 960px)`  
	 - **Lines:** ~L1040–L1055  
	 - **Summary:** `.chat-wrapper { padding: 16px 16px 110px 16px; }` and shell variant `padding: 16px 16px 130px 16px;`.  
	 - **Assessment:** **Canonical mobile-ish overrides**, though the set of different bottom paddings is fragmented.


#### 2.4 `.chat-footer`

1. **Footer container**  
	 - **Selector:** `.chat-footer`  
	 - **Lines:** ~L520–L535  
	 - **Summary:** Fixed to bottom, full-width, opaque near-black background, subtle top border, small vertical padding, `z-index: 996`, small font, muted color.
	 - **Assessment:** **Canonical** fixed legal/footer bar.

2. **Footer links**  
	 - **Selector:** `.chat-footer a`, `.chat-footer a:hover`  
	 - **Lines:** ~L535–L545  
	 - **Assessment:** **Canonical**.

3. **Footer paragraph positioning**  
	 - **Selector:** `.chat-footer p`  
	 - **Lines:** ~L545–L555  
	 - **Summary:** Zero margin, uses `left: calc(50% + var(--cb-sidebar-offset, 0px))`, `transform: translateX(-50%)`, and `width: min(90vw, 820px)` to align with the chat column even when the sidebar shifts things.  
	 - **Assessment:** **Canonical** and tightly coupled to `--cb-sidebar-offset`.


#### 2.5 `.cb-council-wrapper` (+ variants)

- **Finding:** There is **no `.cb-council-wrapper` selector** in this CSS. The composer-level council control is implemented via `.cb-composer-addon` and `.cb-council-active` instead.  
- Any behavior you expect on `.cb-council-wrapper` must either be applied to `.cb-composer-addon`/`.cb-council-active` or implemented as a new CSS block.


#### 2.6 `.cb-council-pill`, `.cb-council-pill-main`, `.cb-council-pill-count`

1. **Base active-pill styling**  
	 - **Selector:** `.cb-council-pill`  
	 - **Lines:** ~L380–L395  
	 - **Summary:** Inline-flex pill, gap ~10px, `max-width: 360px`, padding `6px 8px 6px 10px`, fully rounded (`border-radius: 999px`), dark navy-to-black gradient background, border in semi-opaque blue-gray, text color `#e5f3ff`.  
	 - **Assessment:** **Newer/canonical** header/active pill styling (used in/near composer and possibly header).

2. **Role label**  
	 - **Selector:** `.cb-council-pill-role`  
	 - **Lines:** ~L395–L400  
	 - **Summary:** Bold-ish, ~0.9rem label.

3. **Badge / sublabel**  
	 - **Selector:** `.cb-council-item-badge` (also duplicated later under council list)  
	 - **Lines:** ~L400–L410  
	 - **Summary:** Uppercase, tracking, bright blue text; used both in pill and in modal list.

4. **Clear button**  
	 - **Selector:** `.cb-council-pill-clear` (+ `:hover`)  
	 - **Lines:** ~L410–L425  
	 - **Summary:** Small round button at pill edge, dark background; on hover becomes vivid red and lifts slightly.

5. **Missing “main” and “count” selectors**  
	 - **Selectors expected:** `.cb-council-pill-main`, `.cb-council-pill-count`  
	 - **Finding:** These **do not appear** anywhere in the stylesheet. The structure appears to rely on `.cb-council-pill-role` and the potential count text is managed as plain text inside the pill.


#### 2.7 Legacy `council-pill*` selectors (no `cb-` prefix)

- Searched within the loaded CSS: there are **no selectors starting with `council-pill` without the `cb-` prefix**.  
- All council pieces are consistently prefixed: `.cb-council-*`.


#### 2.8 Other chat/council-related selectors

- **Chat structure:** `.chat-page`, `.chat-wrapper`, `.chat-container`, `.chat-shell`, `.chat-header`, `.chat-body`, `.chat-panel`, `.chat-messages`, `.chat-message.user/bot/system`, `#cb-composer`, `.chat-suggestions`, `.suggestion-button`, `.prompt-chip`, `.chat-error`, `.composer-error`.
- **Council in composer:** `.cb-composer-addon`, `.cb-council-plus`, `.cb-council-active`, `.cb-council-pill*`, `.cb-council-popover*`, `.cb-council-item*`.
- **State classes from JS that are **missing** in CSS:** `.cb-council-armed`, `.cb-council-pill--armed`, `.cb-pill-armed-on` – they appear only in JS per the XAI/Anthropic audits, not in this stylesheet.

---

### 3) Conflict analysis for critical selectors

#### 3.1 `.chat-composer`

- **Container:** Only one `.chat-composer` block defines container-level properties. There is no conflicting second definition; minor responsive adjustments happen in media queries that change `width`, `padding`, and `bottom` but are clearly intended overrides, not competing “generations”.  
	- **Winner:** Base `.chat-composer` (L330–L345) plus the `@media (max-width: 960px)` override (L1045–L1055) on narrow screens – the latter wins on small viewports due to cascade + media conditions.
- **Inputs:** There are two distinct “generations”:  
	- Legacy: `.chat-composer input[type="text"]` (L405–L425).  
	- Current: `#cb-composer textarea` and `.chat-composer textarea` (L430–L455).  
	- In practice, **they do not conflict** because they target different elements. But the presence of both is confusing and signals a migration from input to textarea.
- **Buttons:** Single `.chat-composer button` block and its states; no competing versions.  
	- **Winner:** This block is unambiguously canonical.

**Where the visual behavior is coming from now:**
- Fixed glassmorphic bar = `.chat-composer` (plus its mobile override).
- Multiline messaging = textarea rules (`.chat-composer textarea` / `#cb-composer textarea`).
- Send button look/hover/tap = `.chat-composer button` and pseudo-states.


#### 3.2 `.chat-page .cb-app-shell` / `.cb-app-shell`

- `.cb-app-shell` only has one base rule and then stateful modifiers (`body.cb-shell-active .cb-app-shell`, `body.cb-mobile .cb-app-shell`). No overlapping repeated declarations; everything is complementary.  
- There is no explicit `.chat-page .cb-app-shell` rule – the `.chat-page` and `.cb-app-shell` pieces interact structurally in the DOM rather than via a combined selector.

**Winner:**
- Base `.cb-app-shell` defines default; shell/mobile variants take precedence when their body classes + media queries are active.

**Visual source RIGHT NOW:**
- When `body` has `cb-shell-active`, layout is controlled by `body.cb-shell-active .cb-app-shell` combined with sidebar rules.


#### 3.3 `.chat-wrapper`

- **Base:** `.chat-wrapper { padding: 20px 20px 110px 20px; … }`  
- **Shell-active:** `body.cb-shell-active .chat-wrapper { padding: 24px 32px 140px 32px; … }`  
- **Tablet shell:** Inside `@media (max-width: 1024px)`, `body.cb-shell-active .chat-wrapper { padding: 20px 20px 120px; }`.  
- **Mobile:** Inside `@media (max-width: 960px)`, two rules adjust `.chat-wrapper` and `body.cb-shell-active .chat-wrapper` to 110px / 130px bottom padding.

There is **no direct conflicting duplication** of the same selector outside of media queries. Instead, there is a web of overrides:

- On large desktop: base `.chat-wrapper` vs shell variant.
- On tablets: the `@media (max-width: 1024px)` shell rule overrides the earlier shell padding.
- On smaller screens: `@media (max-width: 960px)` overrides both base and shell paddings.

**Winner logic:**
- The most specific matching rule that appears later and within the active media query wins. That gives a coherent – but somewhat brittle – cascade across breakpoints.

**Where clearance above the footer/composer comes from:**
- Exclusively from the bottom padding of `.chat-wrapper` and its variants: 110px, 120px, 130px, 140px across variants.


#### 3.4 `.chat-footer`

- There is a single `.chat-footer` definition and one `.chat-footer p` rule. There are **no alternate “generations”** or conflicting blocks. Responsive tweaks at very small widths only adjust font-size and padding for `.chat-footer`, not core positioning logic.

**Winner:**
- The main `.chat-footer` block, plus small-screen overrides in `@media (max-width: 640px)` (slightly smaller font and padding).

**Visual behavior NOW:**
- Fixed at the bottom of the viewport, layered behind/on par with the composer depending on z-index; horizontally clipped to the chat column via the `left + transform` technique using `--cb-sidebar-offset`.


#### 3.5 `.cb-council-wrapper`

- Not defined anywhere; there is **no cascade to analyze**. Any JS class toggling on this selector currently has **no CSS effect**.


#### 3.6 `.cb-council-pill` and related

- Only one canonical block for `.cb-council-pill`. There is no earlier or later variant; no theme-flip between cyan/amber inside CSS.  
- Armed modifier (`.cb-council-pill--armed`) is **not present**. Therefore, all armed state visual changes must come from other selectors or are currently missing.

**Actual “armed-ish” behavior today:**
- The only stateful visual change for council around the composer is on the **addon button**, not the pill:  
	- `.cb-composer-addon[data-has-selection="true"]` and its descendant `.cb-council-plus` change background/border and icon color with a blue accent.  
	- No selectors reference `.cb-council-armed`, `.cb-council-pill--armed`, or `.cb-pill-armed-on` at all.

**Conflict summary:**
- There is no direct conflict — rather, there is a **mismatch** between JS state classes and CSS. JS toggles classes that CSS doesn’t know about; CSS uses a `data-has-selection` attribute which JS does not explicitly set in the described audits (JS uses classes instead).


#### 3.7 Legacy `council-pill*` (no `cb-`)

- None exist, so there are no conflicts – just an absence of the legacy naming layer.

---

### 4) Canonical candidate identification (conceptual)

#### 4.a CHAT LAYOUT

**Canonical `.chat-composer` block (glassmorphic):**
- The block around **L330–L345** is clearly the intended “final” glassmorphism design: fixed positioning, centered with sidebar offset, blurred, dark translucent background, top border, and shadow. There is no competing `.chat-composer` container block.

**Canonical `.chat-page .cb-app-shell` behavior:**
- Layout comes from:  
	- `.chat-page` (L25–L40): full-height radial background, flex column, overflow hidden.  
	- `.cb-app-shell` (L70–L75) and `body.cb-shell-active .cb-app-shell` (L75–L82).  
- These work together as the “final” shell; there is no older/alternate shell for chat.

**Is `.chat-wrapper { padding: 8px 12px 120px 12px; }` the clearance source?**
- No block uses that exact padding. The **actual** clearance is provided by:  
	- `.chat-wrapper` base: `padding-bottom: 110px`.  
	- `body.cb-shell-active .chat-wrapper`: `padding-bottom: 140px`.  
	- Media-query overrides at 1024px and 960px adjust bottom padding to 120px/110px/130px depending on shell and breakpoint.  
- All clearance is from `.chat-wrapper` bottom padding; there isn’t a “competing” alternative.

**Older blocks that could be removed if we choose a canonical layout:**
- **Likely legacy, subject to DOM usage check:**  
	- `.chat-shell` (card-style shell with its own header/body; near L250+).  
	- `.chat-header` and `.chat-body` under that shell.  
	- `.chat-container` / `.chat-panel` early in the file.  
- These appear to predate the `chat-page + chat-wrapper + fixed composer` pattern. If current templates never use this “inner shell” structure any more, they’re strong legacy removal candidates.
- **Definitely legacy within composer:** `.chat-composer input[type="text"]` and its states can be removed if markup no longer uses a text input.


#### 4.b COUNCIL PILL – COMPOSER

**Which implementation is “final” (dark base + amber/yellow armed)?**
- In the **current CSS**, there is **no amber/yellow armed state**. The visual design is:  
	- Dark, slightly glossy addon button `.cb-composer-addon`.  
	- When there is a selection (CSS assumes a `data-has-selection="true"` attribute): darker background and **blue** border (cyan/sky-blue accent), plus light-blue icon color.  
	- Active pill `.cb-council-pill` is dark navy gradient with blue-ish badge text.  
- So the **canonical composer-side implementation today** is:  
	- `.cb-composer-addon` + `data-has-selection="true"]`, and  
	- `.cb-council-active` + `.cb-council-pill` + `.cb-council-pill-role` + `.cb-council-pill-clear`.

**Older/cyan/experimental wrappers?**
- There are **no alternate `.cb-council-wrapper` or second-generation council styles** in this stylesheet. All council color choices are already in the blue family; there’s no visible “old cyan vs new amber” split. The amber/yellow idea exists conceptually (per JS audits) but hasn’t been added to CSS.

**How `.cb-council-armed` and `.cb-pill-armed-on` combine today (CSS view):**
- They **do not combine at all** in CSS:  
	- No selectors reference `.cb-council-armed`.  
	- No selectors reference `.cb-pill-armed-on`.  
	- No modifier `.cb-council-pill--armed` exists.  
- JS toggles these classes (per XAI audit), but from the stylesheet’s perspective they are inert.


#### 4.c COUNCIL PILL – HEADER

**Base `.cb-council-pill` style (current):**
- Dark, slightly glossy pill: navy-to-black gradient background, semi-opaque blue-gray border, light cyanish text (`#e5f3ff`), inline-flex row with label and optional badge and clear button.

**Current `.cb-council-pill.cb-council-pill--armed` behavior:**
- **None implemented.** There is no `.cb-council-pill--armed` selector, so adding this class from JS does nothing.

**Older conflicting `.cb-council-pill--armed` blocks (e.g., green glow):**
- None. There are no older or alternate armed modifiers; the concept is entirely absent from this file.

**Which selector actually controls “armed” state now?**
- The **only stateful council styling** is via `data-has-selection` on `.cb-composer-addon` and, by implication, the presence/absence of `.cb-council-pill` in the DOM.  
- Any “armed” class-based state is **currently controlled purely by JS logic and DOM structure**, not reflected in CSS visuals.


#### 4.d LEGACY NOISE

**Unprefixed `council-pill*` selectors:**
- None – so no legacy `council-pill` without `cb-` prefix to remove.

**Other obviously dead or suspect chat/council variants:**
- **Composer input vs textarea:**  
	- `.chat-composer input[type="text"]` family looks like a fully superseded generation. If the markup never creates this input now, it’s safe to treat as **dead legacy**.
- **Chat-shell-based layout:**  
	- `.chat-shell`, `.chat-header`, `.chat-body`, `.chat-container`, `.chat-panel` appear to be an earlier “card” layout variant. If current production pages all use `.chat-page` + `.chat-wrapper` + `.chat-messages` + fixed `.chat-composer`, these shell styles may be unused noise. They are not referenced by JS in the audits you shared.
- **Council wrapper naming mismatch:**  
	- `.cb-council-wrapper` mentioned in the JS audits is not present in CSS – any styles targeting it would need to be newly added or renamed; right now it’s simply absent, so the old name, if present in HTML, is semantically but not visually relevant.

---

### 5) Minimal cleanup plan (conceptual, no CSS)

Below is a prose-only, step-by-step cleanup roadmap focused on the components you care about.

#### 5.1 Decide canonical blocks to KEEP

- **`.chat-composer` (composer container + internals)**  
	- Keep the fixed, glassmorphic `.chat-composer` block (~L330–L345).  
	- Keep form/inner layout: `.chat-composer form`, `.cb-composer-inner`, `#cb-composer textarea`, `#cb-composer #chat-input`, `.cb-composer-addon`, `#cb-composer .btn` (~L345–L385).  
	- Keep textarea and button blocks: `.chat-composer textarea` (+ states), `.chat-composer button` (+ states) (~L430–L485).  
	- Treat `data-has-selection` based styles on `.cb-composer-addon` as the canonical visual “selected/armed” hint until you explicitly move to class-based armed state.

- **`.chat-page .cb-app-shell` / `.cb-app-shell`**  
	- Keep `.chat-page` block at the top and all `.cb-app-shell` rules (base, `body.cb-shell-active`, `body.cb-mobile`) as the canonical shell/layout foundation.  
	- Keep body-level CSS variable management for `--cb-sidebar-offset` (plain, shell-active, shell-collapsed, mobile, media overrides) as this drives composer, footer, and climate badge alignment.

- **`.chat-wrapper`**  
	- Keep base `.chat-wrapper` and its shell-active variant.  
	- Keep the tablet (`@media (max-width: 1024px)`) and mobile (`@media (max-width: 960px)`) overrides.  
	- Plan to rationalize bottom padding values into a variable rather than multiple magic numbers, but keep the structure.

- **`.cb-council-wrapper` (composer pill)**  
	- Since `.cb-council-wrapper` is absent, your canonical “wrapper” is:  
		- `.cb-composer-addon` (button entry point)  
		- `.cb-council-active` (row above composer)  
		- `.cb-council-pill`, `.cb-council-pill-role`, `.cb-council-pill-clear`, `.cb-council-item-badge` (active selection pill).  
	- Treat these as the canonical composer council components and build additional state modifiers around them.

- **`.cb-council-pill` (header/active pill)**  
	- Keep `.cb-council-pill` and its supporting label/badge/clear selectors as the canonical visual for an active council selection.


#### 5.2 Identify and mark legacy blocks to DELETE (after verification)

- **Composer legacy input path**  
	- Remove `.chat-composer input[type="text"]` and its associated focus/placeholder declarations (~L405–L425) once you confirm no templates still render this element.

- **Unused shell-style chat layout** (if not used in templates):  
	- `.chat-shell` and its child blocks `.chat-header`, `.chat-body`.  
	- `.chat-container`, `.chat-panel`.  
	- Any associated helper selectors that are clearly tied to the old card-style wrapper but not to the new `chat-page` layout.  
	- Before removal, cross-check HTML/JS for these class names; if they are unused, you can safely delete the entire section as “Gen 1 chat layout”.

- **Ghost state classes (CSS side only):**  
	- Consider **adding** rather than deleting here: CSS currently has no `.cb-council-armed`, `.cb-council-pill--armed`, `.cb-pill-armed-on`. They are not legacy; they are **missing**. You should not delete them from JS but rather implement them in CSS during a later phase.


#### 5.3 Normalize ordering in the CSS file

For maintainability, you’ll want all chat/council CSS to live together near the middle/bottom of the file, in this conceptual order:

1. **Global & layout primitives:** `:root`, base elements, `.chat-page`, `.cb-app-shell`, `.chat-wrapper`, sidebar shell, and top-bar – these can stay near the top.
2. **Chat layout + messages (single “Chat” section):**  
	 - `.chat-container`, `.chat-shell` (if still used), `.chat-header`, `.chat-body`.  
	 - `.chat-messages`, `.chat-message.*` and all markdown/typography rules.  
	 - `.chat-suggestions`, `.suggestion-button`, `.prompt-chip`, `.chat-error`, `.composer-error`.
3. **Composer** (subsection under Chat):  
	 - `.chat-composer` and its children (`form`, `.cb-composer-inner`, inputs/textarea/buttons).  
	 - Place the canonical composer CSS together with minimal scattering across file.
4. **Council composer & header pills** (another subsection):  
	 - `.cb-composer-addon`, `.cb-council-plus`, `.cb-council-active`, `.cb-council-pill*`, `.cb-council-popover*`, `.cb-council-item*`.  
	 - Later, add `.cb-council-armed`, `.cb-council-pill--armed`, `.cb-pill-armed-on` modifiers adjacent to the base definitions.
5. **Footer & climate components:** `.climate-badge`, `.chat-footer`, `.site-footer`, footer overlays.
6. **Modal/overlay & onboarding:** `.cb-modal*`, onboarding, user overlays, settings rows.
7. **Responsive breakpoints:** Group media queries in a predictable tail section, with internal comments pointing back to the sections they adjust.


#### 5.4 Tame bottom-padding and clearance behavior

- Introduce a single conceptual **“composer height”** variable that all `.chat-wrapper` paddings reference (even if you don’t implement it yet in code):
	- Treat base composer clearance (~110px) and shell-clearance (~140px) as the design constraints.  
	- Document which values should be used at which breakpoints and why (e.g., “extra padding on shell at desktop because composer is slightly taller with council pill”).
- Then, in a later editing phase, you can:  
	- Replace magic numbers across `.chat-wrapper` rules with a shared variable.  
	- Remove accidentally diverged values (110/120/130/140) once you lock on a canonical set.


#### 5.5 Align class-based and attribute-based council states

- **Document current behavior:**  
	- Composer button state is controlled via `data-has-selection="true"` on `.cb-composer-addon`.  
	- JS currently toggles `.cb-council-armed`, `.cb-council-pill--armed`, `.cb-pill-armed-on` (per the XAI audit), which CSS ignores.
- **Plan a reconciliation step (future work, not in this audit):**  
	- Decide whether `data-has-selection` remains the source of truth OR you want to migrate to the JS state classes.  
	- Whichever you choose, co-locate those modifiers directly under the base selectors (`.cb-composer-addon`, `.cb-council-pill`).  
	- Implement the amber/yellow “armed” visual language there (e.g., gradient, glow) to match product intent.


#### 5.6 Watch for media query and z-index gotchas

- **Media queries:**  
	- Track where `.chat-wrapper`, `.chat-composer`, `.chat-footer`, `.climate-badge`, and `.cb-composer-addon` are touched inside `@media` blocks. Aim to keep all chat/council-responsive rules in a tight cluster (rather than sprinkled through the file) so overrides are obvious.
- **Z-index layering:**  
	- Composer (`z-index: 999`), climate badge (`997`), chat-footer (`996`), modals (`1300`, `1400`), and sidebars (`2`, menus `1000`) form an ad-hoc stack.  
	- In a cleanup pass, define a small named z-index scale in design tokens and re-map these components accordingly so composer/council/footer layering is predictable.


#### 5.7 Final checklist before you or another agent edits CSS

- Confirm via DOM inspection which of the suspect legacy selectors (`.chat-shell`, `.chat-container`, `.chat-panel`, `.chat-header`, `.chat-body`, `.chat-composer input[type="text"]`) are actually unused in production.  
- Once confirmed, annotate them as “LEGACY – candidate for removal” in comments or remove entirely in a single PR/commit.  
- When implementing council armed visuals, keep the three JS state flags exactly as-is (do **not** rename them):  
	- `.cb-council-armed`  
	- `.cb-council-pill--armed`  
	- `.cb-pill-armed-on`  
	and add CSS behaviors that are purely additive on top of the existing canonical pill/addon blocks.

---

This audit is intentionally analysis-only and aligned with the prior Anthropic/XAI audits: JS state management is treated as fixed; CSS is mapped and conflict-checked so you can safely refactor towards a single canonical chat layout and council pill system.
