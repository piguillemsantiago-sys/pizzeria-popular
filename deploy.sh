#!/usr/bin/env bash
# ============================================================
# deploy.sh — Despliega Pizzería Popular al VPS de producción.
# Sincroniza los archivos al servidor y reinicia la app.
# Sin git, sin build. Uso:  bash deploy.sh
# ============================================================
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
echo "→ Sincronizando con el VPS..."
tar czf - --exclude=node_modules --exclude=.git --exclude=.env -C "$DIR" . \
  | ssh pizzeria-vps "tar xzf - -C /var/www/pizzeria-popular && pm2 restart pizzeria-popular --update-env >/dev/null && echo '✓ Desplegado y en vivo'"
