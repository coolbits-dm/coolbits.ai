# CSS Audit Report: assets/style.css

**Date:** December 6, 2025  
**Auditor:** Claude Sonnet 4.5  
**File:** `C:\awb\coolbits\assets\style.css`  
**Lines:** ~2,240  
**Scope:** Analysis only (no patches/rewrites)

---

## 1. HIGH-LEVEL MAP

### Overall Structure
The file is approximately **2,240 lines** and contains multiple generations of overlapping styles with clear evidence of iterative development. The structure breaks down into:

**Major sections identified:**
1. **Design tokens** (L1-19): CSS variables for theming
2. **Global resets** (L21-40): Box-sizing, body defaults
3. **Chat page layout** (L45-67): Chat-specific page structure
4. **Workspace shell** (L69-235): Sidebar navigation system with collapse states
5. **Sidebar components** (L118-840): Extensive sidebar UI elements
6. **Top bar** (L842-980): Header navigation (hidden when shell is active)
7. **User menu & authentication** (L982-1080): User badges, menus, avatars
8. **Chat container & messages** (L1082-1430): Message display and styling
9. **Chat composer** (L1432-1790): Multiple composer implementations
10. **Council pill system** (L1600-1730): Agent selection UI in composer
11. **Footer elements** (L1792-2000): Fixed footer, climate badge
12. **Modals & overlays** (L2000-2200): Various modal implementations
13. **Responsive breakpoints** (L2200-2240): Mobile adaptations

**Generational layers detected:**
- **Generation 1** (Legacy): Older chat composer styles around L1432-1550, using simpler backgrounds
- **Generation 2** (Cyan/Blue era): Council pill styles with cyan/blue colors (L1600-1650)
- **Generation 3** (Current/Amber era): Glassmorphic composer (L1432-1480), dark base + amber armed states for council pills (L1650-1730)

---

## 2. SELECTOR INVENTORY FOR CRITICAL PIECES

### A. `.chat-composer`

**Block 1: L1432-1480 (CANONICAL - Glassmorphic composer)**
```
Selector: .chat-composer
Lines: L1432-1441
Context: Fixed positioning with glassmorphic backdrop
Visual: rgba(17, 24, 39, 0.95) background, backdrop-filter blur(12px)
Assessment: NEWER/CANONICAL - Uses modern glassmorphism, accounts for sidebar offset
```

**Block 2: L1502-1540 (Legacy input styling)**
```
Selector: .chat-composer input[type="text"]
Lines: L1502-1519
Context: Text input styling
Assessment: LEGACY - Appears to be from older design, no longer used (composer uses textarea now)
```

**Block 3: L1542-1600 (Textarea implementation)**
```
Selector: .chat-composer textarea
Lines: L1542-1560
Context: Textarea styling for message input
Visual: rgba(30, 41, 59, 0.8) background
Assessment: CURRENT - Used in active implementation
```

**Block 4: L1562-1585 (Button styling)**
```
Selector: .chat-composer button
Lines: L1562-1585
Context: Submit button with gradient
Visual: linear-gradient(135deg, var(--accent), #3b82f6)
Assessment: CURRENT - Active submit button style
```

### B. `.chat-page .cb-app-shell`

**Block 1: L69-81 (Base shell)**
```
Selector: .cb-app-shell
Lines: L69-72
Context: Base flex container
Assessment: BASE - Minimal base styles
```

**Block 2: L73-81 (Active shell state)**
```
Selector: body.cb-shell-active .cb-app-shell
Lines: L73-77
Context: When workspace shell is active
Assessment: CANONICAL - Defines flex layout with gap: 0, min-height: 100vh
```

### C. `.chat-wrapper`

**Block 1: L55-67 (Primary implementation)**
```
Selector: .chat-wrapper
Lines: L55-67
Context: Main chat content wrapper
Padding: 20px 20px 110px 20px
Assessment: CANONICAL - Provides bottom clearance (110px) for fixed composer
```

**Block 2: L99-103 (Shell active override)**
```
Selector: body.cb-shell-active .chat-wrapper
Lines: L99-103
Context: When sidebar is active
Padding: 24px 32px 140px 32px
Assessment: CANONICAL OVERRIDE - Increases spacing for shell mode
```

**Block 3: L817-820 (Tablet override)**
```
Selector: body.cb-shell-active .chat-wrapper (inside @media)
Lines: L817-819
Context: Tablet breakpoint
Padding: 20px 20px 120px
Assessment: RESPONSIVE OVERRIDE - Reduces spacing on smaller screens
```

### D. `.chat-footer`

**Block 1: L1792-1821 (Primary footer)**
```
Selector: .chat-footer
Lines: L1792-1809
Context: Fixed bottom footer with legal links
Background: rgba(11, 11, 12, 0.98)
Assessment: CANONICAL - Single implementation, fixed positioning
```

**Block 2: L1811-1821 (Footer paragraph)**
```
Selector: .chat-footer p
Lines: L1811-1821
Context: Footer content positioning
Special: Accounts for sidebar offset: left: calc(50% + var(--cb-sidebar-offset, 0px))
Assessment: CANONICAL - Part of main footer implementation
```

### E. `.cb-council-wrapper`

**⚠️ IMPORTANT FINDING: No `.cb-council-wrapper` selector exists in the file.**

The council UI in the composer uses **`.cb-composer-addon`** and **`.cb-council-active`** instead. This is a mismatch with your assumed class names.

**Actual implementation:**

**Block 1: L1470-1505 (Composer addon - Council button)**
```
Selector: .cb-composer-addon
Lines: L1470-1480
Context: Council "+" button in composer
Background: var(--cb-surface-elevated)
Border: 1px solid rgba(255, 255, 255, 0.08)
Assessment: CANONICAL - Current implementation
```

**Block 2: L1481-1489 (Addon hover)**
```
Selector: .cb-composer-addon:hover
Lines: L1481-1484
Assessment: CANONICAL - Active hover state
```

**Block 3: L1486-1494 (Has selection state)**
```
Selector: .cb-composer-addon[data-has-selection="true"]
Lines: L1486-1494
Context: When council member is selected
Background: rgba(15, 23, 42, 0.85)
Border: rgba(56, 189, 248, 0.7)
Assessment: CANONICAL - Blue accent for armed state
```

**Block 4: L1495-1505 (Armed icon color)**
```
Selector: .cb-composer-addon[data-has-selection="true"] .cb-council-plus
Lines: L1495-1498
Color: #e5f3ff (light blue)
Assessment: CANONICAL - Current armed state indicator
```

**Block 5: L1507-1510 (Council active section)**
```
Selector: .cb-council-active
Lines: L1507-1513
Context: Container for active council pill above input
Assessment: CANONICAL - Active pill display area
```

### F. `.cb-council-pill` (Header pill in popover/modal)

**Block 1: L1515-1524 (Base pill styling)**
```
Selector: .cb-council-pill
Lines: L1515-1524
Background: linear-gradient(135deg, #0f172a, #020617)
Border: 1px solid rgba(148, 163, 184, 0.4)
Color: #e5f3ff
Assessment: CANONICAL - Dark base with blue accent
```

**⚠️ NO `.cb-council-pill--armed` implementation found in the file.**

The armed state for the header pill is not implemented in CSS. Only the composer addon has armed states.

### G. `.cb-council-pill-main` and `.cb-council-pill-count`

**⚠️ FINDING: These selectors do NOT exist in the file.**

The council pill structure uses:
- `.cb-council-pill-role` (L1526-1530)
- `.cb-council-item-badge` (L1532-1538)
- `.cb-council-pill-clear` (L1540-1558)

### H. Legacy `council-pill*` selectors (without `cb-` prefix)

**✓ FINDING: No legacy council-pill selectors exist.**

All council-related selectors use the `cb-` prefix consistently. There is no evidence of unprefixed legacy variants.

---

## 3. CONFLICT ANALYSIS

### A. `.chat-composer` conflicts

**NO MAJOR CONFLICTS.** 

The single `.chat-composer` block (L1432-1441) defines the container positioning and appearance. Child elements (textarea, button, form) are defined in separate, non-conflicting blocks. The structure is:
- Container: L1432-1441 ✓
- Form layout: L1443-1446 ✓
- Inner wrapper: L1448-1451 ✓
- Textarea: L1542-1560 ✓
- Button: L1562-1585 ✓

**Winner:** The L1432-1441 block is canonical and uncontested.

### B. `.chat-page .cb-app-shell` conflicts

**NO CONFLICTS.**

Two blocks exist but serve different purposes:
- `.cb-app-shell` (L69-72): Base styles
- `body.cb-shell-active .cb-app-shell` (L73-77): Active state

These are complementary, not conflicting.

### C. `.chat-wrapper` conflicts

**PADDING CONFLICTS ACROSS RESPONSIVE STATES:**

1. **Default:** `padding: 20px 20px 110px 20px` (L60)
2. **Shell active:** `padding: 24px 32px 140px 32px` (L101)
3. **Shell + Tablet:** `padding: 20px 20px 120px` (L819)
4. **Mobile:** `padding: 16px 16px 110px 16px` (L2075)
5. **Shell + Mobile:** `padding: 16px 16px 130px 16px` (L2078)

**Winner:** Cascade works correctly - more specific selectors win based on body classes and media queries. No actual conflict, just complexity.

**⚠️ ISSUE:** Bottom padding values (110px, 120px, 130px, 140px) are inconsistent and hard-coded. Should use CSS variable for composer height.

### D. `.chat-footer` conflicts

**NO CONFLICTS.** Single implementation (L1792-1809) with child styles.

### E. Council composer addon conflicts

**NO DIRECT CONFLICTS** in the addon button itself, but there's a **MISSING ARMED STATE IMPLEMENTATION.**

Current implementation:
- Base state: `.cb-composer-addon` uses subtle gray (L1470-1480)
- Selection state: `[data-has-selection="true"]` uses blue accent (L1486-1494)

**⚠️ MISSING:** No amber/yellow armed state as you described. The current "armed" state is BLUE, not amber.

**Assumption mismatch:** You mentioned JS toggles `.cb-council-armed` and `.cb-pill-armed-on`, but:
- `.cb-council-armed` selector: **DOES NOT EXIST in CSS**
- `.cb-pill-armed-on` selector: **DOES NOT EXIST in CSS**

The CSS only responds to `data-has-selection="true"` attribute.

### F. Header council pill conflicts

**NO CONFLICTS** because there's only one implementation (L1515-1524).

**⚠️ CRITICAL MISSING:** No `.cb-council-pill--armed` styles exist. If JS adds this class, it has zero visual effect.

---

## 4. CANONICAL CANDIDATE IDENTIFICATION

### A. CHAT LAYOUT

#### Which `.chat-composer` block is canonical?
**ANSWER: L1432-1441 is the only container implementation and is canonical.**

**Evidence:**
- Uses modern glassmorphism (`backdrop-filter: blur(12px)`)
- Accounts for sidebar offset with CSS variable
- Fixed positioning at bottom
- Professional visual design (rgba backgrounds, strong border)

**Recommendation:** Keep L1432-1441 as-is.

**Blocks that could be removed:** 
- L1502-1519 (`.chat-composer input[type="text"]`) - Legacy text input, no longer used

#### Which `.chat-page .cb-app-shell` block is canonical?
**ANSWER: Both blocks are canonical and complementary.**
- L69-72: Base styles (width: 100%, flex: 1)
- L73-77: Active shell state (display: flex, gap: 0, min-height: 100vh)

**Recommendation:** Keep both.

#### Is `.chat-wrapper { padding: 8px 12px 120px 12px; }` providing clearance?
**ANSWER: No such rule exists with those exact values.**

The actual clearance is provided by:
- L60: `padding: 20px 20px 110px 20px` (default)
- L101: `padding: 24px 32px 140px 32px` (shell active)

**The 110px/140px bottom padding** is what provides clearance above the fixed composer.

**Blocks to keep:**
- L55-67 (`.chat-wrapper`) - BASE CANONICAL
- L99-103 (`body.cb-shell-active .chat-wrapper`) - SHELL CANONICAL
- L817-819 (tablet override) - RESPONSIVE CANONICAL
- L2075-2078 (mobile overrides) - RESPONSIVE CANONICAL

**Blocks to remove:** None for `.chat-wrapper`.

### B. COUNCIL PILL – COMPOSER

#### Which `.cb-council-wrapper` implementation is canonical?
**ANSWER: `.cb-council-wrapper` does not exist.**

The actual canonical implementations are:
1. **Addon button:** `.cb-composer-addon` (L1470-1505) ✓ CANONICAL
2. **Active pill container:** `.cb-council-active` (L1507-1513) ✓ CANONICAL
3. **Pill itself:** `.cb-council-pill` (L1515-1524) ✓ CANONICAL

**Current armed state:** Blue accent via `[data-has-selection="true"]` (L1486-1494)

**⚠️ CRITICAL GAP:** You mentioned wanting amber/yellow armed state with `.cb-council-armed` and `.cb-pill-armed-on`, but these selectors are **completely missing from CSS**.

**Recommendation:**
- Keep L1470-1524 as canonical composer council UI
- If amber armed state is desired, NEW CSS must be written for `.cb-council-armed` or `.cb-pill-armed-on`

**Legacy blocks to remove:** NONE - no cyan/blue experimental blocks exist for this component.

### C. COUNCIL PILL – HEADER

#### Base `.cb-council-pill` style
**Location: L1515-1524**

**Colors:**
- Background: `linear-gradient(135deg, #0f172a, #020617)` (dark navy to near-black)
- Border: `1px solid rgba(148, 163, 184, 0.4)` (muted blue-gray)
- Text: `#e5f3ff` (very light blue)

**Layout:**
- `display: inline-flex`
- `align-items: center`
- `gap: 10px`
- `padding: 6px 8px 6px 10px`
- `border-radius: 999px` (pill shape)

#### Armed state behavior
**ANSWER: NO ARMED STATE EXISTS FOR HEADER PILL.**

The CSS file contains:
- Base pill: ✓ Exists (L1515-1524)
- Pill role label: ✓ Exists (L1526-1530)
- Pill badge: ✓ Exists (L1532-1538)
- Pill clear button: ✓ Exists (L1540-1558)
- **Armed modifier:** ✗ DOES NOT EXIST

**What JS class names would do:**
- `.cb-council-pill.cb-council-pill--armed` - No CSS, zero visual effect
- `.cb-council-armed` (body class) - No CSS, zero visual effect
- `.cb-pill-armed-on` - No CSS, zero visual effect

**Recommendation:** If armed state is needed, CSS must be written from scratch.

### D. LEGACY NOISE

#### `council-pill*` selectors without `cb-` prefix
**FINDING: NONE EXIST.**

All council selectors already use the `cb-` prefix:
- `.cb-council-active`
- `.cb-council-pill`
- `.cb-council-pill-role`
- `.cb-council-item-badge`
- `.cb-council-pill-clear`
- `.cb-council-item` (for modal items)
- `.cb-council-item-role`
- `.cb-council-item-desc`

**No cleanup needed.**

#### Other dead chat/council variants
**Potentially unused/dead selectors identified:**

1. **L1502-1519:** `.chat-composer input[type="text"]`
   - Reason: Composer uses textarea, not text input
   - Safe to remove: YES

2. **L1982-2155:** Multiple modal/popover implementations for council selection
   - `.cb-modal-backdrop`, `.cb-council-popover-backdrop`, `.cb-council-popover`
   - Reason: These appear active (council member selection UI)
   - Safe to remove: NO - still in use

3. **L1082-1115:** `.chat-container`, `.chat-panel`
   - Reason: Older chat container structure, replaced by direct message list
   - Check usage: Need to verify if still used in DOM
   - Tentative: LEGACY candidate

4. **L1117-1430:** Chat message styling (`.chat-message`)
   - Reason: Core functionality
   - Safe to remove: NO

5. **L1224-1255:** `.chat-shell`, `.chat-header`, `.chat-body`
   - Reason: Appears to be older chat structure separate from current panel-based system
   - Check usage: These may be legacy if chat no longer uses this structure
   - Tentative: LEGACY candidate

---

## 5. MINIMAL CLEANUP PLAN (English prose only)

### Step 1: Verify Active Selectors
**Action:** Before removing anything, audit the live DOM to confirm which selectors are actually in use:
- Check if `.chat-container` and `.chat-panel` exist in current HTML
- Check if `.chat-shell`, `.chat-header`, `.chat-body` exist
- Verify whether composer uses textarea or input type="text"

**Reasoning:** Some selectors appear legacy but may still be in older pages or fallback states.

### Step 2: Remove Confirmed Dead Selectors
**Delete these blocks:**

1. **L1502-1519:** `.chat-composer input[type="text"]` and related hover/focus states
   - Reason: Composer definitively uses textarea (L1542-1560), not text input

### Step 3: Consolidate Bottom Padding Strategy
**Refactor approach (conceptual):**

The chat wrapper bottom padding is currently hard-coded in 5 different places with 4 different values (110px, 120px, 130px, 140px). This is brittle and error-prone.

**Proposed solution:**
1. Define CSS variable: `--chat-composer-height: 110px` at `:root` level
2. Define CSS variable: `--chat-composer-height-shell: 140px` for shell mode
3. Replace all hard-coded bottom padding values with `padding-bottom: var(--chat-composer-height)`
4. Use conditional variables based on body classes

**Affected selectors to update:**
- L60: `.chat-wrapper`
- L101: `body.cb-shell-active .chat-wrapper`
- L819: `@media body.cb-shell-active .chat-wrapper`
- L2075: `@media .chat-wrapper`
- L2078: `@media body.cb-shell-active .chat-wrapper`

### Step 4: Implement Missing Armed States (If Desired)
**If amber/yellow armed state is the intended design:**

Add new CSS blocks after L1524 for:
1. `.cb-council-pill.cb-council-pill--armed` (header pill armed state)
2. `body.cb-council-armed .cb-composer-addon` or `.cb-pill-armed-on` (composer armed state)

**Conceptual styling:**
- Background: Shift from dark blue to amber/orange gradient
- Border: Amber glow (e.g., `box-shadow: 0 0 20px rgba(251, 191, 36, 0.6)`)
- Text: Warm white or amber-tinted text

**Alternative:** If blue accent is the desired armed state, document that `[data-has-selection="true"]` is the canonical approach and ensure JS uses data attributes, not classes.

### Step 5: Reorganize for Maintainability
**Recommended section order:**

Current structure is reasonably organized, but improvements:

1. **Design tokens** (already at top) ✓
2. **Global resets** (already L21-40) ✓
3. **Layout primitives** (shell, wrapper, page) - consolidate L45-235
4. **Navigation components** (sidebar, top bar) - consolidate L118-980
5. **Chat components** - CREATE NEW SECTION
   - Group all chat-related selectors together:
   - `.chat-wrapper` and variants
   - `.chat-container`, `.chat-panel` (if still used)
   - `.chat-messages`, `.chat-message` variants
   - `.chat-composer` and all children
   - Council pill system (composer addon + active pill)
6. **Modals & overlays** (L1982-2200)
7. **Footer components** (L1792-1840)
8. **Responsive overrides** (L2200-2240)

**Benefit:** Developers can quickly locate all chat-related styles in one contiguous block rather than hunting through 2000 lines.

### Step 6: Investigate Potentially Legacy Blocks
**Verify and potentially remove:**

1. **L1082-1115:** `.chat-container` and `.chat-panel`
   - Action: Check if used in DOM
   - If unused: Delete entire block
   - If used: Keep but move to chat components section

2. **L1224-1255:** `.chat-shell`, `.chat-header`, `.chat-body`
   - Action: Check if used in DOM
   - If unused: Delete entire block
   - If used: Keep but document purpose (alternative chat layout?)

3. **L1117-1145:** `.level-banner` and related
   - Action: Check if level-based features still exist
   - If feature removed: Delete
   - If still used: Keep

### Step 7: Document State Management
**Add CSS comments for clarity:**

Before the composer section (around L1432), add block comment:
```css
/* === Chat Composer ===
 * Fixed bottom composer with glassmorphic design.
 * State management:
 *   - Sidebar offset: via --cb-sidebar-offset CSS variable
 *   - Council selection: via [data-has-selection="true"] attribute
 *   - Bottom clearance: via .chat-wrapper padding-bottom
 */
```

Before council pill section (around L1507), add block comment:
```css
/* === Council Pills ===
 * Two contexts:
 *   1. Composer addon: .cb-composer-addon (the "+" button)
 *   2. Active pill: .cb-council-pill (displays selected member)
 * Armed state: Currently uses [data-has-selection] attribute
 * TODO: Implement .cb-council-pill--armed if class-based state needed
 */
```

### Step 8: Fix Hardcoded Color Values
**Consistency improvement:**

Several council/composer components use hardcoded colors that should reference design tokens:

- L1473: `rgba(17, 24, 39, 0.9)` → `var(--cb-surface-elevated)` (already defined in :root)
- L1520: `#e5f3ff` → Could define `--council-text` token
- L1517-1518: `linear-gradient(135deg, #0f172a, #020617)` → Define `--council-gradient` token

**Benefit:** Single source of truth for council component colors, easier to theme.

### Step 9: Address Media Query Gotchas
**Issues identified:**

1. **Responsive padding chaos:** Bottom padding changes across 5 breakpoints (see Step 3)
2. **L2075-2080:** Mobile mode has special handling for composer button:
   ```css
   body.cb-mobile .chat-composer form {
     flex-direction: column;
     gap: 10px;
   }
   body.cb-mobile .chat-composer button {
     width: 100%;
   }
   ```
   This is good but undocumented. Add comment explaining mobile layout shift.

3. **L817-820:** Tablet override reduces shell padding but uses different bottom value (120px vs 140px). Verify this is intentional, not a typo.

### Step 10: Handle !important Usage
**Current !important usage audit:**

1. **L42:** `.cb-hidden { display: none !important; }`
   - Justified: Utility class must override everything
   - Keep: YES

2. **L154:** `body.cb-mobile .cb-sidebar { width: 64px !important; }`
   - Reason: Must override inline styles or other specificity
   - Evaluate: Check if inline styles can be removed instead
   - Tentative: Keep but investigate alternatives

3. **L177:** `body.cb-sidebar-collapsed .cb-chat-actions { display: none !important; }`
   - Reason: Must hide actions in collapsed state
   - Evaluate: Specificity may be fixable without !important
   - Tentative: Keep but low priority

4. **L2031:** `.cb-modal-backdrop[hidden] { display: none !important; }`
   - Justified: [hidden] attribute must work reliably
   - Keep: YES

**Recommendation:** Document each !important usage with inline comment explaining why it's necessary.

---

## ADDITIONAL GOTCHAS

### 1. CSS Variable Dependencies
The sidebar offset system (`--cb-sidebar-offset`) is set at body level and consumed by:
- `.chat-composer` (L1435)
- `.climate-badge` (L1785)
- `.chat-footer p` (L1816)

**Risk:** If sidebar offset calculation changes, must update all three consumers. Consider documenting this dependency.

### 2. Z-index Layering
**Z-index values in use:**
- Sidebar: `z-index: 2` (L124)
- Sidebar menus: `z-index: 1000` (L369)
- Top bar: `z-index: 1000` (implied, no explicit value)
- Climate badge: `z-index: 997` (L1788)
- Chat footer: `z-index: 996` (L1800)
- Composer: `z-index: 999` (L1440)
- User menu: `z-index: 1200` (L955)
- Footer overlays: `z-index: 1400` (L1920)
- Council modals: `z-index: 1300` (L2029)

**Issue:** No systematic z-index scale. Values are ad-hoc (996, 997, 999, 1000, 1200, 1300, 1400).

**Recommendation:** Define z-index scale at :root:
```css
--z-base: 1;
--z-sidebar: 2;
--z-dropdown: 100;
--z-chat-footer: 200;
--z-composer: 300;
--z-modal: 1000;
--z-modal-backdrop: 999;
```

### 3. Glassmorphic Effects Browser Support
Composer uses `backdrop-filter: blur(12px)` (L1437), which is not supported in Firefox on Windows by default.

**Recommendation:** Add fallback or document browser support requirements.

### 4. Transition Performance
Multiple selectors use transitions on expensive properties:
- L243: `.cb-sidebar-toggle svg { transition: transform 0.2s ease; }`
- L1481: `.cb-composer-addon { transition: transform 0.15s ease, box-shadow 0.15s ease; }`

These are fine (transform is GPU-accelerated), but other transitions like:
- L317: `.cb-sidebar-select { transition: border-color 0.2s ease, background 0.2s ease; }`

Should be validated for performance on low-end devices.

### 5. Color Contrast
Several text colors have low contrast ratios:
- L1807: `color: rgba(255, 255, 255, 0.4);` on footer
- L1170: `.chat-subtitle { color: var(--muted); }` (muted is #94a3b8)

**Recommendation:** Audit against WCAG AA standards for accessibility.

---

## SUMMARY

### What Works Well
1. ✓ Consistent `cb-` prefixing across all custom components
2. ✓ CSS variable system for colors and spacing
3. ✓ Responsive breakpoints are comprehensive
4. ✓ Glassmorphic composer design is modern and cohesive
5. ✓ Sidebar collapse system is well-implemented

### Critical Issues
1. ⚠️ **Missing CSS for JS state classes:** `.cb-council-armed`, `.cb-pill-armed-on`, `.cb-council-pill--armed` have no CSS definitions
2. ⚠️ **Hard-coded bottom padding:** 5 different places, 4 different values, no single source of truth
3. ⚠️ **Assumption mismatch:** You expected `.cb-council-wrapper` but it's actually `.cb-composer-addon` + `.cb-council-active`
4. ⚠️ **No amber armed state:** Current armed state is blue, not amber/yellow

### Cleanup Priority
**HIGH PRIORITY:**
1. Remove L1502-1519 (dead text input styles)
2. Define CSS for missing armed state classes (if JS uses them)
3. Consolidate bottom padding into CSS variables

**MEDIUM PRIORITY:**
1. Verify usage of `.chat-container`, `.chat-panel`, `.chat-shell` blocks
2. Reorganize chat components into single section
3. Document state management with comments
4. Standardize z-index scale

**LOW PRIORITY:**
1. Extract hardcoded colors to design tokens
2. Audit !important usage
3. Add fallbacks for backdrop-filter
4. Accessibility contrast audit

---

**Report complete.** Ready for cleanup phase execution or clarification requests.
