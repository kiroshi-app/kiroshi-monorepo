import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"

import {
	CHANGED_UNIT_TESTS,
	FAST_STEP_NAMES,
	fastSteps,
	GATE,
	GROUP_ORDER,
	type Group,
	offPullRequestNote,
	SIMULATOR_LOOKUP,
	type Step,
	skipReason,
	spawnedCommand,
} from "./ci"
import { decideJobs } from "./ci-changes"

type WorkflowStep = {
	name?: string
	id?: string
	uses?: string
	run?: string
	if?: string
	"timeout-minutes"?: number
	with?: Record<string, unknown>
}

type Workflow = {
	on: Record<string, unknown>
	concurrency: { group: string; "cancel-in-progress": string }
	jobs: Record<
		string,
		{
			if?: string
			env?: Record<string, string>
			needs?: string | string[]
			"timeout-minutes"?: number
			steps?: WorkflowStep[]
		}
	>
}

const workflow = Bun.YAML.parse(
	readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8"),
) as Workflow

const releaseWorkflow = Bun.YAML.parse(
	readFileSync(
		new URL("../.github/workflows/release.yml", import.meta.url),
		"utf8",
	),
) as Workflow

const SETUP_STEPS = new Set([
	"Install dependencies",
	"Drop the unused third-party apt sources",
	"Install Tauri system dependencies",
	"Install Playwright browser",
	"Select the Xcode pinned in .xcode-version",
	"Install XcodeGen",
	"Boot the simulator while the app builds",
	"Read the changed test files against the base the merge ref was built on",
])

const UNGATED_JOBS = new Set(["changes", "verify"])

const LOCAL_ONLY_GROUPS: Group[] = ["rust-check"]

const CI_JOBS = GROUP_ORDER.filter(
	(group) => !LOCAL_ONLY_GROUPS.includes(group),
)

const LINT_EVENTS =
	"github.event_name != 'push' || startsWith(github.ref, 'refs/tags/v')"

const OFF_PULL_REQUEST_JOBS: Group[] = ["website", "rust", "storybook", "ios"]

const EVERY_PATH_TOUCHED = {
	rust: true,
	vitest: true,
	website: true,
	storybook: true,
	ios: true,
}

const NO_PATH_TOUCHED = {
	rust: false,
	vitest: false,
	website: false,
	storybook: false,
	ios: false,
}

const runStepsOf = (job: string) =>
	(workflow.jobs[job]?.steps ?? []).filter((step) => step.run !== undefined)

const stepNamed = (job: string, name: string) =>
	runStepsOf(job).find((step) => step.name === name)

const verifyCondition = (job: string) =>
	(workflow.jobs.verify?.steps ?? []).find((step) =>
		step.if?.startsWith(`needs.${job}.result`),
	)?.if

type ExpressionScope = Record<string, unknown>

type GitHubContext = ExpressionScope & { event_name: string; ref: string }

type JobResults = Record<string, string>

const lookUp = (scope: ExpressionScope, path: string) =>
	path
		.split(".")
		.reduce<unknown>(
			(value, key) => (value as ExpressionScope | undefined)?.[key],
			scope,
		)

const evaluate = (expression: string, scope: ExpressionScope): unknown =>
	new Function(
		`return (${expression
			.replace(/\b(?:github|needs)(?:\.[\w-]+)+/g, (path) =>
				JSON.stringify(lookUp(scope, path) ?? null),
			)
			.replace("always()", "true")
			.replace(
				/startsWith\(/g,
				"((value, prefix) => String(value).startsWith(prefix))(",
			)
			.replace(/'([^']*)'/g, '"$1"')
			.replace(/([!=])=/g, "$1==")})`,
	)()

const interpolate = (template: string, scope: ExpressionScope) =>
	template.replace(/\$\{\{(.*?)\}\}/g, (_, expression: string) =>
		String(evaluate(expression, scope)),
	)

type CiEvent = Parameters<typeof decideJobs>[0]["event"]

const ciEventOf = (github: GitHubContext) =>
	interpolate(workflow.jobs.changes?.env?.CI_EVENT ?? "", { github }) as CiEvent

const outputsOn = (github: GitHubContext) =>
	Object.fromEntries(
		Object.entries(
			decideJobs({ event: ciEventOf(github), paths: ["bun.lock"] }),
		).map(([job, runs]) => [job, String(runs)]),
	)

const scopeOf = (github: GitHubContext, results: JobResults = {}) => ({
	github,
	needs: {
		...Object.fromEntries(
			Object.entries(results).map(([job, result]) => [job, { result }]),
		),
		changes: { result: results.changes, outputs: outputsOn(github) },
	},
})

const jobsRunningOn = (github: GitHubContext) =>
	Object.keys(workflow.jobs)
		.filter((job) =>
			evaluate(workflow.jobs[job]?.if ?? "true", scopeOf(github)),
		)
		.sort()

const resultsByRule = (github: GitHubContext): JobResults => {
	const running = jobsRunningOn(github)
	return Object.fromEntries(
		Object.keys(workflow.jobs).map((job) => [
			job,
			running.includes(job) ? "success" : "skipped",
		]),
	)
}

const failingVerifySteps = (github: GitHubContext, results: JobResults) =>
	(workflow.jobs.verify?.steps ?? []).filter((step) =>
		evaluate(step.if ?? "true", scopeOf(github, results)),
	)

const A_PUSH_TO_MAIN: GitHubContext = {
	event_name: "push",
	ref: "refs/heads/main",
}

const A_RELEASE_TAG: GitHubContext = {
	event_name: "push",
	ref: "refs/tags/v1.2.0",
}

const A_PULL_REQUEST: GitHubContext = {
	event_name: "pull_request",
	ref: "refs/pull/7/merge",
}

const queueCommit = (pullRequest: number): GitHubContext => ({
	event_name: "merge_group",
	ref: `refs/heads/gh-readonly-queue/main/pr-${pullRequest}-0123abc`,
	run_id: `30${pullRequest}`,
	event: { merge_group: { base_sha: "queue-base" } },
})

const A_QUEUE_COMMIT = queueCommit(7)

const PULL_REQUEST_JOB_SET = ["changes", "lint", "verify", "vitest"]

const MERGE_GROUP_JOB_SET = [
	"changes",
	"lint",
	"rust",
	"storybook",
	"verify",
	"vitest",
	"website",
]

describe("the gate", () => {
	it("runs the pull_request groups, then the post-merge groups", () => {
		expect(GROUP_ORDER).toEqual([
			"lint",
			"rust-check",
			"vitest",
			"website",
			"rust",
			"storybook",
			"ios",
		])
		expect(Object.keys(GATE).sort()).toEqual([...GROUP_ORDER].sort())
	})

	it("names every step once within its group, a shared name running the same step", () => {
		for (const group of GROUP_ORDER) {
			const names = GATE[group].map((step) => step.name)
			expect(new Set(names).size).toBe(names.length)
		}
		const firstNamed = new Map<string, Step>()
		for (const step of GROUP_ORDER.flatMap((group) => GATE[group])) {
			expect(firstNamed.get(step.name) ?? step).toEqual(step)
			firstNamed.set(step.name, step)
		}
	})

	it("runs the full cargo test in rust, the bindings test only in rust-check", () => {
		const commands = (group: "rust" | "rust-check") =>
			GATE[group].map((step) => step.command)

		expect(commands("rust")).toContain(
			"cargo test --manifest-path src-tauri/Cargo.toml --features fake-claude",
		)
		expect(commands("rust-check")).toContain(
			"cargo test --manifest-path src-tauri/Cargo.toml --features fake-claude --test bindings",
		)
		expect(
			commands("rust-check").filter((command) =>
				command.startsWith("cargo test"),
			),
		).toHaveLength(1)
		for (const group of ["rust", "rust-check"] as const) {
			expect(commands(group).at(-1)).toBe(
				"git diff --exit-code apps/app/src/lib/bindings.ts",
			)
		}
	})

	it("builds the website with the command the Render deploy runs", () => {
		expect(GATE.website.map((step) => step.command)).toEqual([
			"bun run build:website",
		])
	})

	it("plays the stories in the storybook group only", () => {
		const playing = GROUP_ORDER.filter((group) =>
			GATE[group].some((step) => step.command.includes("baseline storybook")),
		)

		expect(playing).toEqual(["storybook"])
	})

	it("marks heavy exactly the clippy, cargo test, sidecar build, storybook and xcodebuild steps", () => {
		const heavy = GROUP_ORDER.flatMap((group) =>
			GATE[group]
				.filter((step) => step.heavy)
				.map((step) => `${group} / ${step.name}`),
		)

		expect(heavy).toEqual([
			"rust-check / Build sidecar",
			"rust-check / Clippy",
			"rust-check / Regenerate the bindings",
			"rust / Build sidecar",
			"rust / Clippy",
			"rust / Test",
			"storybook / Stories played in chromium against the baseline",
			"ios / Build for testing",
			"ios / Test on the simulator",
		])
	})

	it("passes a heavy step through scripts/slot.sh, every other step straight to bash", () => {
		for (const step of GROUP_ORDER.flatMap((group) => GATE[group])) {
			const command = spawnedCommand(step)
			const bash = ["bash", "-ec", step.command]

			if (step.heavy) {
				expect(command.slice(1)).toEqual(bash)
				expect(command[0]).toEndWith("/scripts/slot.sh")
			} else expect(command).toEqual(bash)
		}
	})

	it("notes every group a pull_request skips, nothing else", () => {
		expect(GROUP_ORDER.filter((group) => offPullRequestNote(group))).toEqual(
			OFF_PULL_REQUEST_JOBS,
		)
		for (const group of ["website", "rust", "storybook"] as const) {
			expect(offPullRequestNote(group)).toBe(
				`${group} skips a pull_request, CI runs it on a merge_group and on a v* tag`,
			)
		}
		expect(offPullRequestNote("ios")).toBe(
			"ios skips a pull_request, CI runs it on a push to main only",
		)
	})

	it("skips ios, whatever the paths touched", () => {
		expect(skipReason({ group: "ios", touched: EVERY_PATH_TOUCHED })).toBe(
			"run bun run ci ios to run it here",
		)
	})

	it("runs rust and storybook when their paths are touched", () => {
		for (const group of ["rust", "storybook"] as const) {
			expect(skipReason({ group, touched: EVERY_PATH_TOUCHED })).toBeUndefined()
			expect(skipReason({ group, touched: NO_PATH_TOUCHED })).toBeDefined()
		}
	})

	it("runs rust-check on the paths that touch rust", () => {
		expect(
			skipReason({
				group: "rust-check",
				touched: { ...NO_PATH_TOUCHED, rust: true },
			}),
		).toBeUndefined()
		expect(
			skipReason({ group: "rust-check", touched: NO_PATH_TOUCHED }),
		).toBeDefined()
	})
})

describe("ci:fast", () => {
	const gate = GROUP_ORDER.flatMap((group) => GATE[group])

	it("runs the named gate steps with the same command, then the changed unit tests", () => {
		const steps = fastSteps()

		expect(steps.map((step) => step.name)).toEqual([
			...FAST_STEP_NAMES,
			CHANGED_UNIT_TESTS.name,
		])
		for (const step of steps.slice(0, -1)) expect(gate).toContainEqual(step)
	})

	it("leaves the full unit set and the perf set to the gate", () => {
		expect(gate).not.toContainEqual(CHANGED_UNIT_TESTS)
		for (const step of GATE.vitest) expect(fastSteps()).not.toContainEqual(step)
	})

	it("takes no slot", () => {
		expect(fastSteps().filter((step) => step.heavy)).toEqual([])
	})
})

describe("the jobs of ci.yml", () => {
	it("gate every group of scripts/ci.ts but the local rust-check, one job per group", () => {
		const gatedJobs = Object.keys(workflow.jobs).filter(
			(job) => !UNGATED_JOBS.has(job),
		)

		expect(gatedJobs.sort()).toEqual([...CI_JOBS].sort())
	})

	it("carries no rust-check job and no rust-check verify step", () => {
		expect(workflow.jobs["rust-check"]).toBeUndefined()
		expect(JSON.stringify(workflow.jobs.verify)).not.toContain("rust-check")
	})

	it.each(CI_JOBS.filter((group) => group !== "vitest"))(
		"%s runs its checks through bun scripts/ci.ts",
		(job) => {
			const gateSteps = runStepsOf(job).filter(
				(step) => !SETUP_STEPS.has(step.name ?? ""),
			)

			expect(gateSteps.map((step) => step.run?.trim())).toEqual([
				`bun scripts/ci.ts ${job}`,
			])
		},
	)

	it.each([
		[A_PULL_REQUEST, "bun scripts/ci.ts changed"],
		[A_QUEUE_COMMIT, "bun scripts/ci.ts vitest"],
		[A_RELEASE_TAG, "bun scripts/ci.ts vitest"],
	])(
		"has vitest run one gate through bun scripts/ci.ts on %p",
		(github, command) => {
			const gateSteps = runStepsOf("vitest").filter(
				(step) =>
					!SETUP_STEPS.has(step.name ?? "") &&
					evaluate(step.if ?? "true", scopeOf(github)),
			)

			expect(gateSteps.map((step) => step.run?.trim())).toEqual([command])
		},
	)

	it("has vitest read the changed test files of a pull_request against the first parent of its merge ref, set as origin/main", () => {
		const vitest = workflow.jobs.vitest
		const scope = scopeOf(A_PULL_REQUEST)
		const baseStep = stepNamed(
			"vitest",
			"Read the changed test files against the base the merge ref was built on",
		)

		expect(vitest?.env?.BASE).toBeUndefined()
		expect(evaluate(baseStep?.if ?? "false", scope)).toBe(true)
		expect(baseStep?.run).toBe("git update-ref refs/remotes/origin/main HEAD^1")
		expect(
			interpolate(
				String(vitest?.steps?.[0]?.with?.["fetch-depth"] ?? ""),
				scope,
			),
		).toBe("2")
	})

	it.each(CI_JOBS)("%s bounds its gate by the job timeout only", (job) => {
		const stepTimeouts = (workflow.jobs[job]?.steps ?? []).flatMap(
			(step) => step["timeout-minutes"] ?? [],
		)

		expect(stepTimeouts).toEqual([])
	})

	it("starts lint without changes on every event but a push to main, and has verify require it then and its skip on a push to main", () => {
		expect(workflow.jobs.lint?.needs).toBeUndefined()
		expect(workflow.jobs.lint?.if).toBe(LINT_EVENTS)
		expect(verifyCondition("lint")).toBe(
			`needs.lint.result != ((${LINT_EVENTS}) && 'success' || 'skipped')`,
		)
	})

	it.each(CI_JOBS.filter((group) => group !== "lint"))(
		"runs %s when changes selects it, and has verify require it then and its skip otherwise",
		(job) => {
			const selected = `needs.changes.outputs.${job} == 'true'`

			expect(workflow.jobs[job]?.if).toBe(selected)
			expect(verifyCondition(job)).toBe(
				`needs.${job}.result != (${selected} && 'success' || 'skipped')`,
			)
		},
	)

	it("bounds ios by 60 minutes", () => {
		expect(workflow.jobs.ios?.["timeout-minutes"]).toBe(60)
	})

	it.each([
		[A_PULL_REQUEST, "pull_request"],
		[A_QUEUE_COMMIT, "merge_group"],
		[A_PUSH_TO_MAIN, "push"],
		[A_RELEASE_TAG, "tag"],
	])("hands changes the event of %p as %s", (github, event) => {
		expect(ciEventOf(github)).toBe(event)
	})

	it("triggers on a push, a pull_request and a merge_group asking for checks", () => {
		expect(workflow.on).toEqual({
			push: { branches: ["main"], tags: ["v*"] },
			pull_request: { branches: ["main"] },
			merge_group: { types: ["checks_requested"] },
		})
	})

	it("runs only changes, lint and vitest on a pull_request", () => {
		expect(jobsRunningOn(A_PULL_REQUEST)).toEqual(PULL_REQUEST_JOB_SET)
	})

	it("runs every desktop job on a merge_group, never ios", () => {
		expect(jobsRunningOn(A_QUEUE_COMMIT)).toEqual(MERGE_GROUP_JOB_SET)
	})

	it("runs only changes and ios on a push to main", () => {
		expect(jobsRunningOn(A_PUSH_TO_MAIN)).toEqual(["changes", "ios", "verify"])
	})

	it("keeps the desktop jobs on a v* tag, never ios", () => {
		expect(jobsRunningOn(A_RELEASE_TAG)).toEqual([
			"changes",
			"lint",
			"rust",
			"storybook",
			"verify",
			"vitest",
			"website",
		])
	})

	it.each([A_PULL_REQUEST, A_QUEUE_COMMIT, A_PUSH_TO_MAIN, A_RELEASE_TAG])(
		"has verify pass on %p when every job succeeded or was skipped by rule",
		(github) => {
			expect(failingVerifySteps(github, resultsByRule(github))).toEqual([])
		},
	)

	it.each(
		MERGE_GROUP_JOB_SET.filter((job) => job !== "verify").flatMap((job) => [
			[job, "failure"],
			[job, "skipped"],
		]),
	)("has verify fail on a merge_group when %s ended %s", (job, result) => {
		const results = { ...resultsByRule(A_QUEUE_COMMIT), [job]: result }

		expect(failingVerifySteps(A_QUEUE_COMMIT, results)).not.toEqual([])
	})

	it.each(
		PULL_REQUEST_JOB_SET.filter((job) => job !== "verify").flatMap((job) => [
			[job, "failure"],
			[job, "skipped"],
		]),
	)("has verify fail on a pull_request when %s ended %s", (job, result) => {
		const results = { ...resultsByRule(A_PULL_REQUEST), [job]: result }

		expect(failingVerifySteps(A_PULL_REQUEST, results)).not.toEqual([])
	})

	it("has verify fail on a push to main when lint ran", () => {
		const results = { ...resultsByRule(A_PUSH_TO_MAIN), lint: "success" }

		expect(failingVerifySteps(A_PUSH_TO_MAIN, results)).not.toEqual([])
	})

	it.each(["rust", "storybook", "website"])(
		"has verify fail on a pull_request when %s ran",
		(job) => {
			const results = { ...resultsByRule(A_PULL_REQUEST), [job]: "success" }

			expect(failingVerifySteps(A_PULL_REQUEST, results)).not.toEqual([])
		},
	)

	it("diffs a merge_group against its base_sha, fetched before the diff", () => {
		const changes = workflow.jobs.changes
		const steps = changes?.steps ?? []
		const fetchIndex = steps.findIndex(
			(step) => step.name === "Fetch the base to diff against",
		)
		const decideIndex = steps.findIndex((step) => step.id === "filter")
		const scope = scopeOf(A_QUEUE_COMMIT)

		expect(interpolate(changes?.env?.BASE ?? "", scope)).toBe("queue-base")
		expect(evaluate(steps[fetchIndex]?.if ?? "false", scope)).toBe(true)
		expect(steps[fetchIndex]?.run).toBe('git fetch --depth=1 origin "$BASE"')
		expect(fetchIndex).toBeLessThan(decideIndex)
	})

	it("never cancels the run of another queue commit", () => {
		const groupOf = (github: GitHubContext) =>
			interpolate(workflow.concurrency.group, scopeOf(github))

		expect(groupOf(queueCommit(7))).not.toBe(groupOf(queueCommit(8)))
		expect(
			interpolate(
				workflow.concurrency["cancel-in-progress"],
				scopeOf(A_QUEUE_COMMIT),
			),
		).toBe("false")
	})

	it("has verify wait on every job", () => {
		expect(workflow.jobs.verify?.needs).toEqual([
			"changes",
			"lint",
			"vitest",
			"website",
			"rust",
			"storybook",
			"ios",
		])
	})

	it("restores and installs the Playwright browser in storybook only", () => {
		const installing = Object.keys(workflow.jobs).filter((job) =>
			(workflow.jobs[job]?.steps ?? []).some(
				(step) =>
					step.id === "playwright" ||
					step.name === "Install Playwright browser",
			),
		)

		expect(installing).toEqual(["storybook"])
	})

	it("has the ci-green job of release.yml wait on the CI run alone, never on ios", () => {
		const ciGreen = JSON.stringify(releaseWorkflow.jobs["ci-green"])

		expect(ciGreen).toContain("--workflow ci.yml")
		expect(ciGreen).not.toMatch(/\bios\b/)
	})

	it("has ci-green read the CI run of the tag, never another push run on its commit", () => {
		const waitStep = releaseWorkflow.jobs["ci-green"]?.steps?.find((step) =>
			step.run?.includes("gh run list"),
		)

		expect(waitStep?.run).toContain('--branch "$GITHUB_REF_NAME"')
	})

	it("has release.yml publish only after the draft job and every desktop job", () => {
		expect(releaseWorkflow.jobs.publish?.needs).toEqual(["draft", "release"])
	})

	it("has both tauri-action steps upload into the draft job's release, kept a draft", () => {
		const tauriSteps = (releaseWorkflow.jobs.release?.steps ?? []).filter(
			(step) => step.uses?.startsWith("tauri-apps/tauri-action@"),
		)

		expect(tauriSteps).toHaveLength(2)
		for (const step of tauriSteps) {
			expect(step.with?.releaseId).toMatch(
				/^\$\{\{ needs\.draft\.outputs\.release-id \}\}$/,
			)
			expect(step.with?.releaseDraft).toBe(true)
			expect(step.with?.tagName).toBeUndefined()
		}
	})

	it("has exactly one step of release.yml publish the release", () => {
		const publishing = Object.entries(releaseWorkflow.jobs).flatMap(
			([job, { steps }]) =>
				(steps ?? [])
					.filter(
						(step) =>
							step.run?.includes("draft=false") ||
							step.with?.releaseDraft === false,
					)
					.map((step) => `${job}/${step.name}`),
		)

		expect(publishing).toEqual(["publish/Publish the draft release"])
	})

	it("boots the simulator bun run ci looks up", () => {
		expect(
			stepNamed("ios", "Boot the simulator while the app builds")?.run,
		).toContain(SIMULATOR_LOOKUP)
	})
})
