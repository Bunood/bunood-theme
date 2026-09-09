/**
 * How this repo's tooling reaches the docker daemon.
 *
 * WHY THIS EXISTS
 *   Eight call sites across the suite and tools do
 *   `execFileSync("docker", ["exec", "-i", BACKEND, ...])`. The binary name was
 *   the one part of that call nobody could override, while everything around it
 *   already is: BND_URL, BND_SITE and BND_BACKEND. On a machine where the
 *   daemon is not reachable as a bare `docker` on PATH, every one of those
 *   eight dies with `spawnSync docker ENOENT` before running a single check —
 *   and a suite that cannot start reads exactly like a suite that has nothing
 *   to say.
 *
 *   That is not hypothetical. On a Windows host with no Docker Desktop, the
 *   daemon runs natively inside WSL and Windows has no `docker` at all. A
 *   `docker.cmd` shim does not rescue it either: `execFileSync` does not search
 *   PATHEXT, so Node never finds a `.cmd`. The binary has to be nameable.
 *
 * USAGE
 *   BND_DOCKER accepts a whole command, not just a path, because the useful
 *   answers are often two words:
 *
 *     BND_DOCKER="wsl docker"          # Windows host, daemon inside WSL
 *     BND_DOCKER="podman"              # drop-in replacement
 *     BND_DOCKER="/usr/local/bin/docker"
 *
 *   Unset, it is exactly `docker` — so CI and every existing machine behave
 *   identically to before this file existed.
 */

const PARTS = (process.env.BND_DOCKER || "docker").split(/\s+/).filter(Boolean);

/** The executable to spawn. */
export const DOCKER_BIN = PARTS[0];

/**
 * Argv for a docker invocation, carrying any prefix words from BND_DOCKER.
 *
 * Callers pass what they would have passed before:
 *   execFileSync(DOCKER_BIN, dockerArgv("exec", "-i", BACKEND, ...), opts)
 */
export const dockerArgv = (...rest) => [...PARTS.slice(1), ...rest];
