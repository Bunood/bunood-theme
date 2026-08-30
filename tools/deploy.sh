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
STACK="${BND_STACK:-bunood}"
RAW_BACKEND="${BND_BACKEND:-}"
RAW_FRONTEND="${BND_FRONTEND:-}"
# Where the app lives inside the frontend image — a different tree from the
# backend's, which is why assets 404 on the frontend if only the backend is fed.
FRONTEND_ASSETS="/home/frappe/frappe-bench/assets/bunood_theme/dist"
WSL_MIRROR="${BND_WSL_MIRROR:-/home/saltedfish/bunood-theme}"
# The same knob `tools/session.mjs` and `tests/smoke.mjs` read, spelled the same
# way, so one export moves the whole toolchain. It exists because `localhost` is
# not a synonym for `127.0.0.1` here: Windows resolves it to `::1` FIRST, and on
# 2026-08-24 Docker's IPv6 publish stopped answering while the IPv4 one served
# normally — so every verify curl returned 000 and the deploy reported a build
# the stack was in fact serving as undelivered. `tools/fingerprint.mjs` still
# hardcodes its own copy.
URL_BASE="${BND_URL:-http://localhost:8080}"

say() { printf '  %s\n' "$*"; }

container_exists() { docker inspect "$1" >/dev/null 2>&1; }

resolve_container() {
	local role="$1"
	local configured="$2"
	local fallback="$3"
	local match_count=0
	local matched_name=""

	if container_exists "$configured"; then
		echo "$configured"
		return 0
	fi

	if [[ -n "$fallback" ]] && container_exists "$fallback"; then
		say "warning: requested ${role} container '$configured' was not found; using '$fallback'"
		echo "$fallback"
		return 0
	fi

	while IFS= read -r container_name; do
		[[ "$container_name" == *-${role}-* ]] || continue
		match_count=$((match_count + 1))
		matched_name="$container_name"
	done < <(docker ps --format '{{.Names}}')

	if [[ "$match_count" -eq 1 ]]; then
		say "warning: requested ${role} container '$configured' was not found; auto-selecting '$matched_name'"
		echo "$matched_name"
		return 0
	fi

	if [[ "$match_count" -gt 1 ]]; then
		say "ERROR: expected ${role} container '$configured' was not found and multiple candidates exist."
	else
		say "ERROR: expected ${role} container '$configured' was not found."
	fi
	say "Set BND_${role^^} to one of these running ${role} containers:"
	while IFS= read -r container_name; do
		[[ "$container_name" == *-${role}-* ]] || continue
		say "  - $container_name"
	done < <(docker ps --format '{{.Names}}')
	exit 1
}

BACKEND="$(resolve_container "backend" "${RAW_BACKEND:-${STACK}-backend-1}" "${STACK}-backend-1")"
FRONTEND="$(resolve_container "frontend" "${RAW_FRONTEND:-${STACK}-frontend-1}" "${STACK}-frontend-1")"
BASE_PREFIX="${BACKEND%-backend-1}"
if [[ "$BASE_PREFIX" == "$BACKEND" ]]; then
	BASE_PREFIX="$STACK"
fi
APP_CONTAINERS=(
	"$BACKEND"
	"${BASE_PREFIX}-queue-long-1"
	"${BASE_PREFIX}-queue-short-1"
	"${BASE_PREFIX}-scheduler-1"
)
for c in "${APP_CONTAINERS[@]}"; do
	container_exists "$c" || {
		say "ERROR: required container '$c' not found. check docker ps --format '{{.Names}}'"
		exit 1
	}
done

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
#
# AND WHEN THE APP IS BIND-MOUNTED, "durable copy" UNDERSTATES IT: the mirror is
# then the ONLY delivery path, which the `say` above already tells you. That is
# why this block has a fallback at all. On 2026-08-24 `wsl.exe -- <command>` began
# failing with `Wsl/Service/0x8007274c` on every distro including
# `docker-desktop`, while the containers stayed up and served — so the rsync
# silently stopped delivering and the deploy reported "the stack is NOT serving
# this build" three lines later, which reads like an asset problem and is not one.
#
# THE `\\wsl$` SHARE SURVIVES WHAT `wsl.exe` EXEC DOES NOT. It is a different
# channel — a 9p file server, not the console relay — and it was verified writable
# through to the container in exactly the state that killed the rsync. So the
# fallback is not a weaker copy of the same thing; it is the reason a wedged WSL
# console no longer stops a deploy.
#
# `robocopy /MIR` matches `rsync -a --delete --delete-excluded`: `/XD` excludes
# a directory from BOTH the copy and the purge, which is the `--delete-excluded`
# half that took a 439MB mirror to learn. Its exit code is a BITMASK where 1
# means "files were copied" — success — so anything under 8 is fine and the
# usual `if cmd; then` would report every real deploy as a failure.
#
# THREE THINGS ABOUT CALLING IT FROM GIT BASH, each of which cost a run:
#
#   1. `MSYS_NO_PATHCONV=1` IS MANDATORY. Without it MSYS rewrites robocopy's
#      own switches as paths — `/MIR` arrives as `M:/` — and the first attempt
#      died on `Invalid Parameter #3 : "L:/"`. This is the same variable
#      `CLAUDE.md` warns about for `curl -o /dev/null`; it is safe here because
#      the only `/dev/null` on this line is a SHELL REDIRECT, which bash handles
#      itself and never passes to the child as an argument.
#   2. FORWARD SLASHES, and `//wsl.localhost/<distro>/...` rather than the
#      `\\wsl$\` spelling. Windows accepts `/` as a separator in UNC paths, and
#      the backslash form needs `\\\\wsl\$\\` inside double quotes — which was
#      got wrong twice in a row here, once producing the literal directory
#      `\wsl$${DISTRO}` in the repo root with an 11MB copy of the tree inside it
#      that `git status` did not even report.
#   3. THE DESTINATION IS CHECKED BEFORE `/MIR` RUNS, and that guard is the
#      reason (2) was survivable rather than expensive. `/MIR` DELETES whatever
#      it finds in the destination that is not in the source, so a mistyped
#      share must fail closed, not create it and mirror into it.
WIN_PATH="$(pwd -W 2>/dev/null || pwd)"
WSL_SRC="$(printf '%s' "$WIN_PATH" | sed -E 's#^([A-Za-z]):#/mnt/\l\1#; s#\\#/#g')"
if wsl.exe -- bash -lc "rsync -a --delete --delete-excluded \
		--exclude .git --exclude node_modules --exclude _reference \
		'$WSL_SRC/' '$WSL_MIRROR/'" 2>/dev/null; then
	say "mirrored -> WSL $WSL_MIRROR"
else
	# `wsl -l -q` is a different call than `wsl -- <command>` and kept working
	# through the outage that motivated this; the first line is the default
	# distro. Derived rather than hardcoded, and overridable, because the
	# mirror path already is.
	DISTRO="${BND_WSL_DISTRO:-$(wsl.exe -l -q 2>/dev/null | tr -d '\000\r' | head -1)}"
	SHARE=""
	[[ -n "$DISTRO" ]] && SHARE="//wsl.localhost/${DISTRO}${WSL_MIRROR}"
	# RC starts at the "there was nothing to try" failure and is only lowered by
	# an actual run. `|| RC=$?` leaves it at 0 when robocopy exits 0, so there is
	# no sentinel to map back — an earlier draft used 8 as that sentinel and
	# would have reported a genuine robocopy 8 (a real copy error) as success.
	RC=8
	if [[ -n "$SHARE" && -d "$SHARE" ]]; then
		RC=0
		MSYS_NO_PATHCONV=1 robocopy "$WIN_PATH" "$SHARE" \
			/MIR /NFL /NDL /NJH /NJS /NP /R:1 /W:1 \
			/XD .git node_modules _reference >/dev/null 2>&1 || RC=$?
	fi
	if (( RC < 8 )); then
		say "mirrored -> $SHARE (wsl.exe exec is down; used the share)"
	else
		say "WARNING: WSL mirror failed — the stack is updated, the WSL copy is stale"
		say "         and if the app is bind-mounted, THIS BUILD WAS NOT DELIVERED"
	fi
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
	CODE="$(curl -s -o "$CURL_SINK" -w '%{http_code}' "$URL_BASE/assets/bunood_theme/dist/$sub/$name" || true)"
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
say "$URL_BASE/desk/theme-settings?shell=1  ·  $URL_BASE/login"
