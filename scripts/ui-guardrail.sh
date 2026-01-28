#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

HTML="public/chat.html"
CSS="public/assets/style.css"

die() { echo "FAIL: $1"; exit 1; }

# File existence
test -f "$HTML" || die 'missing public/chat.html'
test -f "$CSS" || die 'missing public/assets/style.css'

# Versioned assets (cache-busting ?v=)
rg -q 'assets/style\.css\?v=' "$HTML" || die 'missing versioned style.css?v='
if rg -q 'assets/chat\.js\?v=' "$HTML"; then
  : # ok
else
  rg -q '__UI_BUILD_SHA__' "$HTML" || die 'missing __UI_BUILD_SHA__ in loader'
  rg -q 'chat\.beta\.js' "$HTML" || die 'missing chat.beta.js in loader'
  rg -q 'chat\.js' "$HTML" || die 'missing chat.js in loader'
fi

# Branding: SVG logo (not favicon.ico)
rg -q 'assets/coolbits-logo\.svg' "$HTML" || die 'missing coolbits-logo.svg reference'

# Composer hooks (model selector must be in composer area)
rg -q 'cb-composer' "$HTML" || die 'missing cb-composer hook'
rg -q 'cb-model-selector' "$HTML" || die 'missing cb-model-selector'

# Council hooks (tabs CSS ready, panel structure exists)
rg -q 'cb-council-tab' "$CSS" || die 'missing cb-council-tab CSS'
rg -q 'cb-council-popover' "$HTML" || die 'missing cb-council-popover'
rg -q 'cb-council-body' "$HTML" || die 'missing cb-council-body'

# Padding/safe-area (desktop ≥130px, mobile ≥140px bottom padding for composer clearance)
rg -q 'padding-bottom:\s*(130|1[4-9][0-9]|[2-9][0-9]{2,})px' "$HTML" || die 'missing safe padding-bottom ≥130px'

# JS selector validation (model selector ID must resolve)
rg -q "getElementById\(['\"]cb-model-selector['\"]" public/assets/chat.js || die 'missing getElementById cb-model-selector in chat.js'

# Climate badge: exactly 1 instance (footer canonical, no fixed duplicate)
BADGE_COUNT=$(rg -c "We donate 1% of revenue to remove CO₂" "$HTML" || echo 0)
[[ "$BADGE_COUNT" -eq 1 ]] || die "climate badge count=$BADGE_COUNT (expected 1)"

echo "✓ All UI guardrails passed"
exit 0
