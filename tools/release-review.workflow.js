/**
 * Release review — adversarial multi-agent review of everything committed
 * since the last release tag. Part 2 of the quality process adopted after
 * v0.6.2 ("there are always bugs and it's incomplete"): no tag is cut on the
 * author's own confidence.
 *
 * WHAT
 *   1. Scope   — resolve the base tag, enumerate and summarize the diff.
 *   2. Review  — four independent finders, each reading the SAME diff through
 *                a different lens (correctness, house rules, regressions,
 *                release hygiene). Independence is the point: each is blind
 *                to what the others report.
 *   3. Verify  — every finding goes to an adversarial refuter whose job is to
 *                kill it. Only findings that survive refutation are reported.
 *
 * HOW TO RUN (from a Claude Code session, before tagging)
 *   Workflow({ scriptPath: "tools/release-review.workflow.js",
 *              args: { repo: "<absolute repo path>", base: "v0.6.2" } })
 *   `base` is optional — the scope agent resolves the latest tag if omitted.
 *
 * CONTRACT
 *   A release tag requires this workflow's `confirmed` list to be empty, or
 *   every confirmed finding to be fixed (rerun) or explicitly waived in the
 *   CHANGELOG entry. See README "Versioning and releases".
 *
 * NOT A NODE MODULE
 *   This targets the Workflow runtime, which wraps the body in an async
 *   function — so it uses top-level `return` and runtime globals (agent,
 *   parallel, pipeline, phase, log, args). `node --check` rejects it by
 *   design; it is deliberately absent from CI's JavaScript-syntax step.
 */

export const meta = {
	name: "release-review",
	description: "Adversarial review of everything committed since the last release tag",
	whenToUse: "Before cutting any bunood-theme release tag (vX.Y.Z)",
	phases: [
		{ title: "Scope", detail: "resolve base tag, enumerate the diff" },
		{ title: "Review", detail: "four independent lenses over the same diff" },
		{ title: "Verify", detail: "one adversarial refuter per finding" },
	],
}

const repo = (args && args.repo) || "C:/Users/saltedfish/Desktop/bunood-theme"
const baseArg = (args && args.base) || ""

const SCOPE_SCHEMA = {
	type: "object",
	required: ["base", "files", "summary"],
	properties: {
		base: { type: "string", description: "the resolved base ref (a tag)" },
		files: { type: "array", items: { type: "string" } },
		summary: { type: "string", description: "3-6 sentences: what this diff does" },
	},
}

const FINDINGS_SCHEMA = {
	type: "object",
	required: ["findings"],
	properties: {
		findings: {
			type: "array",
			items: {
				type: "object",
				required: ["title", "file", "severity", "detail"],
				properties: {
					title: { type: "string" },
					file: { type: "string" },
					line: { type: "number" },
					severity: { enum: ["critical", "major", "minor"] },
					detail: {
						type: "string",
						description: "concrete failure scenario: inputs/state -> wrong outcome",
					},
				},
			},
		},
	},
}

const VERDICT_SCHEMA = {
	type: "object",
	required: ["refuted", "reason"],
	properties: {
		refuted: { type: "boolean" },
		reason: { type: "string" },
	},
}

// Shared preamble: every agent works from the actual diff, not a description.
const ground = (base) => `You are reviewing the Frappe/ERPNext v16 theme app "bunood-theme" at ${repo} (a git repo on a Windows host; use git -C "${repo}" ...).
The change under review is everything since the last release tag:
  git -C "${repo}" log --oneline ${base}..HEAD
  git -C "${repo}" diff ${base}..HEAD
Read README.md and ARCHITECTURE.md first — they define the house rules this codebase lives by. Ignore bunood_theme/public/dist/** (generated) except to check it matches its sources.`

const DIMENSIONS = [
	{
		key: "correctness",
		brief: `Find CORRECTNESS defects introduced by this diff: logic errors, unhandled error paths, race conditions, async ordering bugs, wrong selectors, off-by-one or boundary mistakes, state that leaks between operations. For test code: assertions that can pass while the behaviour is broken, cleanup that does not run on failure, hidden ordering dependencies between tests.`,
	},
	{
		key: "house-rules",
		brief: `Find violations of the documented house rules introduced by this diff: Frappe variables set at bare :root; @layer used against Frappe; any path containing ".bundle."; physical CSS properties (must be logical — the build guards compiled CSS, but check anything the guard cannot see); visual changes applied by JS that should arrive as CSS; undocumented !important; secrets, session cookies, or tokens committed or logged (.playwright-mcp logs echo sid cookies and must never be committed).`,
	},
	{
		key: "regressions",
		brief: `Find ways this diff can BREAK previously shipped behaviour: the boot contract (boot.py -> data-bnd-* attributes -> CSS matrix), the five desk layouts, the sidebar preset canon in presets.py, the Desktop-page stand-down guard, live preview, the double-save fix in brand.py, and the deploy pipeline's assumptions (content-hashed filenames, assets.py as the single source of asset paths, desk HTML cached in redis so stale hashes persist until bench clear-cache).`,
	},
	{
		key: "release-hygiene",
		brief: `Find RELEASE-HYGIENE gaps in this diff: app_version in hooks.py vs __version__ in bunood_theme/__init__.py vs the intended tag; CHANGELOG.md coverage of what actually changed; the documentation standard (every new file has a header, every function a docstring, comments explain why); CI workflow correctness (.github/workflows/ci.yaml — would its gates actually catch what they claim to catch, do they run on the right triggers); package.json/package-lock.json consistency.`,
	},
]

phase("Scope")
const scope = await agent(
	`${ground(baseArg || "$(git -C \"" + repo + "\" describe --tags --abbrev=0)")}
${baseArg ? `The base ref is ${baseArg}.` : `Resolve the base ref yourself: git -C "${repo}" describe --tags --abbrev=0`}
Return: the resolved base ref, the list of changed files (git diff --name-only <base>..HEAD), and a 3-6 sentence summary of what the change does.`,
	{ label: "scope", schema: SCOPE_SCHEMA }
)

if (!scope) throw new Error("scope agent failed")
const base = scope.base
if (!scope.files.length) return { base, summary: "empty diff — nothing to review", confirmed: [] }
log(`reviewing ${scope.files.length} files since ${base}`)

// Global verification budget shared across dimensions. Findings past the cap
// are reported unverified rather than silently dropped.
const VERIFY_CAP = 10
let verifySpent = 0
const unverified = []

const results = await pipeline(
	DIMENSIONS,
	(d) =>
		agent(
			`${ground(base)}
YOUR LENS — ${d.key}: ${d.brief}
Report ONLY defects introduced or exposed by this diff — not pre-existing issues, not style preferences. Every finding needs a concrete failure scenario (what inputs or state lead to what wrong outcome). If the diff is clean under this lens, return an empty findings list; do not manufacture findings.`,
			{ label: `find:${d.key}`, phase: "Review", schema: FINDINGS_SCHEMA }
		),
	(review, d) => {
		const found = (review && review.findings) || []
		if (!found.length) return []
		return parallel(
			found.map((f) => () => {
				if (verifySpent >= VERIFY_CAP) {
					unverified.push({ ...f, lens: d.key })
					return Promise.resolve(null)
				}
				verifySpent++
				return agent(
					`${ground(base)}
A reviewer claims this defect was introduced since ${base}:
${JSON.stringify(f, null, 2)}
Your job is to REFUTE it. Read the actual code, trace the claimed failure scenario, and check whether it can really occur in this codebase as it exists at HEAD. A finding survives only if the failure is concretely reachable. Default to refuted=true if the scenario is hypothetical, already guarded against, or based on a misreading.`,
					{ label: `verify:${f.title.slice(0, 40)}`, phase: "Verify", schema: VERDICT_SCHEMA }
				).then((v) => (v && !v.refuted ? { ...f, lens: d.key, upheld: v.reason } : null))
			})
		)
	}
)

const rank = { critical: 0, major: 1, minor: 2 }
const confirmed = results
	.filter(Boolean)
	.flat()
	.filter(Boolean)
	.sort((a, b) => rank[a.severity] - rank[b.severity])

if (unverified.length) log(`${unverified.length} findings exceeded the verify budget — reported unverified`)
log(`${confirmed.length} confirmed findings`)
return { base, summary: scope.summary, confirmed, unverified }
