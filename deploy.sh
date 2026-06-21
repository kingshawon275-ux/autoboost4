#!/bin/bash
# One-command VPS deploy. Run from the app folder:  bash deploy.sh
# Pulls latest code, does a clean build, restarts cleanly, shows it's live.
set -e

echo "==> Pulling latest code…"
git checkout -- package.json 2>/dev/null || true
git pull origin main

echo "==> Installing deps…"
npm install

echo "==> Syncing database schema…"
npx prisma db push

echo "==> Clean build (this takes ~1-3 min)…"
rm -rf .next
npm run build

echo "==> Restarting app (fresh process)…"
pm2 delete autoboost4 2>/dev/null || true
pm2 start npm --name autoboost4 -- run start:server

sleep 3
echo "==> Done. Recent log:"
pm2 logs autoboost4 --lines 8 --nostream

echo ""
echo "✅ Deployed. Hard-refresh the site with Ctrl+Shift+R."
