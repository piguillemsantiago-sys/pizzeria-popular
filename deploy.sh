#!/usr/bin/env bash
# ============================================================
# deploy.sh — Despliega Pizzería Popular al VPS de producción.
# Sincroniza los archivos al servidor y reinicia la app.
# Sin git, sin build. Uso:  bash deploy.sh
# ============================================================
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
echo "→ Sincronizando con el VPS..."
# google-ratings.json se excluye: lo actualiza el cron semanal en el VPS;
# no hay que pisarlo con la copia local en cada deploy.
tar czf - --exclude=node_modules --exclude=.git --exclude=.env --exclude=google-ratings.json -C "$DIR" . \
  | ssh pizzeria-vps "tar xzf - -C /var/www/pizzeria-popular && pm2 restart pizzeria-popular --update-env >/dev/null && for i in \$(seq 1 15); do curl -sf -o /dev/null http://localhost:3000/ && break || sleep 1; done && echo '✓ Desplegado y en vivo'"
