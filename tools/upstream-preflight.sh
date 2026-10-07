#!/usr/bin/env bash
# Read the candidate collector and pins BEFORE copying anything into the bench.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
{
  printf 'import frappe, json\nfrappe.init(site=%s, sites_path=".")\nfrappe.connect()\n' "\"${BND_SITE:-demo.bunood.test}\""
  cat "$ROOT/bunood_theme/upstream.py"
  printf '\npinned = json.loads(r\x27\x27\x27'
  cat "$ROOT/bunood_theme/data/upstream-pins.json"
  printf '\x27\x27\x27)\n'
  cat <<'PY'
changes = diff(pinned)
if changes:
    for key, before, after in changes:
        print(f"UPSTREAM DRIFT: {key}: {before} -> {after}")
    raise SystemExit("Deployment rejected. Integrate upstream changes before re-pinning.")
print("upstream preflight: compatible with reviewed pins")
PY
} | docker exec -i "${BND_BACKEND:-bunood-backend-1}" bash -lc \
  'cd /home/frappe/frappe-bench/sites && ../env/bin/python -'
