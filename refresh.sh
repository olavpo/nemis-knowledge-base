#!/usr/bin/env bash
# Re-copy the Google Site and, optionally, push it to a web server.
#
# Use this while the site is still edited in Google Sites: editors carry on
# working there, and this script refreshes the self-hosted copy.
#
#   ./refresh.sh                          # refresh the local copy only
#   DEPLOY_TARGET=user@host:/var/www/nemis ./refresh.sh
#
# The live copy is only replaced after a successful run, so a failed or
# partial download cannot take the site down.

set -euo pipefail

SITE_URL="${SITE_URL:-https://sites.google.com/view/nemisknowledgebase}"
OUT="${OUT:-site}"
MIN_PAGES="${MIN_PAGES:-2}"
DEPLOY_TARGET="${DEPLOY_TARGET:-}"

here="$(cd "$(dirname "$0")" && pwd)"
staging="$(mktemp -d)"
trap 'rm -rf "$staging"' EXIT

python3 "$here/mirror_google_site.py" "$SITE_URL" --out "$staging/site"

pages="$(find "$staging/site" -name index.html | wc -l | tr -d ' ')"
if [ "$pages" -lt "$MIN_PAGES" ]; then
  echo "Only $pages page(s) copied; expected at least $MIN_PAGES. Keeping the old copy." >&2
  exit 1
fi

rm -rf "$here/${OUT:?}"
mv "$staging/site" "$here/$OUT"
echo "Local copy refreshed: $here/$OUT ($pages pages)"

if [ -n "$DEPLOY_TARGET" ]; then
  rsync -az --delete "$here/$OUT/" "$DEPLOY_TARGET/"
  echo "Deployed to $DEPLOY_TARGET"
fi
