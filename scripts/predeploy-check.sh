#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

CHAT_HTML="public/chat.html"
[[ ! -f "$CHAT_HTML" ]] && { echo "ERROR: $CHAT_HTML not found"; exit 1; }

# Invariant 1: Exactly one climate badge (text match, not class)
BADGE_COUNT=$(grep -c 'We donate 1% of revenue to remove CO₂' "$CHAT_HTML" || true)
[[ "$BADGE_COUNT" -ne 1 ]] && { echo "FAIL: climate-badge count=$BADGE_COUNT (expected 1)"; exit 1; }

# Invariant 2: No hardcoded Debug sidebar
DEBUG_COUNT=$(grep -c 'sidebar-section-header">Debug' "$CHAT_HTML" || true)
[[ "$DEBUG_COUNT" -ne 0 ]] && { echo "FAIL: hardcoded Debug sidebar found"; exit 1; }

# Invariant 3: Logo references existing file (SVG)
LOGO_SRC=$(grep -oP 'src="[^"]*coolbits-logo\.svg[^"]*"' "$CHAT_HTML" | grep -oP 'src="\K[^"]*' | head -1)
LOGO_PATH="public/${LOGO_SRC#./}"
[[ ! -f "$LOGO_PATH" ]] && { echo "FAIL: logo $LOGO_SRC -> $LOGO_PATH not found"; exit 1; }

# Invariant 4: Burger menu exists
grep -q 'cb-mobile-menu' "$CHAT_HTML" || { echo "FAIL: burger menu missing"; exit 1; }

# UI-specific guardrails (layout, branding, composer, council)
./scripts/ui-guardrail.sh || exit 1

echo "✓ All guardrails passed"
exit 0
