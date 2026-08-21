#!/usr/bin/env bash
# Ship the working tree to the local stack, and mirror it into WSL.
#
# WHY THIS EXISTS
#   The deploy was a hand-assembled chain retyped from memory every time: tar,
#   docker cp to four app containers, copy the hashed CSS and JS into the
#   frontend, restart, clear cache. Every step of a chain like that is a step
#   somebody eventually leaves out, and leaving one out does not fail loudly —
#   it verifies the OLD build and reports it as green. `CLAUDE.md` lists
#   "verifying against the wrong tree or stale assets" as a trap this repo has
#   actually hit.
#
#   It also kept forgetting the thing the person watching cares about: the WSL
#   copy. `docker cp` writes into the container's WRITABLE LAYER, which
#   `docker compose down` destroys — so a stack recreate silently reverted the
#   app to whatever the image carries. The mirror at ~/bunood-theme is the
#   durable copy, and it is what makes the work followable from WSL rather than
#   only through a browser.
#
# WHAT IT DOES NOT DO
#   It does not run the suite. `npm run verify` is a separate command on
#   purpose: deploying mid-run invalidates a suite and produces phantom
#   failures — that happened, and cost a debugging session.
#
# USAGE
#   npm run deploy            # build, ship, mirror, restart only if needed
#   npm run deploy -- --no-build
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SITE="${BND_SITE:-demo.bunood.test}"
BACKEND="${BND_BACKEND:-bunood-backend-1}"
FRONTEND="${BND_FRONTEND:-bunood-frontend-1}"
APP_CONTAINERS=(bunood-backend-1 bunood-queue-long-1 bunood-queue-short-1 bunood-scheduler-1)
# Where the app lives inside the frontend image — a different tree from the
# backend's, which is why assets 404 on the frontend if only the backend is fed.
FRONTEND_ASSETS="/home/frappe/frappe-bench/assets/bunood_theme/dist"
WSL_MIRROR="${BND_WSL_MIRROR:-/home/saltedfish/bunood-theme}"

say() { printf '  %s\n' "$*"; }

# ── Build ───────────────────────────────────────────────────────────────────
if [[ "${1:-}" != "--no-build" ]]; then
	say "building"
	npm run build >/dev/null
fi

# EVERY built file, not the first one. This was `ls ... | head -1` until item
# 32, which is a bug that had simply not fired yet: the moment a second
# stylesheet existed, ASCII ordering decided which one the deploy noticed —
# `-` (0x2D) sorts BEFORE `.` (0x2E), so `bunood-web.<hash>.css` would have
# sorted first and the deploy would have copied it to the frontend, checked ITS
# hash for the restart decision, and curl-verified ITS name, while the desk
# bundle silently 404'd. Arrays, and every loop below walks all of them.
ASSETS=()
for f in bunood_theme/public/dist/css/*.css bunood_theme/public/dist/js/*.js; do
	[[ -e "$f" ]] || continue
	ASSETS+=("$f")
done
if [[ ${#ASSETS[@]} -eq 0 ]]; then
	say "no built assets — run npm run build"
	exit 1
fi
say "assets: $(for f in "${ASSETS[@]}"; do printf '%s ' "$(basename "$f")"; done)"

# The hash IS the change signal. A restart costs ~15s plus a cold boot, so it is
# only paid when the compiled output actually moved; a Python-only edit still
# needs one, which is why the caller can force it.
# BOTH hashes, not just the CSS. Checking one meant a JS-only build reported
# "no asset change - skipping restart" while shipping a new bunood.<hash>.js that
# assets.py now points at - the stack then served a filename the backend had not
# been restarted to reference. Measured on the slice-2 build.
NEED_RESTART=0
for f in "${ASSETS[@]}"; do
	sub="$(basename "$(dirname "$f")")"   # css | js
	if ! docker exec "$FRONTEND" sh -lc "test -f $FRONTEND_ASSETS/$sub/$(basename "$f")" 2>/dev/null; then
		NEED_RESTART=1
	fi
done

# ── Ship the app source ─────────────────────────────────────────────────────
# ONLY WHEN THE APP IS NOT BIND-MOUNTED. If it is, the containers already read
# the WSL mirror and this copy is worse than redundant: `docker cp` writes files
# as ROOT into the mount, and the rsync below then cannot chgrp them — so the
# mirror silently stops updating and the deploy reports success over a tree it
# is no longer maintaining. Measured on the slice-2 build.
MOUNTED=0
if docker inspect "$BACKEND" --format "{{json .Mounts}}" 2>/dev/null | grep -q "apps/bunood_theme"; then
	MOUNTED=1
fi

if [[ "$MOUNTED" == "1" ]]; then
	say "app is bind-mounted — the mirror below IS the deploy"
else
	TAR="$(mktemp -t bnd-XXXXXX.tgz)"
	trap 'rm -f "$TAR"' EXIT
	tar -czf "$TAR" bunood_theme
	for c in "${APP_CONTAINERS[@]}"; do
		docker cp "$TAR" "$c:/tmp/bnd.tgz" >/dev/null
		docker exec "$c" bash -lc 'cd /home/frappe/frappe-bench/apps/bunood_theme && tar -xzf /tmp/bnd.tgz'
		say "shipped -> $c"
	done
fi

# ── Feed the frontend its own copy ──────────────────────────────────────────
# `sites/assets` is a per-container symlink; the frontend does not see what the
# backend unpacked, so runtime app assets 404 there unless copied explicitly.
if [[ "$MOUNTED" == "1" ]]; then
	say "frontend assets are mounted too — nothing to copy"
else
	for f in "${ASSETS[@]}"; do
		sub="$(basename "$(dirname "$f")")"
		docker cp "$f" "$FRONTEND:$FRONTEND_ASSETS/$sub/" >/dev/null
	done
	say "shipped -> $FRONTEND (dist, ${#ASSETS[@]} files)"
fi

# ── Mirror into WSL ─────────────────────────────────────────────────────────
# `_reference` is excluded and that is not an oversight: it is 531MB of upstream
# Frappe/ERPNext source kept for reading, it is gitignored, and copying it across
# the /mnt/c boundary took longer than everything else here combined — the first
# attempt was killed part-way and left a mirror that looked complete at the top
# level with no app underneath it. The mirror is for following THIS repo's work,
# which is 1.2MB.
#
# `--delete-excluded` is load-bearing, not belt-and-braces. Plain `--exclude`
# also protects a path from `--delete` ON THE DESTINATION, so once 531MB of
# `_reference` had been copied there by an earlier run, adding the exclusion
# could never remove it — the deploy reported "mirrored" over a 439MB tree it
# was no longer maintaining. A mirror that silently keeps what it stopped
# tracking is not a mirror.
#
# The durable copy. Runs even when nothing else changed, because being able to
# follow the work is the point of it. Failure is reported, never fatal: a broken
# mirror must not stop a deploy that otherwise succeeded.
WIN_PATH="$(pwd -W 2>/dev/null || pwd)"
WSL_SRC="$(printf '%s' "$WIN_PATH" | sed -E 's#^([A-Za-z]):#/mnt/\l\1#; s#\\#/#g')"
if wsl.exe -- bash -lc "rsync -a --delete --delete-excluded \
		--exclude .git --exclude node_modules --exclude _reference \
		'$WSL_SRC/' '$WSL_MIRROR/'" 2>/dev/null; then
	say "mirrored -> WSL $WSL_MIRROR"
else
	say "WARNING: WSL mirror failed — the stack is updated, the WSL copy is stale"
fi

# ── Restart and clear cache ─────────────────────────────────────────────────
if [[ "$NEED_RESTART" == "1" || "${BND_FORCE_RESTART:-0}" == "1" ]]; then
	say "restarting $BACKEND (assets changed)"
	docker restart "$BACKEND" >/dev/null
	sleep 14
else
	say "no asset change — skipping restart"
fi

docker exec "$BACKEND" bash -lc "cd /home/frappe/frappe-bench && bench --site $SITE clear-cache" >/dev/null
say "cache cleared"

# Verify EVERY asset, not just the CSS. The point of this step is "the stack is
# serving the build we just made", and one file out of three answering 200 does
# not say that.
# The body goes to a REAL temp file, not /dev/null. `MSYS_NO_PATHCONV=1` is
# required for the docker/wsl calls above (HANDOVER 1: MSYS silently rewrites
# POSIX arguments, and once emptied a sed in a hand-rolled rsync), but it also
# stops Git Bash translating /dev/null to NUL — so `curl -o /dev/null` fails
# with exit 23 "Failed writing body", `set -e` kills the script mid-verify, and
# the deploy reports success by saying nothing at all. Measured while adding
# this loop.
CURL_SINK="$(mktemp -t bnd-curl-XXXXXX)"
trap 'rm -f "$CURL_SINK"' EXIT
BAD=0
for f in "${ASSETS[@]}"; do
	sub="$(basename "$(dirname "$f")")"
	name="$(basename "$f")"
	# `|| true`: a curl failure must reach the WARNING branch below, not exit
	# the script through `set -e` with nothing printed.
	CODE="$(curl -s -o "$CURL_SINK" -w '%{http_code}' "http://localhost:8080/assets/bunood_theme/dist/$sub/$name" || true)"
	if [[ "$CODE" == "200" ]]; then
		say "serving $name (200)"
	else
		say "WARNING: $name returns $CODE — the stack is NOT serving this build"
		BAD=1
	fi
done
if [[ "$BAD" == "1" ]]; then
	exit 1
fi
say "http://localhost:8080/desk/theme-settings?shell=1  ·  http://localhost:8080/login"
