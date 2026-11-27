#!/bin/bash
# One deployment, two apps (vercel.json at the repo root runs this):
#   /erp/...   the staff ERP        (apps/erp, built with base /erp/)
#   /site/...  the customer website (apps/customer, built with base /site/; a shop's site is /site/<slug>)
# Output: dist-vercel/erp and dist-vercel/site. Locally the apps still run at / on their own ports.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=dist-vercel
rm -rf "$OUT"
APP_BASE=/erp/ npm run build -w @eurowerken/erp
APP_BASE=/site/ npm run build -w @eurowerken/customer
mkdir -p "$OUT"
cp -R apps/erp/dist "$OUT/erp"
cp -R apps/customer/dist "$OUT/site"
echo "Built $OUT/erp and $OUT/site"
