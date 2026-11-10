import { afterAll, describe, expect, it } from "bun:test"
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

import { SCOPES, UNIT_SUITES } from "./baseline"
import {
	CHANGED_UNIT_TESTS,
	elapsedText,
	FAST_STEP_NAMES,
	FULL_UNIT_TESTS,
	failedRustTargets,
	fastSteps,
	GATE,
	GROUP_ORDER,
	type Group,
	loggedCargoStep,
	offPullRequestNote,
	parsedShard,
	retriedTestAnnotation,
	retriedTestSummary,
	retryOf,
	rustRerunStep,
	SHARED_IMPORTER_THRESHOLD,
	SHARED_PATH_RULES,
	SIMULATOR_LOOKUP,
	type Step,
	scopeLine,
	shardTests,
	skipReason,
	spawnedCommand,
	type UnitTestScope,
	uiTestClasses,
	unitTestScope,
	unitTestSteps,
	vitestRetryStep,
} from "./ci"
import { decideJobs } from "./ci-changes"
import { TEST_SOURCE_ROOTS } from "./test-importers"

type WorkflowStep = {
	name?: string
	id?: string
	uses?: string
	run?: string
	if?: string
	"timeout-minutes"?: number
	env?: Record<string, string>
	with?: Record<string, unknown>
}

type Workflow = {
	on: Record<string, unknown>
	concurrency: { group: string; "cancel-in-progress": string }
	jobs: Record<
		string,
		{
			if?: string
			container?: { image?: string }
			env?: Record<string, string>
			outputs?: Record<string, string>
			needs?: string | string[]
			permissions?: Record<string, string>
			"timeout-minutes"?: number
			strategy?: { "fail-fast"?: boolean; matrix?: Record<string, unknown[]> }
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
	"Install the keyboard library the Rune app links on Linux",
	"Select the Xcode pinned in .xcode-version",
	"Install XcodeGen",
	"Boot the simulator while the app builds",
	"Read the changed test files against the base the merge ref was built on",
])

const UNGATED_JOBS = new Set(["changes", "installer", "verify"])

const CI_JOBS: Group[] = GROUP_ORDER

const OFF_PULL_REQUEST_JOBS: Group[] = ["website", "ios"]

const EVERY_PATH_TOUCHED = {
	vitest: true,
	website: true,
	ios: true,
	core: true,
	installer: true,
}

const NO_PATH_TOUCHED = {
	vitest: false,
	website: false,
	ios: false,
	core: false,
	installer: false,
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
	path.split(".").reduce<unknown>((value, key) => {
		if (key === "*") return value
		if (Array.isArray(value))
			return value.map((item: ExpressionScope) => item[key])
		return (value as ExpressionScope | undefined)?.[key]
	}, scope)

const evaluate = (expression: string, scope: ExpressionScope): unknown =>
	new Function(
		`return (${expression
			.replace(
				/\b(?:github|needs|steps|env|matrix|strategy)(?:\.(?:[\w-]+|\*))+/g,
				(path) => JSON.stringify(lookUp(scope, path) ?? null),
			)
			.replace("always()", "true")
			.replace(
				/startsWith\(/g,
				"((value, prefix) => String(value).startsWith(prefix))(",
			)
			.replace(
				/contains\(/g,
				"((items, item) => [items ?? []].flat().includes(item))(",
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

const filterOutputsOn = (github: GitHubContext, paths: string[]) =>
	Object.fromEntries(
		Object.entries(decideJobs({ event: ciEventOf(github), paths })).map(
			([job, runs]) => [job, String(runs)],
		),
	)

const outputsOn = (github: GitHubContext, paths = ["bun.lock"]) => {
	const steps = { filter: { outputs: filterOutputsOn(github, paths) } }
	return Object.fromEntries(
		Object.entries(workflow.jobs.changes?.outputs ?? {}).map(
			([name, template]) => [name, interpolate(template, { github, steps })],
		),
	)
}

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

const pushToMain = (runId: number): GitHubContext => ({
	event_name: "push",
	ref: "refs/heads/main",
	run_id: String(runId),
	event: { before: "main-before" },
})

const A_PUSH_TO_MAIN = pushToMain(7)

const releaseTag = (runId: number): GitHubContext => ({
	event_name: "push",
	ref: "refs/tags/v1.2.0",
	run_id: String(runId),
})

const A_RELEASE_TAG = releaseTag(9)

const pullRequest = (number: number, runId: number): GitHubContext => ({
	event_name: "pull_request",
	ref: `refs/pull/${number}/merge`,
	run_id: String(runId),
})

const A_PULL_REQUEST = pullRequest(7, 11)

const PULL_REQUEST_JOB_SET = [
	"changes",
	"core",
	"installer",
	"lint",
	"verify",
	"vitest",
]

const PUSH_TO_MAIN_JOB_SET = [
	"changes",
	"core",
	"installer",
	"ios",
	"lint",
	"verify",
	"vitest",
	"website",
]

describe("the gate", () => {
	it("runs the pull_request groups, then the post-merge groups", () => {
		expect(GROUP_ORDER).toEqual(["lint", "vitest", "website", "core", "ios"])
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

	it("runs fmt, clippy with -D warnings and cargo test for kiroshi-core and the Rune workspace in core", () => {
		expect(
			GATE.core.map((step) => `${step.cwd ?? "."} $ ${step.command}`),
		).toEqual([
			". $ cargo fmt --all --check",
			". $ cargo clippy --workspace --all-targets --locked -- -D warnings",
			". $ cargo test -p kiroshi-core --locked",
			"apps/rune-preview $ cargo fmt --all --check",
			"apps/rune-preview $ cargo clippy --workspace --all-targets --features fake-claude --locked -- -D warnings",
			"apps/rune-preview $ cargo test --workspace --features fake-claude --locked",
		])
	})

	it("runs no storybook, Tauri or bindings step in any group", () => {
		const commands = GROUP_ORDER.flatMap((group) =>
			GATE[group].map((step) => step.command),
		)

		expect(
			commands.filter((command) =>
				/storybook|src-tauri|tauri|bindings/.test(command),
			),
		).toEqual([])
	})

	it("checks the colour set names against tokens.json before tokens:build rewrites the catalogue", () => {
		const commands = GATE.lint.map((step) => step.command)

		expect(commands.indexOf("bun run tokens:check-sets")).toBeGreaterThan(-1)
		expect(commands.indexOf("bun run tokens:check-sets")).toBeLessThan(
			commands.indexOf("bun run tokens:build"),
		)
	})

	it("builds the website with the command the Render deploy runs", () => {
		expect(GATE.website.map((step) => step.command)).toEqual([
			"bun run build:website",
		])
	})

	it("marks heavy exactly the clippy, cargo test and xcodebuild steps", () => {
		const heavy = GROUP_ORDER.flatMap((group) =>
			GATE[group]
				.filter((step) => step.heavy)
				.map((step) => `${group} / ${step.name}`),
		)

		expect(heavy).toEqual([
			"core / Clippy kiroshi-core",
			"core / Test kiroshi-core",
			"core / Clippy the Rune app",
			"core / Test the Rune app",
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
		expect(offPullRequestNote("website")).toBe(
			"website skips a pull_request, CI runs it on a push to main and on a v* tag",
		)
		expect(offPullRequestNote("ios")).toBe(
			"ios skips a pull_request, CI runs it on a push to main only",
		)
	})

	it("skips ios, whatever the paths touched", () => {
		expect(skipReason({ group: "ios", touched: EVERY_PATH_TOUCHED })).toBe(
			"run bun run ci ios to run it here",
		)
	})

	it("runs core when its paths are touched", () => {
		for (const group of ["core"] as const) {
			expect(skipReason({ group, touched: EVERY_PATH_TOUCHED })).toBeUndefined()
			expect(skipReason({ group, touched: NO_PATH_TOUCHED })).toBeDefined()
		}
	})
})

const CHANGED_SCOPE: UnitTestScope = { scope: "changed" }

describe("ci:fast", () => {
	const gate = GROUP_ORDER.flatMap((group) => GATE[group])
	const QUEUE_SCRIPT_UNIT_TESTS = [
		[
			"scripts/pr-dequeue.sh",
			"PR dequeue script unit tests",
			"test:pr-dequeue",
		],
		[
			"scripts/pr-dequeue.test.ts",
			"PR dequeue script unit tests",
			"test:pr-dequeue",
		],
		[
			"scripts/pr-enqueue.sh",
			"PR enqueue script unit tests",
			"test:pr-enqueue",
		],
		[
			"scripts/pr-enqueue.test.ts",
			"PR enqueue script unit tests",
			"test:pr-enqueue",
		],
		[
			"scripts/pr-merge-sub.sh",
			"PR merge sub script unit tests",
			"test:pr-merge-sub",
		],
		[
			"scripts/pr-merge-sub.test.ts",
			"PR merge sub script unit tests",
			"test:pr-merge-sub",
		],
	]
	const QUEUE_SCRIPT_PATHS = QUEUE_SCRIPT_UNIT_TESTS.map(([path]) => path)
	const QUEUE_SCRIPT_STEPS = QUEUE_SCRIPT_UNIT_TESTS.map(([, step]) => step)

	it("runs the named gate steps with the same command, then the changed unit tests", () => {
		const steps = fastSteps([], CHANGED_SCOPE)

		expect(steps.map((step) => step.name)).toEqual([
			...FAST_STEP_NAMES,
			CHANGED_UNIT_TESTS.name,
		])
		for (const step of steps.slice(0, -1)) expect(gate).toContainEqual(step)
	})

	const FULL_SCOPES = [
		[
			"a shared path rule",
			{ scope: "full", path: "baselines/a.json", rule: "baselines/**" },
		],
		[
			"the importer threshold",
			{
				scope: "full",
				path: "packages/ui/src/a.ts",
				importers: 20,
				graphMs: 5,
			},
		],
		[
			"an import graph failure",
			{ scope: "full", error: "Error: ENOENT", graphMs: 3 },
		],
	] satisfies [string, UnitTestScope][]
	const BASELINE_SCOPE = /^bun run baseline (\w+)$/
	const baselineScopesOf = (steps: Step[]) =>
		steps.flatMap((step) => {
			const scope = BASELINE_SCOPE.exec(step.command)?.[1]
			return scope && scope in SCOPES ? [scope as keyof typeof SCOPES] : []
		})

	it.each(FULL_SCOPES)(
		"runs the ui unit project against the baseline, no timing-bound test, no website suite, no sidecar suite and no slot when %s makes the scope full",
		(_, scope) => {
			const steps = fastSteps([], scope)
			const suites = baselineScopesOf(steps).flatMap(
				(name) => SCOPES[name].suites,
			)

			expect(steps.slice(FAST_STEP_NAMES.length)).toEqual([FULL_UNIT_TESTS])
			expect(steps.filter((step) => step.heavy)).toEqual([])
			for (const step of GATE.vitest) expect(steps).not.toContainEqual(step)
			expect(baselineScopesOf(steps)).toEqual(["lint", "unit"])
			expect(suites).toEqual(["ui"])
			expect(UNIT_SUITES.map((suite) => suite.project)).toEqual(["unit"])
		},
	)

	it("leaves every timing-bound test and the website, shared and sidecar suites to the gate", () => {
		expect(gate).not.toContainEqual(FULL_UNIT_TESTS)
		expect(baselineScopesOf(gate)).toContain("vitest")
		expect(SCOPES.vitest.suites).toEqual(["ui", "website", "shared", "sidecar"])
	})

	it("leaves the full unit set to the gate when the scope is changed", () => {
		expect(gate).not.toContainEqual(CHANGED_UNIT_TESTS)
		for (const step of GATE.vitest)
			expect(fastSteps(QUEUE_SCRIPT_PATHS, CHANGED_SCOPE)).not.toContainEqual(
				step,
			)
	})

	it("takes no slot", () => {
		expect(
			fastSteps(QUEUE_SCRIPT_PATHS, CHANGED_SCOPE).filter((step) => step.heavy),
		).toEqual([])
	})

	it.each(QUEUE_SCRIPT_UNIT_TESTS)(
		"runs the lint step of its script tests before the changed unit tests when the diff touches %s",
		(path, stepName, script) => {
			const steps = fastSteps(["AGENTS.md", path], CHANGED_SCOPE)
			const scriptTests = steps[FAST_STEP_NAMES.length]

			expect(steps.map((step) => step.name)).toEqual([
				...FAST_STEP_NAMES,
				stepName,
				CHANGED_UNIT_TESTS.name,
			])
			expect(GATE.lint).toContainEqual(scriptTests)
			expect(scriptTests.command).toBe(`bun run ${script}`)
		},
	)

	it("leaves the queue script tests out when the diff touches neither script nor its tests", () => {
		const steps = fastSteps(
			["scripts/slot.sh", "scripts/ci.ts"],
			CHANGED_SCOPE,
		).map((step) => step.name)

		for (const step of QUEUE_SCRIPT_STEPS) expect(steps).not.toContain(step)
	})
})

const NO_REPO = join(tmpdir(), "kiroshi-ci-test-no-repo")

const SHARED_MODULE = "packages/ui/src/components/shared.ts"

const RELAY_MODULE = "packages/ui/src/components/relay.ts"

type FixtureRepo = { directImporters: number; relayImporters: number }

const fixtureRepo = ({ directImporters, relayImporters }: FixtureRepo) => {
	const repo = mkdtempSync(join(tmpdir(), "kiroshi-ci-test-"))
	const write = (path: string, source: string) => {
		mkdirSync(dirname(join(repo, path)), { recursive: true })
		writeFileSync(join(repo, path), source)
	}
	write(SHARED_MODULE, "export const shared = 1\n")
	write(RELAY_MODULE, 'export { shared } from "./shared"\n')
	for (let index = 0; index < directImporters; index++)
		write(
			`packages/ui/src/components/direct-${index}.test.ts`,
			'import { shared } from "./shared"\nshared\n',
		)
	for (let index = 0; index < relayImporters; index++)
		write(
			`packages/ui/src/hooks/relay-${index}.test.ts`,
			'import { shared } from "@workspace/ui/components/relay"\nshared\n',
		)
	return repo
}

describe("the unit test scope of a pull request", () => {
	const repos: string[] = []
	const decided = (changedPaths: string[], fixture: FixtureRepo) => {
		const repo = fixtureRepo(fixture)
		repos.push(repo)
		return unitTestScope({ changedPaths, repo })
	}

	afterAll(() => {
		for (const repo of repos) rmSync(repo, { recursive: true, force: true })
	})

	it("keeps only glob rules and config paths, no module under the test source roots", () => {
		const moduleRules = SHARED_PATH_RULES.filter(
			(rule) =>
				!rule.includes("*") &&
				TEST_SOURCE_ROOTS.some((root) => rule.startsWith(root)),
		)

		expect(moduleRules).toEqual([])
	})

	it("runs the full suite when the diff touches a shared path, naming the path and its rule", () => {
		expect(
			unitTestScope({
				changedPaths: [
					"packages/ui/src/components/activity-indicator.tsx",
					"packages/ui/src/tokens/tokens.json",
				],
				repo: NO_REPO,
			}),
		).toEqual({
			scope: "full",
			path: "packages/ui/src/tokens/tokens.json",
			rule: "packages/ui/src/tokens/**",
		})
	})

	it("runs the changed test files without building the import graph when the diff is empty", () => {
		expect(unitTestScope({ changedPaths: [], repo: NO_REPO })).toEqual({
			scope: "changed",
		})
	})

	it("decides without building the import graph when no changed path is a source module", () => {
		expect(
			unitTestScope({
				changedPaths: [
					"AGENTS.md",
					"scripts/ci.ts",
					"packages/ui/src/components/shared.css",
					"crates/kiroshi-core/src/lib.rs",
				],
				repo: NO_REPO,
			}),
		).toEqual({ scope: "changed" })
	})

	it("runs the full suite when the diff touches the token source", () => {
		expect(
			unitTestScope({
				changedPaths: ["packages/ui/tokens.json"],
				repo: NO_REPO,
			}),
		).toEqual({
			scope: "full",
			path: "packages/ui/tokens.json",
			rule: "packages/ui/tokens.json",
		})
	})

	it("runs the full suite when the diff touches a tokens file at the root of packages/ui/src", () => {
		expect(
			unitTestScope({
				changedPaths: ["packages/ui/src/tokens.json"],
				repo: NO_REPO,
			}),
		).toEqual({
			scope: "full",
			path: "packages/ui/src/tokens.json",
			rule: "packages/ui/src/tokens.*",
		})
	})

	it(`runs the changed test files when ${SHARED_IMPORTER_THRESHOLD - 1} test files reach the changed module`, () => {
		expect(
			decided([SHARED_MODULE], {
				directImporters: SHARED_IMPORTER_THRESHOLD - 1,
				relayImporters: 0,
			}),
		).toEqual({ scope: "changed", graphMs: expect.any(Number) })
	})

	it(`runs the full suite when ${SHARED_IMPORTER_THRESHOLD} test files reach the changed module, naming the path and its importer count`, () => {
		expect(
			decided(["AGENTS.md", SHARED_MODULE], {
				directImporters: SHARED_IMPORTER_THRESHOLD,
				relayImporters: 0,
			}),
		).toEqual({
			scope: "full",
			path: SHARED_MODULE,
			importers: SHARED_IMPORTER_THRESHOLD,
			graphMs: expect.any(Number),
		})
	})

	it("counts a test file that reaches the changed module through another module", () => {
		expect(
			decided([SHARED_MODULE], {
				directImporters: SHARED_IMPORTER_THRESHOLD - 1,
				relayImporters: 1,
			}),
		).toEqual({
			scope: "full",
			path: SHARED_MODULE,
			importers: SHARED_IMPORTER_THRESHOLD,
			graphMs: expect.any(Number),
		})
	})

	it("runs the full suite and carries the error when building the import graph throws", () => {
		const scope = unitTestScope({
			changedPaths: [SHARED_MODULE],
			repo: NO_REPO,
		})

		expect(scope).toEqual({
			scope: "full",
			error: expect.stringContaining("ENOENT"),
			graphMs: expect.any(Number),
		})
	})

	it.each([
		[
			{ scope: "full", path: "baselines/a.json", rule: "baselines/**" },
			"ci  unit test scope: full suite: baselines/a.json is shared (baselines/**)",
		],
		[
			{ scope: "full", path: SHARED_MODULE, importers: 24, graphMs: 812 },
			`ci  unit test scope: full suite: ${SHARED_MODULE} is shared (24 test files reach it, threshold ${SHARED_IMPORTER_THRESHOLD}), import graph build took 812 ms`,
		],
		[
			{ scope: "full", error: "Error: ENOENT", graphMs: 3 },
			"ci  unit test scope: full suite: building the import graph failed: Error: ENOENT, import graph build took 3 ms",
		],
		[
			{ scope: "changed", graphMs: 640 },
			"ci  unit test scope: changed test files: no changed path is shared, import graph build took 640 ms",
		],
		[
			{ scope: "changed" },
			"ci  unit test scope: changed test files: no changed path is shared",
		],
	] satisfies [UnitTestScope, string][])(
		"prints %o as its scope line",
		(scope, line) => {
			expect(scopeLine(scope)).toBe(line)
		},
	)

	it("runs the whole unit projects for a full scope and the changed unit tests otherwise", () => {
		expect(unitTestSteps({ scope: "changed" })).toEqual([CHANGED_UNIT_TESTS])
		expect(
			unitTestSteps({ scope: "full", error: "Error: ENOENT", graphMs: 3 }),
		).toEqual([FULL_UNIT_TESTS])
	})
})

describe("the push to main retry", () => {
	const FULL_SCOPE: UnitTestScope = {
		scope: "full",
		path: "baselines/a.json",
		rule: "baselines/**",
	}
	const SCOPES = [
		["the changed scope", CHANGED_SCOPE],
		["the full scope", FULL_SCOPE],
	] as const
	const everyStep = (scope: UnitTestScope) => [
		...new Set([
			...GROUP_ORDER.flatMap((group) => GATE[group]),
			CHANGED_UNIT_TESTS,
			...fastSteps(
				[
					"scripts/pr-dequeue.sh",
					"scripts/pr-enqueue.sh",
					"scripts/pr-merge-sub.sh",
				],
				scope,
			),
		]),
	]
	type RetriedOn = { ref: string | undefined; scope: UnitTestScope }
	const retried = ({ ref, scope }: RetriedOn) =>
		everyStep(scope).flatMap((step) => {
			const retry = retryOf(step, ref)
			return retry ? [`${step.name}: ${retry}`] : []
		})
	const RUST_TEST = GATE.core.find(
		(step) => step.name === "Test kiroshi-core",
	) as Step

	it.each(SCOPES)(
		"retries the vitest gate and the two cargo tests on a push to main, nothing else, under %s",
		(_, scope) => {
			expect(retried({ ref: "refs/heads/main", scope })).toEqual([
				"Unit tests, website, shared and sidecar suites against the baseline: vitest",
				"Test kiroshi-core: cargo",
				"Test the Rune app: cargo",
			])
		},
	)

	it.each([
		["a pull_request", "refs/pull/7/merge"],
		["a v* tag", "refs/tags/v1.2.0"],
		["another branch", "refs/heads/feature/ope-1-fix"],
		["no ref", undefined],
	])("retries nothing on %s", (_, ref) => {
		for (const [, scope] of SCOPES) expect(retried({ ref, scope })).toEqual([])
	})

	it("hands the vitest gate one retry per failing test", () => {
		expect(vitestRetryStep(GATE.vitest[0] as Step).command).toBe(
			"bun run baseline vitest --retry",
		)
	})

	it("keeps going past a failing cargo target and logs the output it streams", () => {
		expect(loggedCargoStep(RUST_TEST, "/tmp/run/cargo-test.log")).toEqual({
			...RUST_TEST,
			command:
				"set -o pipefail; cargo test -p kiroshi-core --locked --no-fail-fast 2>&1 | tee '/tmp/run/cargo-test.log'",
		})
	})

	it("reruns one failed rust test alone, in its own target", () => {
		const rerun = rustRerunStep(RUST_TEST, {
			target: "--test other",
			file: "crates/kiroshi-core/tests/other.rs",
			test: "src/lib.rs - it's (line 3)",
		})

		expect(rerun.command).toBe(
			"cargo test -p kiroshi-core --locked --test other -- --exact 'src/lib.rs - it'\\''s (line 3)'",
		)
		expect(rerun.heavy).toBe(true)
		expect(rerun.cwd).toBeUndefined()
	})

	it("reruns a failed doc test by its name, which rustdoc never matches exactly", () => {
		const rerun = rustRerunStep(RUST_TEST, {
			target: "--doc",
			file: "crates/kiroshi-core",
			test: "src/lib.rs - documented (line 11)",
		})

		expect(rerun.command).toBe(
			"cargo test -p kiroshi-core --locked --doc -- 'src/lib.rs - documented (line 11)'",
		)
	})

	const CARGO_OUTPUT = `     Running unittests src/lib.rs (target/debug/deps/kiroshi-1)

running 3 tests
test tests::green ... ok
test tests::flaky ... FAILED
test tests::red ... FAILED

failures:
    tests::flaky
    tests::red

test result: FAILED. 1 passed; 2 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
error: test failed, to rerun pass \`--lib\`
     Running tests/fine.rs (target/debug/deps/fine-2)

running 1 test
test fine ... ok

test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
     Running tests/other.rs (target/debug/deps/other-3)

running 1 test
test red ... FAILED

test result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
error: test failed, to rerun pass \`--test other\`
error: 2 targets failed:
    \`--lib\`
    \`--test other\`
`

	it("names each failed rust test with its target and its file", () => {
		expect(failedRustTargets(CARGO_OUTPUT, "crates/kiroshi-core")).toEqual([
			{
				target: "--lib",
				file: "crates/kiroshi-core/src/lib.rs",
				tests: ["tests::flaky", "tests::red"],
				isAttributed: true,
			},
			{
				target: "--test other",
				file: "crates/kiroshi-core/tests/other.rs",
				tests: ["red"],
				isAttributed: true,
			},
		])
	})

	it("leaves unattributed a target whose binary died before its test result", () => {
		const crashed = `     Running tests/crash.rs (target/debug/deps/crash-4)

running 2 tests
error: test failed, to rerun pass \`--test crash\`

Caused by:
  process didn't exit successfully (signal: 6, SIGABRT: process abort signal)
`

		expect(failedRustTargets(crashed, "apps/rune-preview")).toEqual([
			{
				target: "--test crash",
				file: "apps/rune-preview/tests/crash.rs",
				tests: [],
				isAttributed: false,
			},
		])
	})

	it("finds no failed target in a build that never ran a test", () => {
		expect(
			failedRustTargets(
				"error[E0425]: cannot find value `x` in this scope\n",
				"crates/kiroshi-core",
			),
		).toEqual([])
	})

	it("names the file and the test of a pass on its retry in one warning annotation", () => {
		expect(
			retriedTestAnnotation({
				file: "apps/website/src/a,b.test.ts",
				name: "counts 100%\nof it",
			}),
		).toBe(
			"::warning file=apps/website/src/a%2Cb.test.ts,title=Passed only on its retry::apps/website/src/a,b.test.ts :: counts 100%25%0Aof it",
		)
	})

	it("lists every pass on its retry in the job summary", () => {
		expect(
			retriedTestSummary([
				{ file: "apps/website/src/a.test.ts", name: "flips once" },
				{ file: "crates/kiroshi-core/src/lib.rs", name: "tests::flaky" },
			]),
		).toBe(
			"### Passed only on its retry\n\n- `apps/website/src/a.test.ts` :: flips once\n- `crates/kiroshi-core/src/lib.rs` :: tests::flaky\n\n",
		)
	})
})

describe("the jobs of ci.yml", () => {
	it("gate every group of scripts/ci.ts, one job per group", () => {
		const gatedJobs = Object.keys(workflow.jobs).filter(
			(job) => !UNGATED_JOBS.has(job),
		)

		expect(gatedJobs.sort()).toEqual([...CI_JOBS].sort())
	})

	it.each(["rust", "rust-check", "storybook"])(
		"carries no %s job and no verify step for it",
		(job) => {
			expect(workflow.jobs[job]).toBeUndefined()
			expect(JSON.stringify(workflow.jobs.verify)).not.toContain(
				`needs.${job}.`,
			)
		},
	)

	it("runs no Tauri step and plays no story in any job", () => {
		expect(JSON.stringify(workflow.jobs)).not.toMatch(
			/tauri-apps|src-tauri|storybook|playwright/i,
		)
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
		["vitest", A_PULL_REQUEST, "bun scripts/ci.ts changed"],
		["vitest", A_PUSH_TO_MAIN, "bun scripts/ci.ts vitest"],
		["vitest", A_RELEASE_TAG, "bun scripts/ci.ts vitest"],
		["core", A_PULL_REQUEST, "bun scripts/ci.ts core"],
		["core", A_PUSH_TO_MAIN, "bun scripts/ci.ts core"],
		["core", A_RELEASE_TAG, "bun scripts/ci.ts core"],
	] as const)(
		"has %s run one gate through bun scripts/ci.ts on %p",
		(job, github, command) => {
			const gateSteps = runStepsOf(job).filter(
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

	it.each(CI_JOBS.filter((group) => group !== "ios"))(
		"%s bounds its gate by the job timeout only",
		(job) => {
			const stepTimeouts = (workflow.jobs[job]?.steps ?? []).flatMap(
				(step) => step["timeout-minutes"] ?? [],
			)

			expect(stepTimeouts).toEqual([])
		},
	)

	it("runs core on Linux, macOS and Windows", () => {
		expect(workflow.jobs.core?.strategy).toEqual({
			"fail-fast": false,
			matrix: { os: ["ubuntu-latest", "macos-latest", "windows-latest"] },
		})
		expect(JSON.stringify(workflow.jobs.core)).toContain(
			'"runs-on":"${{ matrix.os }}"',
		)
	})

	it("runs the installer when changes selects it, and has verify require it then and its skip otherwise", () => {
		const selected = "needs.changes.outputs.installer == 'true'"

		expect(workflow.jobs.installer?.if).toBe(selected)
		expect(verifyCondition("installer")).toBe(
			`needs.installer.result != (${selected} && 'success' || 'skipped')`,
		)
	})

	it("builds the NSIS installer on Windows, installs it silently, launches it once and uploads the log", () => {
		const steps = workflow.jobs.installer?.steps ?? []
		const runs = steps.map((step) => step.run ?? "").join("\n")
		const upload = steps.find((step) =>
			step.uses?.startsWith("actions/upload-artifact@"),
		)

		expect(JSON.stringify(workflow.jobs.installer)).toContain(
			'"runs-on":"windows-latest"',
		)
		expect(runs).toContain("apps/rune-preview/scripts/package-windows.sh")
		expect(runs).toContain("apps/rune-preview/scripts/install-windows.ps1")
		expect(upload?.if).toBe("always()")
		expect(upload?.with?.path).toBe("${{ runner.temp }}/install-log")
	})

	it("starts lint without changes on every event, and has verify require it", () => {
		expect(workflow.jobs.lint?.needs).toBeUndefined()
		expect(workflow.jobs.lint?.if).toBeUndefined()
		expect(verifyCondition("lint")).toBe("needs.lint.result != 'success'")
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

	it("bounds ios by 60 minutes, and its gate by 45 inside them", () => {
		expect(workflow.jobs.ios?.["timeout-minutes"]).toBe(60)
		expect(stepNamed("ios", "Gate")?.["timeout-minutes"]).toBe(45)
	})

	it("splits ios over three jobs, each told its shard out of the matrix size", () => {
		expect(workflow.jobs.ios?.strategy).toEqual({
			"fail-fast": false,
			matrix: { shard: [1, 2, 3] },
		})
		const shards = workflow.jobs.ios?.strategy?.matrix?.shard ?? []

		expect(
			shards.map((shard) =>
				interpolate(workflow.jobs.ios?.env?.IOS_SHARD ?? "", {
					matrix: { shard },
					strategy: { "job-total": shards.length },
				}),
			),
		).toEqual(["1/3", "2/3", "3/3"])
	})

	it.each([
		[A_PULL_REQUEST, "pull_request"],
		[A_PUSH_TO_MAIN, "push"],
		[A_RELEASE_TAG, "tag"],
	])("hands changes the event of %p as %s", (github, event) => {
		expect(ciEventOf(github)).toBe(event)
	})

	it("triggers on a push and a pull_request only", () => {
		expect(workflow.on).toEqual({
			push: { branches: ["main"], tags: ["v*"] },
			pull_request: { branches: ["main"] },
		})
	})

	it("runs only changes, lint, vitest, core and installer on a pull_request", () => {
		expect(jobsRunningOn(A_PULL_REQUEST)).toEqual(PULL_REQUEST_JOB_SET)
	})

	it("runs every job on a push to main", () => {
		expect(jobsRunningOn(A_PUSH_TO_MAIN)).toEqual(PUSH_TO_MAIN_JOB_SET)
	})

	it("runs core and website on a v* tag, never ios nor the installer", () => {
		expect(jobsRunningOn(A_RELEASE_TAG)).toEqual([
			"changes",
			"core",
			"lint",
			"verify",
			"vitest",
			"website",
		])
	})

	it.each([A_PULL_REQUEST, A_PUSH_TO_MAIN, A_RELEASE_TAG])(
		"has verify pass on %p when every job succeeded or was skipped by rule",
		(github) => {
			expect(failingVerifySteps(github, resultsByRule(github))).toEqual([])
		},
	)

	it.each(
		PUSH_TO_MAIN_JOB_SET.filter((job) => job !== "verify").flatMap((job) => [
			[job, "failure"],
			[job, "skipped"],
		]),
	)("has verify fail on a push to main when %s ended %s", (job, result) => {
		const results = { ...resultsByRule(A_PUSH_TO_MAIN), [job]: result }

		expect(failingVerifySteps(A_PUSH_TO_MAIN, results)).not.toEqual([])
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

	it("skips core on a pull_request whose paths leave the core filter unselected, and has verify accept the skip", () => {
		const scope = {
			github: A_PULL_REQUEST,
			needs: {
				core: { result: "skipped" },
				changes: {
					result: "success",
					outputs: outputsOn(A_PULL_REQUEST, ["apps/website/src/main.tsx"]),
				},
			},
		}

		expect(evaluate(workflow.jobs.core?.if ?? "true", scope)).toBe(false)
		expect(evaluate(verifyCondition("core") ?? "true", scope)).toBe(false)
	})

	it.each(["website", "ios"])(
		"has verify fail on a pull_request when %s ran",
		(job) => {
			const results = { ...resultsByRule(A_PULL_REQUEST), [job]: "success" }

			expect(failingVerifySteps(A_PULL_REQUEST, results)).not.toEqual([])
		},
	)

	it("diffs a push to main against the head of the last green push run on main, never the commit it replaced", () => {
		const changes = workflow.jobs.changes
		const steps = changes?.steps ?? []
		const greenIndex = steps.findIndex((step) => step.id === "green")
		const decideIndex = steps.findIndex((step) => step.id === "filter")
		const lookup = steps[greenIndex]?.run ?? ""
		const scope = {
			...scopeOf(A_PUSH_TO_MAIN),
			steps: { green: { outputs: { sha: "last-green" } } },
		}

		expect(evaluate(steps[greenIndex]?.if ?? "false", scope)).toBe(true)
		for (const filter of [
			"--workflow ci.yml",
			"--event push",
			"--branch main",
			"--status success",
			"--limit 1",
		])
			expect(lookup).toContain(filter)
		expect(changes?.permissions).toEqual({ actions: "read", contents: "read" })
		expect(greenIndex).toBeLessThan(decideIndex)
		expect(interpolate(steps[decideIndex]?.env?.BASE ?? "", scope)).toBe(
			"last-green",
		)
		expect(JSON.stringify(changes)).not.toContain("event.before")
	})

	const runGreenLookup = (fakeGh: string) => {
		const bin = mkdtempSync(join(tmpdir(), "kiroshi-ci-test-gh-"))
		const output = join(bin, "github-output")
		writeFileSync(join(bin, "gh"), `#!/bin/sh\n${fakeGh}\n`, { mode: 0o755 })
		writeFileSync(output, "")
		const step = (workflow.jobs.changes?.steps ?? []).find(
			(candidate) => candidate.id === "green",
		)
		const run = Bun.spawnSync(
			[
				"bash",
				"--noprofile",
				"--norc",
				"-eo",
				"pipefail",
				"-c",
				step?.run ?? "",
			],
			{
				env: {
					PATH: `${bin}:${process.env.PATH}`,
					GITHUB_OUTPUT: output,
					GITHUB_REPOSITORY: "acme/repo",
				},
			},
		)
		const lookup = {
			exitCode: run.exitCode,
			log: run.stdout.toString(),
			output: readFileSync(output, "utf8"),
		}
		rmSync(bin, { recursive: true, force: true })
		return lookup
	}

	it("hands ci-changes the head of the last green push run on main", () => {
		expect(runGreenLookup("echo last-green-sha")).toEqual({
			exitCode: 0,
			log: "",
			output: "sha=last-green-sha\n",
		})
	})

	it("hands ci-changes an empty sha and warns, exiting 0, when gh run list fails", () => {
		const lookup = runGreenLookup("echo 'HTTP 502' >&2; exit 4")

		expect(lookup.exitCode).toBe(0)
		expect(lookup.output).toBe("sha=\n")
		expect(lookup.log).toBe(
			"::warning::gh run list exited 4 reading the last green push to main: every job runs\n",
		)
	})

	it.each([A_PULL_REQUEST, A_RELEASE_TAG])(
		"looks up no green push run on %p",
		(github) => {
			const green = (workflow.jobs.changes?.steps ?? []).find(
				(step) => step.id === "green",
			)

			expect(evaluate(green?.if ?? "true", scopeOf(github))).toBe(false)
		},
	)

	it("fetches the base of a pull_request only, a push to main fetching its green base in scripts/ci-changes.ts", () => {
		const fetch = (workflow.jobs.changes?.steps ?? []).find(
			(step) => step.name === "Fetch the base to diff against",
		)
		const fetchesOn = (github: GitHubContext) =>
			evaluate(fetch?.if ?? "true", scopeOf(github))

		expect(fetchesOn(A_PULL_REQUEST)).toBe(true)
		expect(fetchesOn(A_PUSH_TO_MAIN)).toBe(false)
		expect(fetchesOn(A_RELEASE_TAG)).toBe(false)
	})

	const concurrencyOf = (github: GitHubContext) => {
		const scope = scopeOf({ ...github, workflow: "CI" })
		return {
			group: interpolate(workflow.concurrency.group, scope),
			cancelsInProgress: interpolate(
				workflow.concurrency["cancel-in-progress"],
				scope,
			),
		}
	}

	it.each([
		[pushToMain(7), "CI-refs/heads/main", "false"],
		[pullRequest(7, 11), "CI-refs/pull/7/merge", "true"],
		[releaseTag(9), "CI-9", "false"],
	])(
		"puts %p in the concurrency group %s, cancel-in-progress %s",
		(github, group, cancelsInProgress) => {
			expect(concurrencyOf(github)).toEqual({ group, cancelsInProgress })
		},
	)

	it("queues a push to main behind the run of an earlier push to main", () => {
		expect(concurrencyOf(pushToMain(8))).toEqual(concurrencyOf(pushToMain(7)))
		expect(concurrencyOf(pushToMain(8)).cancelsInProgress).toBe("false")
	})

	it("keeps one concurrency group per pull_request ref", () => {
		expect(concurrencyOf(pullRequest(7, 12)).group).toBe(
			concurrencyOf(pullRequest(7, 11)).group,
		)
		expect(concurrencyOf(pullRequest(8, 12)).group).not.toBe(
			concurrencyOf(pullRequest(7, 11)).group,
		)
	})

	it("never cancels a v* tag run, nor lets it cancel a push to main", () => {
		const tag = concurrencyOf(releaseTag(9))

		expect(tag.cancelsInProgress).toBe("false")
		expect(concurrencyOf(releaseTag(10)).group).not.toBe(tag.group)
		expect(tag.group).not.toBe(concurrencyOf(pushToMain(9)).group)
	})

	it("has verify wait on every job", () => {
		expect(workflow.jobs.verify?.needs).toEqual([
			"changes",
			"lint",
			"vitest",
			"website",
			"core",
			"installer",
			"ios",
		])
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

	it("has release.yml publish only after the draft job, the Rune packages and their feed", () => {
		expect(releaseWorkflow.jobs.publish?.needs).toEqual([
			"draft",
			"rune",
			"feed",
		])
	})

	it("has release.yml build the Rune packages only once ci-green passed and the draft exists", () => {
		expect(releaseWorkflow.jobs.draft?.needs).toBe("ci-green")
		expect(releaseWorkflow.jobs.rune?.needs).toEqual(["ci-green", "draft"])
	})

	it("has every Rune job sign its package with the updater key and attach it to the tag", () => {
		const runs = (releaseWorkflow.jobs.rune?.steps ?? []).map(
			(step) => step.run ?? "",
		)

		expect(runs.some((run) => run.includes("signer sign"))).toBe(true)
		expect(
			runs.some((run) => run.includes('gh release upload "$GITHUB_REF_NAME"')),
		).toBe(true)
	})

	it("builds no Tauri bundle on a v* tag", () => {
		expect(releaseWorkflow.jobs.release).toBeUndefined()
		expect(JSON.stringify(releaseWorkflow.jobs)).not.toContain("tauri-action")
	})

	it("has the feed job write latest.json from the Rune signatures and attach it to the draft", () => {
		const runs = (releaseWorkflow.jobs.feed?.steps ?? [])
			.map((step) => step.run ?? "")
			.join("\n")

		expect(releaseWorkflow.jobs.feed?.needs).toEqual(["draft", "rune"])
		expect(runs).toContain("--pattern '*.sig'")
		expect(runs).toContain("bun scripts/updater-feed.ts")
		expect(runs).toContain(
			'gh release upload "$GITHUB_REF_NAME" "$RUNNER_TEMP/latest.json"',
		)
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

describe("the ios shards", () => {
	const UI_TESTS = new URL("../apps/ios/KiroshiUITests/", import.meta.url)
	const TEST_PLAN = new URL("../apps/ios/Kiroshi.xctestplan", import.meta.url)
	const CLASSES = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"]

	it("reads k/n and refuses anything else", () => {
		expect(parsedShard("2/3")).toEqual({ index: 2, count: 3 })
		for (const text of ["0/3", "4/3", "3", "a/b", "1/3/1", ""]) {
			expect(() => parsedShard(text)).toThrow(`IOS_SHARD is "${text}"`)
		}
	})

	it("gives the unit tests to the first shard and deals the UI classes in turn", () => {
		expect(shardTests({ index: 1, count: 2 }, CLASSES)).toEqual([
			"KiroshiTests",
			"KiroshiUITests/Alpha",
			"KiroshiUITests/Charlie",
			"KiroshiUITests/Echo",
		])
		expect(shardTests({ index: 2, count: 2 }, CLASSES)).toEqual([
			"KiroshiUITests/Bravo",
			"KiroshiUITests/Delta",
		])
	})

	it("runs every UI class once over the three shards", () => {
		const classes = uiTestClasses()
		const dealt = [1, 2, 3].flatMap((index) =>
			shardTests({ index, count: 3 }, classes),
		)

		expect(dealt.filter((test) => test === "KiroshiTests")).toHaveLength(1)
		expect(dealt.filter((test) => test !== "KiroshiTests").sort()).toEqual(
			classes.map((name) => `KiroshiUITests/${name}`).sort(),
		)
	})

	it("names each UI class after its file, every other test class being skipped by the plan", () => {
		const declared = readdirSync(UI_TESTS)
			.filter((file) => file.endsWith(".swift"))
			.flatMap((file) =>
				[
					...readFileSync(new URL(file, UI_TESTS), "utf8").matchAll(
						/class (\w+): XCTestCase/g,
					),
				].map((match) => match[1]),
			)
		const plan = JSON.parse(readFileSync(TEST_PLAN, "utf8")) as {
			testTargets: { skippedTests?: string[]; target: { name: string } }[]
		}
		const skipped =
			plan.testTargets.find(({ target }) => target.name === "KiroshiUITests")
				?.skippedTests ?? []

		expect(declared.sort()).toEqual([...uiTestClasses(), ...skipped].sort())
	})
})

describe("the step timings", () => {
	it("reads minutes and seconds", () => {
		expect(elapsedText(0)).toBe("0m 0s")
		expect(elapsedText(59_499)).toBe("0m 59s")
		expect(elapsedText(2_771_600)).toBe("46m 12s")
	})
})
