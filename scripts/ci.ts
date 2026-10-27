import { appendFileSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { touchedJobs } from "./ci-changes"
import {
	SCANNED_MODULE,
	TEST_SOURCE_ROOTS,
	testImportersByModule,
} from "./test-importers"

type Retry = "vitest" | "cargo"

export type Step = {
	name: string
	command: string
	cwd?: string
	heavy?: true
	retry?: Retry
}

const REPO = fileURLToPath(new URL("..", import.meta.url))

const SLOT = join(REPO, "scripts/slot.sh")

const APP = "apps/app"

const SRC_TAURI = join(APP, "src-tauri")

const RETRYING_EVENT = "merge_group"

const SIMULATOR_DESTINATION =
	'-destination "platform=iOS Simulator,id=$SIMULATOR"'

const RUSTFMT: Step = {
	name: "Rustfmt",
	command: "cargo fmt --manifest-path src-tauri/Cargo.toml --check",
	cwd: APP,
}

const BUILD_SIDECAR: Step = {
	name: "Build sidecar",
	command: "bun run --filter sidecar build",
	heavy: true,
}

const CLIPPY: Step = {
	name: "Clippy",
	command:
		"cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --features fake-claude -- -D warnings",
	cwd: APP,
	heavy: true,
}

const PR_DEQUEUE_UNIT_TESTS: Step = {
	name: "PR dequeue script unit tests",
	command: "bun run test:pr-dequeue",
}

const PR_ENQUEUE_UNIT_TESTS: Step = {
	name: "PR enqueue script unit tests",
	command: "bun run test:pr-enqueue",
}

const QUEUE_SCRIPT_UNIT_TESTS = [
	{
		step: PR_DEQUEUE_UNIT_TESTS,
		paths: ["scripts/pr-dequeue.sh", "scripts/pr-dequeue.test.ts"],
	},
	{
		step: PR_ENQUEUE_UNIT_TESTS,
		paths: ["scripts/pr-enqueue.sh", "scripts/pr-enqueue.test.ts"],
	},
]

const BINDINGS_MATCH: Step = {
	name: "Bindings match the command surface",
	command: "git diff --exit-code apps/app/src/lib/bindings.ts",
}

export const RUST_PULL_REQUEST_STEPS: Step[] = [
	RUSTFMT,
	BUILD_SIDECAR,
	CLIPPY,
	{
		name: "Library tests",
		command:
			"cargo test --manifest-path src-tauri/Cargo.toml --features fake-claude --lib",
		cwd: APP,
		heavy: true,
	},
	{
		name: "Integration tests",
		command:
			"cargo test --manifest-path src-tauri/Cargo.toml --features fake-claude --test '*'",
		cwd: APP,
		heavy: true,
	},
	BINDINGS_MATCH,
]

export const GATE = {
	lint: [
		{ name: "Biome format", command: "bun run format" },
		{ name: "Baseline unit tests", command: "bun run test:baseline" },
		{
			name: "CI change detection unit tests",
			command: "bun run test:ci-changes",
		},
		{ name: "Red main reporter unit tests", command: "bun run test:red-main" },
		PR_DEQUEUE_UNIT_TESTS,
		PR_ENQUEUE_UNIT_TESTS,
		{ name: "Gate definition matches ci.yml", command: "bun run test:ci" },
		{
			name: "Biome and knip against the baseline",
			command: "bun run baseline lint",
		},
		{ name: "Types", command: "bun run types" },
		{ name: "Regenerate the colour tokens", command: "bun run tokens:build" },
		{
			name: "Colour CSS matches tokens.json",
			command: "git diff --exit-code packages/ui/src/styles/tokens.css",
		},
		{
			name: "Colour asset catalogue matches tokens.json",
			command:
				"git add --intent-to-add apps/ios/Kiroshi/Colors.xcassets && git diff --exit-code apps/ios/Kiroshi/Colors.xcassets",
		},
		{
			name: "iOS avatar bundle matches the avatar module",
			command:
				"bun run avatar:build && git diff --exit-code apps/ios/Kiroshi/Resources",
		},
	],
	"rust-check": [
		RUSTFMT,
		BUILD_SIDECAR,
		CLIPPY,
		{
			name: "Regenerate the bindings",
			command:
				"cargo test --manifest-path src-tauri/Cargo.toml --features fake-claude --test bindings",
			cwd: APP,
			heavy: true,
		},
		BINDINGS_MATCH,
	],
	vitest: [
		{
			name: "Unit tests, website, sidecar and story ids against the baseline",
			command: "bun run baseline vitest",
			retry: "vitest",
		},
	],
	website: [{ name: "Build website", command: "bun run build:website" }],
	rust: [
		RUSTFMT,
		BUILD_SIDECAR,
		CLIPPY,
		{
			name: "Test",
			command:
				"cargo test --manifest-path src-tauri/Cargo.toml --features fake-claude",
			cwd: APP,
			heavy: true,
			retry: "cargo",
		},
		BINDINGS_MATCH,
	],
	storybook: [
		{
			name: "Stories played in chromium against the baseline",
			command: "bun run baseline storybook",
			heavy: true,
			retry: "vitest",
		},
	],
	ios: [
		{ name: "Generate", command: "bun run ios:generate" },
		{
			name: "Build for testing",
			command: `apps/ios/scripts/xcodebuild.sh -project apps/ios/Kiroshi.xcodeproj -scheme Kiroshi -testPlan Kiroshi ${SIMULATOR_DESTINATION} -derivedDataPath apps/ios/build build-for-testing`,
			heavy: true,
		},
		{
			name: "Test on the simulator",
			command: `apps/ios/scripts/xcodebuild.sh -project apps/ios/Kiroshi.xcodeproj -scheme Kiroshi -testPlan Kiroshi ${SIMULATOR_DESTINATION} -derivedDataPath apps/ios/build -parallel-testing-enabled NO -collect-test-diagnostics never test-without-building`,
			heavy: true,
		},
		{
			name: "Swift format",
			command: "swift format lint --recursive --strict apps/ios",
		},
	],
} satisfies Record<string, Step[]>

export type Group = keyof typeof GATE

export const GROUP_ORDER: Group[] = [
	"lint",
	"rust-check",
	"vitest",
	"website",
	"rust",
	"storybook",
	"ios",
]

const OFF_PULL_REQUEST_TRIGGERS: Partial<Record<Group, string>> = {
	website: "on a merge_group and on a v* tag",
	storybook: "on a merge_group and on a v* tag",
	ios: "on a push to main only",
}

// ci:fast is the pre-push check and must stay green and under 120 s with a
// dozen agents loading the machine, which the full unit set cannot do. It
// runs the format, Biome and knip against the baseline, the types, the unit
// test step bun scripts/ci.ts changed picks for the same diff, and the
// pr-dequeue or pr-enqueue script tests when the diff touches that script or
// its tests. bun run ci and the CI jobs keep the rest: the perf set, the
// stories, the website and sidecar suites, rust, the website build and ios.
export const FAST_STEP_NAMES = [
	"Biome format",
	"Biome and knip against the baseline",
	"Types",
]

export const CHANGED_UNIT_TESTS: Step = {
	name: "Unit tests changed since origin/main against the baseline",
	command: "bun run baseline changed",
}

export const SHARED_IMPORTER_THRESHOLD = 20

export const SHARED_PATH_RULES = [
	"packages/ui/src/tokens/**",
	"packages/ui/src/tokens.*",
	"packages/ui/tokens.json",
	"packages/ui/src/styles/**",
	"packages/ui/src/lib/**",
	"packages/shared/**",
	"apps/app/src/lib/**",
	"apps/app/vitest.config.ts",
	"packages/ui/vitest.config.ts",
	"baselines/**",
]

export type UnitTestScope =
	| { scope: "changed"; graphMs?: number }
	| { scope: "full"; path: string; rule: string }
	| { scope: "full"; path: string; importers: number; graphMs: number }
	| { scope: "full"; error: string; graphMs: number }

type ScopeInputs = { changedPaths: string[]; repo: string }

const GRAPHED_ROOTS = [...TEST_SOURCE_ROOTS, "packages/shared/"]

const sharedRuleOf = (path: string) =>
	SHARED_PATH_RULES.find((rule) => new Bun.Glob(rule).match(path))

const isGraphedModule = (path: string) =>
	SCANNED_MODULE.test(path) &&
	GRAPHED_ROOTS.some((root) => path.startsWith(root))

const scopeFromImportGraph = ({
	changedPaths,
	repo,
}: ScopeInputs): UnitTestScope => {
	const started = performance.now()
	const elapsed = () => Math.round(performance.now() - started)
	try {
		const importers = testImportersByModule(repo)
		const graphMs = elapsed()
		for (const path of changedPaths) {
			const count = importers.get(path) ?? 0
			if (count >= SHARED_IMPORTER_THRESHOLD)
				return { scope: "full", path, importers: count, graphMs }
		}
		return { scope: "changed", graphMs }
	} catch (failure) {
		return { scope: "full", error: String(failure), graphMs: elapsed() }
	}
}

export const unitTestScope = ({
	changedPaths,
	repo,
}: ScopeInputs): UnitTestScope => {
	for (const path of changedPaths) {
		const rule = sharedRuleOf(path)
		if (rule !== undefined) return { scope: "full", path, rule }
	}
	const graphed = changedPaths.filter(isGraphedModule)
	if (graphed.length === 0) return { scope: "changed" }
	return scopeFromImportGraph({ changedPaths: graphed, repo })
}

const graphTime = (scope: UnitTestScope) =>
	"graphMs" in scope && scope.graphMs !== undefined
		? `, import graph build took ${scope.graphMs} ms`
		: ""

const scopeReason = (scope: UnitTestScope) => {
	if (scope.scope === "changed")
		return "changed test files: no changed path is shared"
	if ("rule" in scope)
		return `full suite: ${scope.path} is shared (${scope.rule})`
	if ("importers" in scope)
		return `full suite: ${scope.path} is shared (${scope.importers} test files reach it, threshold ${SHARED_IMPORTER_THRESHOLD})`
	return `full suite: building the import graph failed: ${scope.error}`
}

export const scopeLine = (scope: UnitTestScope) =>
	`ci  unit test scope: ${scopeReason(scope)}${graphTime(scope)}`

export const unitTestSteps = (scope?: UnitTestScope) =>
	scope?.scope === "changed" ? [CHANGED_UNIT_TESTS] : GATE.vitest

export const SIMULATOR_LOOKUP = `xcrun simctl list devices available "iOS $(cat .xcode-version)" | grep -m1 -E '^ +iPhone 17 \\(' | grep -oE '[0-9A-F-]{36}'`

const gateSteps = (): Step[] => GROUP_ORDER.flatMap((group) => GATE[group])

const touchedQueueScriptUnitTests = (changedPaths: string[]) =>
	QUEUE_SCRIPT_UNIT_TESTS.filter(({ paths }) =>
		paths.some((path) => changedPaths.includes(path)),
	).map(({ step }) => step)

export const fastSteps = (
	changedPaths: string[],
	scope?: UnitTestScope,
): Step[] => [
	...FAST_STEP_NAMES.map((name) => {
		const step = gateSteps().find((candidate) => candidate.name === name)
		if (!step) throw new Error(`ci:fast names "${name}", not a gate step`)
		return step
	}),
	...touchedQueueScriptUnitTests(changedPaths),
	...unitTestSteps(scope),
]

const isGroup = (name: string): name is Group => name in GATE

type Captured = { command: string[]; operation: string }

const captured = ({ command, operation }: Captured) => {
	const finished = Bun.spawnSync({
		cmd: command,
		cwd: REPO,
		stdout: "pipe",
		stderr: "pipe",
	})
	if (finished.exitCode !== 0) {
		throw new Error(
			`${operation} failed: ${command.join(" ")} exited with ${finished.exitCode}: ${finished.stderr.toString().trim()}`,
		)
	}
	return finished.stdout.toString().trim()
}

export const pathsChangedSinceMain = () => {
	const base = captured({
		command: ["git", "merge-base", "HEAD", "origin/main"],
		operation: "finding the merge base with origin/main",
	})
	return captured({
		command: ["git", "diff", "--name-only", base],
		operation: `listing the paths changed since ${base}`,
	})
		.split("\n")
		.filter(Boolean)
}

type TouchedJobs = ReturnType<typeof touchedJobs>

type GroupDecision = { group: Group; touched: TouchedJobs }

const filterOf = (group: Exclude<Group, "lint">) =>
	group === "rust-check" ? "rust" : group

export const offPullRequestNote = (group: Group) => {
	const triggers = OFF_PULL_REQUEST_TRIGGERS[group]
	return triggers
		? `${group} skips a pull_request, CI runs it ${triggers}`
		: undefined
}

export const skipReason = ({ group, touched }: GroupDecision) => {
	if (group === "ios") return "run bun run ci ios to run it here"
	if (group === "lint" || touched[filterOf(group)]) return undefined
	return "scripts/ci-changes.ts finds no path changed since the merge base with origin/main that touches it"
}

const lookUpSimulator = () => {
	const simulator = captured({
		command: ["bash", "-c", SIMULATOR_LOOKUP],
		operation: "finding the iPhone 17 simulator",
	})
	if (simulator.length === 0) {
		throw new Error("no available iPhone 17 simulator on the pinned iOS")
	}
	return simulator
}

const ensureSimulator = () => {
	// biome-ignore lint/suspicious/noUndeclaredEnvVars: scripts/ci.ts runs outside turbo, its cache never reads this variable
	const simulator = process.env.SIMULATOR || lookUpSimulator()
	process.env.SIMULATOR = simulator
	if (process.env.CI) return
	captured({
		command: ["xcrun", "simctl", "bootstatus", simulator, "-b"],
		operation: `booting the simulator ${simulator}`,
	})
}

type Labelled = { label: string; step: Step }

export const spawnedCommand = (step: Step) => {
	const command = ["bash", "-ec", step.command]
	return step.heavy ? [SLOT, ...command] : command
}

const runStep = ({ label, step }: Labelled) => {
	console.log(`\nci  ${label} / ${step.name}\n    $ ${step.command}`)
	const finished = Bun.spawnSync({
		cmd: spawnedCommand(step),
		cwd: join(REPO, step.cwd ?? ""),
		stdout: "inherit",
		stderr: "inherit",
		env: process.env,
	})
	if (finished.exitCode === 0) return true
	console.error(
		`\nci  failed: ${label} / ${step.name} (exit ${finished.exitCode})`,
	)
	return false
}

export const retryOf = (step: Step, event: string | undefined) =>
	event === RETRYING_EVENT ? step.retry : undefined

const shellQuoted = (text: string) => `'${text.replaceAll("'", "'\\''")}'`

export const vitestRetryStep = (step: Step): Step => ({
	...step,
	command: `${step.command} --retry`,
})

export const loggedCargoStep = (step: Step, log: string): Step => ({
	...step,
	command: `set -o pipefail; ${step.command} --no-fail-fast 2>&1 | tee ${shellQuoted(log)}`,
})

export type FailedRustTarget = {
	target: string
	file: string
	tests: string[]
	isAttributed: boolean
}

const RUST_TARGET_START = /^\s+(?:Running (?:unittests )?(\S+) \(|Doc-tests )/

const FAILED_RUST_TEST = /^test (.+) \.\.\. FAILED$/

const FAILED_RUST_RESULT = /^test result: FAILED\. \d+ passed; (\d+) failed;/

const RUST_RERUN_HINT = /^error: (?:doc)?test failed, to rerun pass `([^`]+)`/

const DOC_TESTS_TARGET = "--doc"

const SINGLE_RUST_TEST_PASSED = /^test result: ok\. 1 passed;/m

export const failedRustTargets = (output: string) => {
	const targets: FailedRustTarget[] = []
	let file = SRC_TAURI
	let tests: string[] = []
	let reportedFailures = -1
	for (const line of output.split("\n").map((raw) => raw.trimEnd())) {
		const start = RUST_TARGET_START.exec(line)
		if (start) {
			file = start[1] ? join(SRC_TAURI, start[1]) : SRC_TAURI
			tests = []
			reportedFailures = -1
		}
		const failedTest = FAILED_RUST_TEST.exec(line)?.[1]
		if (failedTest) tests.push(failedTest)
		const failures = FAILED_RUST_RESULT.exec(line)?.[1]
		if (failures) reportedFailures = Number(failures)
		const target = RUST_RERUN_HINT.exec(line)?.[1]
		if (target) {
			const isAttributed = tests.length > 0 && tests.length === reportedFailures
			targets.push({ target, file, tests, isAttributed })
			tests = []
			reportedFailures = -1
		}
	}
	return targets
}

type RustRerun = { target: string; file: string; test: string }

export const rustRerunStep = (
	step: Step,
	{ target, test }: RustRerun,
): Step => ({
	...step,
	command: `${step.command} ${target} -- ${target === DOC_TESTS_TARGET ? "" : "--exact "}${shellQuoted(test)}`,
})

export type RetriedTest = { file: string; name: string }

const escapedAnnotationData = (text: string) =>
	text.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A")

const escapedAnnotationProperty = (text: string) =>
	escapedAnnotationData(text).replaceAll(":", "%3A").replaceAll(",", "%2C")

export const retriedTestAnnotation = ({ file, name }: RetriedTest) =>
	`::warning file=${escapedAnnotationProperty(file)},title=Passed only on its retry::${escapedAnnotationData(`${file} :: ${name}`)}`

export const retriedTestSummary = (tests: RetriedTest[]) =>
	`### Passed only on its retry\n\n${tests.map(({ file, name }) => `- \`${file}\` :: ${name}`).join("\n")}\n\n`

export const reportRetriedTests = (tests: RetriedTest[]) => {
	if (tests.length === 0) return
	for (const test of tests) console.log(retriedTestAnnotation(test))
	// biome-ignore lint/suspicious/noUndeclaredEnvVars: scripts/ci.ts runs outside turbo, its cache never reads this variable
	const summary = process.env.GITHUB_STEP_SUMMARY
	if (summary) appendFileSync(summary, retriedTestSummary(tests))
}

const rerunPasses = (rerun: Step) => {
	console.log(`\nci  rerun\n    $ ${rerun.command}`)
	const finished = Bun.spawnSync({
		cmd: spawnedCommand(rerun),
		cwd: join(REPO, rerun.cwd ?? ""),
		stdout: "pipe",
		stderr: "inherit",
		env: process.env,
	})
	const output = finished.stdout.toString()
	process.stdout.write(output)
	return finished.exitCode === 0 && SINGLE_RUST_TEST_PASSED.test(output)
}

const runRustTestsWithRerun = ({ label, step }: Labelled) => {
	const log = join(mkdtempSync(join(tmpdir(), "kiroshi-ci-")), "cargo-test.log")
	if (runStep({ label, step: loggedCargoStep(step, log) })) return true
	const targets = failedRustTargets(readFileSync(log, "utf8"))
	const unattributed = targets
		.filter((target) => !target.isAttributed)
		.map((target) => target.target)
	if (targets.length === 0 || unattributed.length > 0) {
		console.error(
			`ci  no rerun: cargo test failed outside the tests it names${unattributed.length > 0 ? `, in ${unattributed.join(", ")}` : ""}`,
		)
		return false
	}
	const reruns = targets.flatMap(({ target, file, tests }) =>
		tests.map((test) => ({ target, file, test })),
	)
	const failedAgain = reruns.filter(
		(rerun) => !rerunPasses(rustRerunStep(step, rerun)),
	)
	for (const { target, test } of failedAgain) {
		console.error(`ci  failed on its retry too: ${test} (${target})`)
	}
	if (failedAgain.length > 0) return false
	reportRetriedTests(reruns.map(({ file, test }) => ({ file, name: test })))
	console.log(`ci  ${label} / ${step.name} passed on the rerun`)
	return true
}

const runWithRetry = ({ label, step }: Labelled) => {
	// biome-ignore lint/suspicious/noUndeclaredEnvVars: scripts/ci.ts runs outside turbo, its cache never reads this variable
	const retry = retryOf(step, process.env.GITHUB_EVENT_NAME)
	if (retry === "cargo") return runRustTestsWithRerun({ label, step })
	if (retry === "vitest") return runStep({ label, step: vitestRetryStep(step) })
	return runStep({ label, step })
}

const runSteps = (label: string, steps: Step[]) =>
	steps.every((step) => runWithRetry({ label, step }))

const runGroup = (group: Group) => {
	if (group === "ios") ensureSimulator()
	return runSteps(group, GATE[group])
}

const runGate = () => {
	const touched = touchedJobs(pathsChangedSinceMain())
	return GROUP_ORDER.every((group) => {
		const note = offPullRequestNote(group)
		if (note !== undefined) console.log(`\nci  ${note}`)
		const skipped = skipReason({ group, touched })
		if (skipped === undefined) return runGroup(group)
		console.log(`\nci  skipped ${group}: ${skipped}`)
		return true
	})
}

const decidedUnitTestScope = (changedPaths: string[]) => {
	const scope = unitTestScope({ changedPaths, repo: REPO })
	console.log(`\n${scopeLine(scope)}`)
	return scope
}

const runChangedUnitTests = () =>
	runSteps(
		"changed",
		unitTestSteps(decidedUnitTestScope(pathsChangedSinceMain())),
	)

const runFast = () => {
	const changedPaths = pathsChangedSinceMain()
	return runSteps(
		"fast",
		fastSteps(changedPaths, decidedUnitTestScope(changedPaths)),
	)
}

const runRequested = (argument: string | undefined) => {
	if (argument === undefined) return runGate()
	if (argument === "fast") return runFast()
	if (argument === "changed") return runChangedUnitTests()
	if (argument === "rust-pr")
		return runSteps("rust-pr", RUST_PULL_REQUEST_STEPS)
	if (isGroup(argument)) return runGroup(argument)
	throw new Error(
		`unknown argument "${argument}", expected fast, changed, rust-pr or one of ${GROUP_ORDER.join(", ")}`,
	)
}

if (import.meta.main) {
	try {
		const passed = runRequested(process.argv[2])
		if (passed) console.log("\nci  every step passed")
		process.exit(passed ? 0 : 1)
	} catch (failure) {
		console.error(`ci  ${(failure as Error).message}`)
		process.exit(1)
	}
}
