import { appendFileSync, mkdtempSync, readdirSync, readFileSync } from "node:fs"
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
	crateRoot?: string
}

const REPO = fileURLToPath(new URL("..", import.meta.url))

const SLOT = join(REPO, "scripts/slot.sh")

const CORE_CRATE = "crates/kiroshi-core"

const RUNE_WORKSPACE = "apps/rune-preview"

const RETRYING_REF = "refs/heads/main"

const UI_TESTS = join(REPO, "apps/ios/KiroshiUITests")

const SIMULATOR_DESTINATION =
	'-destination "platform=iOS Simulator,id=$SIMULATOR"'

const PR_DEQUEUE_UNIT_TESTS: Step = {
	name: "PR dequeue script unit tests",
	command: "bun run test:pr-dequeue",
}

const PR_ENQUEUE_UNIT_TESTS: Step = {
	name: "PR enqueue script unit tests",
	command: "bun run test:pr-enqueue",
}

const PR_MERGE_SUB_UNIT_TESTS: Step = {
	name: "PR merge sub script unit tests",
	command: "bun run test:pr-merge-sub",
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
	{
		step: PR_MERGE_SUB_UNIT_TESTS,
		paths: ["scripts/pr-merge-sub.sh", "scripts/pr-merge-sub.test.ts"],
	},
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
		{
			name: "Updater feed unit tests",
			command: "bun run test:updater-feed",
		},
		{
			name: "Colour set check unit tests",
			command: "bun run test:colour-sets",
		},
		PR_DEQUEUE_UNIT_TESTS,
		PR_ENQUEUE_UNIT_TESTS,
		PR_MERGE_SUB_UNIT_TESTS,
		{ name: "Gate definition matches ci.yml", command: "bun run test:ci" },
		{
			name: "Biome and knip against the baseline",
			command: "bun run baseline lint",
		},
		{ name: "Types", command: "bun run types" },
		{
			name: "Colour sets match tokens.json",
			command: "bun run tokens:check-sets",
		},
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
	vitest: [
		{
			name: "Unit tests, website, shared and sidecar suites against the baseline",
			command: "bun run baseline vitest",
			retry: "vitest",
		},
	],
	website: [{ name: "Build website", command: "bun run build:website" }],
	core: [
		{ name: "Rustfmt kiroshi-core", command: "cargo fmt --all --check" },
		{
			name: "Clippy kiroshi-core",
			command: "cargo clippy --workspace --all-targets --locked -- -D warnings",
			heavy: true,
		},
		{
			name: "Test kiroshi-core",
			command: "cargo test -p kiroshi-core --locked",
			heavy: true,
			retry: "cargo",
			crateRoot: CORE_CRATE,
		},
		{
			name: "Rustfmt the Rune app",
			command: "cargo fmt --all --check",
			cwd: RUNE_WORKSPACE,
		},
		{
			name: "Clippy the Rune app",
			command:
				"cargo clippy --workspace --all-targets --features fake-claude --locked -- -D warnings",
			cwd: RUNE_WORKSPACE,
			heavy: true,
		},
		{
			name: "Test the Rune app",
			command: "cargo test --workspace --features fake-claude --locked",
			cwd: RUNE_WORKSPACE,
			heavy: true,
			retry: "cargo",
			crateRoot: RUNE_WORKSPACE,
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
			command: `apps/ios/scripts/xcodebuild.sh -project apps/ios/Kiroshi.xcodeproj -scheme Kiroshi -testPlan Kiroshi ${SIMULATOR_DESTINATION} -derivedDataPath apps/ios/build -parallel-testing-enabled NO -collect-test-diagnostics never test-without-building $IOS_ONLY_TESTING`,
			heavy: true,
		},
		{
			name: "Swift format",
			command: "swift format lint --recursive --strict apps/ios",
		},
	],
} satisfies Record<string, Step[]>

export type Group = keyof typeof GATE

export const GROUP_ORDER: Group[] = ["lint", "vitest", "website", "core", "ios"]

const OFF_PULL_REQUEST_TRIGGERS: Partial<Record<Group, string>> = {
	website: "on a push to main and on a v* tag",
	ios: "on a push to main only",
}

// ci:fast is the pre-push check and must stay green and under 120 s with a
// dozen agents loading the machine, which the full unit set cannot do. It
// runs the format, Biome and knip against the baseline, the types, the unit
// test step bun scripts/ci.ts changed picks for the same diff, and the
// pr-dequeue, pr-enqueue or pr-merge-sub script tests when the diff touches that script
// or its tests. That unit test step runs the changed test files, or the
// whole unit project of the ui suite when a changed path is shared. bun run
// ci and the CI jobs keep the rest: every timing-bound test, the website,
// shared and sidecar suites, kiroshi-core and the Rune app, the website
// build and ios.
export const FAST_STEP_NAMES = [
	"Biome format",
	"Biome and knip against the baseline",
	"Types",
]

export const CHANGED_UNIT_TESTS: Step = {
	name: "Unit tests changed since origin/main against the baseline",
	command: "bun run baseline changed",
}

export const FULL_UNIT_TESTS: Step = {
	name: "Ui unit project against the baseline",
	command: "bun run baseline unit",
}

export const SHARED_IMPORTER_THRESHOLD = 20

export const SHARED_PATH_RULES = [
	"packages/ui/src/tokens/**",
	"packages/ui/src/tokens.*",
	"packages/ui/tokens.json",
	"packages/ui/src/styles/**",
	"packages/ui/src/lib/**",
	"packages/shared/**",
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

export const unitTestSteps = (scope: UnitTestScope) => [
	scope.scope === "changed" ? CHANGED_UNIT_TESTS : FULL_UNIT_TESTS,
]

export const SIMULATOR_LOOKUP = `xcrun simctl list devices available "iOS $(cat .xcode-version)" | grep -m1 -E '^ +iPhone 17 \\(' | grep -oE '[0-9A-F-]{36}'`

const gateSteps = (): Step[] => GROUP_ORDER.flatMap((group) => GATE[group])

const touchedQueueScriptUnitTests = (changedPaths: string[]) =>
	QUEUE_SCRIPT_UNIT_TESTS.filter(({ paths }) =>
		paths.some((path) => changedPaths.includes(path)),
	).map(({ step }) => step)

export const fastSteps = (
	changedPaths: string[],
	scope: UnitTestScope,
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

export const elapsedText = (milliseconds: number) => {
	const seconds = Math.round(milliseconds / 1000)
	return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

const runStep = ({ label, step }: Labelled) => {
	console.log(`\nci  ${label} / ${step.name}\n    $ ${step.command}`)
	const started = performance.now()
	const finished = Bun.spawnSync({
		cmd: spawnedCommand(step),
		cwd: join(REPO, step.cwd ?? ""),
		stdout: "inherit",
		stderr: "inherit",
		env: process.env,
	})
	const took = elapsedText(performance.now() - started)
	if (finished.exitCode === 0) {
		console.log(`\nci  passed: ${label} / ${step.name} in ${took}`)
		return true
	}
	console.error(
		`\nci  failed: ${label} / ${step.name} (exit ${finished.exitCode}) after ${took}`,
	)
	return false
}

export const retryOf = (step: Step, ref: string | undefined) =>
	ref === RETRYING_REF ? step.retry : undefined

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

export const failedRustTargets = (output: string, crateRoot: string) => {
	const targets: FailedRustTarget[] = []
	let file = crateRoot
	let tests: string[] = []
	let reportedFailures = -1
	for (const line of output.split("\n").map((raw) => raw.trimEnd())) {
		const start = RUST_TARGET_START.exec(line)
		if (start) {
			file = start[1] ? join(crateRoot, start[1]) : crateRoot
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
	const targets = failedRustTargets(
		readFileSync(log, "utf8"),
		step.crateRoot ?? step.cwd ?? ".",
	)
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
	const retry = retryOf(step, process.env.GITHUB_REF)
	if (retry === "cargo") return runRustTestsWithRerun({ label, step })
	if (retry === "vitest") return runStep({ label, step: vitestRetryStep(step) })
	return runStep({ label, step })
}

const runSteps = (label: string, steps: Step[]) =>
	steps.every((step) => runWithRetry({ label, step }))

export type Shard = { index: number; count: number }

export const parsedShard = (text: string): Shard => {
	const match = /^(\d+)\/(\d+)$/.exec(text)
	const index = Number(match?.[1])
	const count = Number(match?.[2])
	if (!match || index < 1 || index > count)
		throw new Error(`IOS_SHARD is "${text}", expected k/n with 1 <= k <= n`)
	return { index, count }
}

export const uiTestClasses = (directory = UI_TESTS) =>
	readdirSync(directory)
		.filter((name) => name.endsWith("Tests.swift"))
		.map((name) => name.slice(0, -".swift".length))
		.sort()

export const shardTests = ({ index, count }: Shard, classes: string[]) => [
	...(index === 1 ? ["KiroshiTests"] : []),
	...classes
		.filter((_, position) => position % count === index - 1)
		.map((name) => `KiroshiUITests/${name}`),
]

const selectIosTests = () => {
	// biome-ignore lint/suspicious/noUndeclaredEnvVars: scripts/ci.ts runs outside turbo, its cache never reads this variable
	const shard = process.env.IOS_SHARD
	if (!shard) {
		process.env.IOS_ONLY_TESTING = ""
		console.log("\nci  ios runs every test of the Kiroshi plan")
		return
	}
	const tests = shardTests(parsedShard(shard), uiTestClasses())
	process.env.IOS_ONLY_TESTING = tests
		.map((test) => `-only-testing:${test}`)
		.join(" ")
	console.log(`\nci  ios shard ${shard} runs ${tests.join(", ")}`)
}

const runGroup = (group: Group) => {
	if (group === "ios") {
		ensureSimulator()
		selectIosTests()
	}
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
	if (isGroup(argument)) return runGroup(argument)
	throw new Error(
		`unknown argument "${argument}", expected fast, changed or one of ${GROUP_ORDER.join(", ")}`,
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
