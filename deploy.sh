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
  | ssh pizzeria-vps "set -e
    tar xzf - -C /var/www/pizzeria-popular
    cd /var/www/pizzeria-popular
    npm install --omit=dev --no-audit --no-fund --silent
    pm2 restart pizzeria-popular --update-env >/dev/null
    ok=0; for i in \$(seq 1 20); do sleep 1; if curl -sf -o /dev/null http://localhost:3000/; then ok=1; break; fi; done
    [ \$ok = 1 ] && echo '✓ Desplegado y en vivo' || { echo '⚠ La app no responde — revisar: ssh pizzeria-vps pm2 logs pizzeria-popular'; exit 1; }"
