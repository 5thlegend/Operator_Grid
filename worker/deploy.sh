#!/usr/bin/env bash
# Deploys the NRO SPA worker via Cloudflare API.
# Requires .wrangler/deploy-token (CF API token, Workers Scripts:Edit).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
cd "$ROOT"

if [ ! -f ".wrangler/deploy-token" ]; then
  echo "ERROR: .wrangler/deploy-token missing. Put your CF API token there." >&2
  exit 1
fi

CF_TOKEN=$(cat .wrangler/deploy-token | tr -d '\n\r ')
ACCOUNT_ID=${CF_ACCOUNT_ID:-869002bb49acbb6b6e30d499b587c929}
SCRIPT_NAME=${CF_SCRIPT_NAME:-nextrealm-operators}

echo "→ Bundling worker..."
node worker/bundle.js

echo "→ Uploading to Cloudflare ($SCRIPT_NAME)..."
RESULT=$(curl -sS -X PUT "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/scripts/$SCRIPT_NAME" \
  -H "Authorization: Bearer $CF_TOKEN" \
  -F "metadata=@.wrangler/bundle-metadata.json;type=application/json" \
  -F "bundle.js=@.wrangler/bundle.js;type=application/javascript+module")

if echo "$RESULT" | python -c "import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get('success') else 1)"; then
  echo "→ Deployed. https://$SCRIPT_NAME.dankpenta.workers.dev"
else
  echo "→ DEPLOY FAILED:"
  echo "$RESULT"
  exit 1
fi
