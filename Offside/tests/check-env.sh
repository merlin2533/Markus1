#!/usr/bin/env bash
# =============================================================
# Offside · Umgebungsprüfung für die End-to-End-Tests
# Prüft Node + Playwright + Chromium. Nicht-blockierend (exit 0).
#
# Optional als SessionStart-Hook nutzbar – dazu in
# .claude/settings.json eintragen (vom Nutzer freizugeben):
#   { "hooks": { "SessionStart": [ { "hooks": [
#       { "type": "command", "command": "bash Offside/tests/check-env.sh" }
#   ] } ] } }
# =============================================================
set -u
echo "── Offside Umgebungsprüfung ─────────────────────────────"

if command -v node >/dev/null 2>&1; then
  echo "✓ node $(node --version)"
else
  echo "✗ node fehlt – Tests können nicht laufen."
fi

CHROMIUM="${PW_CHROMIUM:-/opt/pw-browsers/chromium}"
if [ -e "$CHROMIUM" ]; then
  echo "✓ Chromium: $CHROMIUM"
else
  echo "• Chromium nicht unter $CHROMIUM – ggf. PW_CHROMIUM setzen oder 'npm i -D playwright'."
fi

if node -e "require.resolve('playwright')" >/dev/null 2>&1 \
   || [ -e /opt/node22/lib/node_modules/playwright ]; then
  echo "✓ Playwright verfügbar"
else
  echo "• Playwright nicht gefunden – 'cd Offside/tests && npm install' für lokale Tests."
fi

echo "Tests:  node Offside/tests/smoke.test.mjs"
echo "─────────────────────────────────────────────────────────"
exit 0
