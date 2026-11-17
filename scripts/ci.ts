import {
	appendFileSync,
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { touchedJobs } from "./ci-changes"
import {
	SCANNED_MODULE,
	TEST_FILE,
	TEST_SOURCE_ROOTS,
	type TestImports,
	testFilesGuarding,
	testImports,
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

const RETRYING_REF = "refs/heads/main"

const UI_TESTS = join(REPO, "apps/ios/KiroshiUITests")

const SIMULATOR_DESTINATION =
	'-destination "platform=iOS Simulator,id=$SIMULATOR"'

const IOS_SHARD_TEST_LOG = "apps/ios/build/shard-test.log"

const IOS_GENERATE: Step = { name: "Generate", command: "bun run ios:generate" }

const IOS_BUILD_FOR_TESTING: Step = {
	name: "Build for testing",
	command: `apps/ios/scripts/xcodebuild.sh -project apps/ios/Kiroshi.xcodeproj -scheme Kiroshi -testPlan Kiroshi ${SIMULATOR_DESTINATION} -derivedDataPath apps/ios/build build-for-testing`,
	heavy: true,
}

const IOS_SWIFT_FORMAT: Step = {
	name: "Swift format",
	command: "swift format lint --recursive --strict apps/ios",
}

export const IOS_BUILD_STEPS: Step[] = [
	IOS_GENERATE,
	IOS_BUILD_FOR_TESTING,
	IOS_SWIFT_FORMAT,
]

export const IOS_SHARD_STEPS: Step[] = [
	{
		name: "Test on the simulator",
		command: `set -o pipefail; apps/ios/scripts/xcodebuild.sh -xctestrun apps/ios/build/Build/Products/*.xctestrun ${SIMULATOR_DESTINATION} -derivedDataPath apps/ios/build -parallel-testing-enabled NO -collect-test-diagnostics never test-without-building $IOS_ONLY_TESTING | tee ${IOS_SHARD_TEST_LOG}`,
		heavy: true,
	},
]

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

const PR_MERGE_INTEGRATION_UNIT_TESTS: Step = {
	name: "PR integration merge script unit tests",
	command: "bun run test:pr-merge-integration",
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
		step: PR_MERGE_INTEGRATION_UNIT_TESTS,
		paths: [
			"scripts/pr-merge-integration.sh",
			"scripts/pr-merge-integration.test.ts",
		],
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
		name: "Library and integration tests",
		command:
			"cargo test --manifest-path src-tauri/Cargo.toml --features fake-claude --lib --test '*'",
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
		{
			name: "Colour set check unit tests",
			command: "bun run test:colour-sets",
		},
		PR_DEQUEUE_UNIT_TESTS,
		PR_ENQUEUE_UNIT_TESTS,
		PR_MERGE_INTEGRATION_UNIT_TESTS,
		{
			name: "CODEOWNERS matcher unit tests",
			command: "bun run test:code-owners",
		},
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
		IOS_GENERATE,
		IOS_BUILD_FOR_TESTING,
		{
			name: "Test on the simulator",
			command: `apps/ios/scripts/xcodebuild.sh -project apps/ios/Kiroshi.xcodeproj -scheme Kiroshi -testPlan Kiroshi ${SIMULATOR_DESTINATION} -derivedDataPath apps/ios/build -parallel-testing-enabled NO -collect-test-diagnostics never test-without-building $IOS_ONLY_TESTING`,
			heavy: true,
		},
		IOS_SWIFT_FORMAT,
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
	website: "on a push to main and on a v* tag",
	storybook:
		"on a push to main, on a v* tag and on a pull_request labelled ci:storybook",
	ios: "on a push to main and on a pull_request labelled ci:ios",
}

// ci:fast is the pre-push check and must stay green and under 120 s with a
// dozen agents loading the machine, which the full unit set cannot do. It
// runs the format, Biome and knip against the baseline, the types, the
// pr-dequeue or pr-enqueue script tests when the diff touches that script
// or its tests, then the changed test files. A shared changed module adds
// the test files importing it directly, then walks up the modules that only
// gather imports and re-export them, adding the tests importing each and
// the own test file of each module consuming one, never the whole unit
// projects, which only a shared path outside the import graph or a failed
// graph build brings back. Its unit tests time out after FAST_TEST_TIMEOUT_MS so
// a loaded machine slows them without failing them, and it reports its
// wall time against FAST_LIMIT_SECONDS without failing on it. The pull
// request job keeps the widening of bun scripts/ci.ts changed, and bun run
// ci and the CI jobs keep the rest: the perf set, the stories, the website
// and sidecar suites, rust, the website build and ios.
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
	name: "App and ui unit projects against the baseline",
	command: "bun run baseline unit",
}

export const FAST_LIMIT_SECONDS = 120

export const FAST_TEST_TIMEOUT_MS = 30_000

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
		const { importers } = testImports(repo)
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

const graphTime = (scope: UnitTestScope | FastUnitTestScope) =>
	"graphMs" in scope && scope.graphMs !== undefined
		? `, import graph build took ${scope.graphMs} ms`
		: ""

const importerReason = (importers: number) =>
	`${importers} test files reach it, threshold ${SHARED_IMPORTER_THRESHOLD}`

const scopeReason = (scope: UnitTestScope) => {
	if (scope.scope === "changed")
		return "changed test files: no changed path is shared"
	if ("rule" in scope)
		return `the app and ui unit projects: ${scope.path} is shared (${scope.rule})`
	if ("importers" in scope)
		return `the app and ui unit projects: ${scope.path} is shared (${importerReason(scope.importers)})`
	return `the app and ui unit projects: building the import graph failed: ${scope.error}`
}

export const scopeLine = (scope: UnitTestScope) =>
	`ci  unit test scope: ${scopeReason(scope)}${graphTime(scope)}`

export const unitTestSteps = (scope: UnitTestScope) => [
	scope.scope === "changed" ? CHANGED_UNIT_TESTS : FULL_UNIT_TESTS,
]

export type SharedModule = { path: string; reason: string; testFiles: string[] }

export type FastUnitTestScope =
	| Exclude<UnitTestScope, { importers: number }>
	| { scope: "importers"; shared: SharedModule[]; graphMs: number }

const sharedReason = (path: string, importers: TestImports["importers"]) => {
	const rule = sharedRuleOf(path)
	if (rule !== undefined) return rule
	const count = importers.get(path) ?? 0
	return count >= SHARED_IMPORTER_THRESHOLD ? importerReason(count) : undefined
}

const sharedModulesOf = ({ changedPaths, repo }: ScopeInputs) => {
	const imports = testImports(repo)
	return changedPaths.flatMap((path) => {
		const reason = sharedReason(path, imports.importers)
		if (reason === undefined) return []
		const testFiles = testFilesGuarding({ repo, imports, path })
		return [{ path, reason, testFiles }]
	})
}

export const fastUnitTestScope = ({
	changedPaths,
	repo,
}: ScopeInputs): FastUnitTestScope => {
	for (const path of changedPaths) {
		const rule = sharedRuleOf(path)
		if (rule !== undefined && !isGraphedModule(path))
			return { scope: "full", path, rule }
	}
	const graphed = changedPaths.filter(
		(path) => isGraphedModule(path) && !TEST_FILE.test(path),
	)
	if (graphed.length === 0) return { scope: "changed" }
	const started = performance.now()
	const elapsed = () => Math.round(performance.now() - started)
	try {
		const shared = sharedModulesOf({ changedPaths: graphed, repo })
		const graphMs = elapsed()
		if (shared.length === 0) return { scope: "changed", graphMs }
		return { scope: "importers", shared, graphMs }
	} catch (failure) {
		return { scope: "full", error: String(failure), graphMs: elapsed() }
	}
}

export const fastScopeLines = (scope: FastUnitTestScope) => {
	if (scope.scope !== "importers") return [scopeLine(scope)]
	return [
		`ci  unit test scope: changed test files and the test files importing a shared changed module directly or through re-export modules${graphTime(scope)}`,
		...scope.shared.map(
			({ path, reason, testFiles }) =>
				`ci    ${path} is shared (${reason}), runs ${testFiles.join(", ") || "no test file"}`,
		),
	]
}

const FAST_TEST_TIMEOUT = `--test-timeout=${FAST_TEST_TIMEOUT_MS}`

const withFastTestTimeout = (step: Step): Step => ({
	...step,
	command: `${step.command} ${FAST_TEST_TIMEOUT}`,
})

export const fastUnitTestStep = (scope: FastUnitTestScope): Step => {
	if (scope.scope === "changed") return withFastTestTimeout(CHANGED_UNIT_TESTS)
	if (scope.scope === "full") return withFastTestTimeout(FULL_UNIT_TESTS)
	const testFiles = [
		...new Set(scope.shared.flatMap((shared) => shared.testFiles)),
	]
	return withFastTestTimeout({
		name: "Unit tests changed since origin/main or importing a shared changed module, against the baseline",
		command: [
			CHANGED_UNIT_TESTS.command,
			...testFiles.map((file) => shellQuoted(`--test-file=${file}`)),
		].join(" "),
	})
}

export type StepTiming = { name: string; ms: number }

const slowestStep = (timings: StepTiming[]) =>
	timings.reduce((slowest, timing) =>
		timing.ms > slowest.ms ? timing : slowest,
	)

export const wallTimeLines = (timings: StepTiming[]) => {
	const total = timings.reduce((sum, { ms }) => sum + ms, 0)
	const wallTime = `ci  ci:fast took ${elapsedText(total)}, limit ${FAST_LIMIT_SECONDS} s`
	if (total <= FAST_LIMIT_SECONDS * 1000) return [wallTime]
	const slowest = slowestStep(timings)
	return [
		wallTime,
		`ci  ci:fast went past ${FAST_LIMIT_SECONDS} s, its slowest step ${slowest.name} took ${elapsedText(slowest.ms)}: reported, the duration alone refuses no push`,
	]
}

export const SIMULATOR_LOOKUP = `xcrun simctl list devices available "iOS $(cat .xcode-version)" | grep -m1 -E '^ +iPhone 17 \\(' | grep -oE '[0-9A-F-]{36}'`

const gateSteps = (): Step[] => GROUP_ORDER.flatMap((group) => GATE[group])

const touchedQueueScriptUnitTests = (changedPaths: string[]) =>
	QUEUE_SCRIPT_UNIT_TESTS.filter(({ paths }) =>
		paths.some((path) => changedPaths.includes(path)),
	).map(({ step }) => step)

export const fastSteps = (
	changedPaths: string[],
	scope: FastUnitTestScope,
): Step[] => [
	...FAST_STEP_NAMES.map((name) => {
		const step = gateSteps().find((candidate) => candidate.name === name)
		if (!step) throw new Error(`ci:fast names "${name}", not a gate step`)
		return step
	}),
	...touchedQueueScriptUnitTests(changedPaths),
	fastUnitTestStep(scope),
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

const IOS_TIMINGS = "scripts/ios-shard-seconds.json"

const IOS_TIMINGS_REFRESH = "bun scripts/ci.ts ios-timings"

const KIROSHI_TESTS = "KiroshiTests"

const OVER_PLAN_RATIO = 1.25

type IosTimings = {
	overheadSeconds: number
	classSeconds: Record<string, number>
}

export const readIosTimings = (): IosTimings =>
	JSON.parse(readFileSync(join(REPO, IOS_TIMINGS), "utf8"))

const plannedClassSeconds = (timings: IosTimings, name: string) => {
	const seconds = timings.classSeconds[name]
	if (seconds === undefined)
		throw new Error(
			`${IOS_TIMINGS} plans no seconds for ${name}, measure it with ${IOS_TIMINGS_REFRESH} <run id>`,
		)
	return seconds
}

type ShardPlanning = {
	count: number
	classes: string[]
	timings: IosTimings
}

type ShardLoad = { testSeconds: number; tests: string[] }

type PlannedShard = ShardLoad & { wholeJobSeconds: number }

export const plannedShards = ({
	count,
	classes,
	timings,
}: ShardPlanning): PlannedShard[] => {
	const secondsOf = (name: string) => plannedClassSeconds(timings, name)
	const shards: ShardLoad[] = Array.from({ length: count }, (_, position) =>
		position === 0
			? { testSeconds: secondsOf(KIROSHI_TESTS), tests: [KIROSHI_TESTS] }
			: { testSeconds: 0, tests: [] },
	)
	const longestFirst = [...classes].sort(
		(a, b) => secondsOf(b) - secondsOf(a) || a.localeCompare(b),
	)
	for (const name of longestFirst) {
		const lightest = shards.reduce((lightest, shard) =>
			shard.testSeconds < lightest.testSeconds ? shard : lightest,
		)
		lightest.tests.push(`KiroshiUITests/${name}`)
		lightest.testSeconds += secondsOf(name)
	}
	return shards.map((shard) => ({
		...shard,
		wholeJobSeconds: timings.overheadSeconds + shard.testSeconds,
	}))
}

const SUITE_EVENT =
	/Test Suite '(\w+)' (started|passed|failed) at (\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d\.\d+)/g

const UNIT_TEST_RUN =
	/Test run with \d+ tests? in \d+ suites? (?:passed|failed) after ([\d.]+) seconds/

const suiteEventSeconds = (date: string, time: string) =>
	Date.parse(`${date}T${time}Z`) / 1000

export const measuredClassSeconds = (log: string) => {
	const startedAt = new Map<string, number>()
	const seconds: Record<string, number> = {}
	for (const [, name = "", event, date = "", time = ""] of log.matchAll(
		SUITE_EVENT,
	)) {
		const at = suiteEventSeconds(date, time)
		const started = startedAt.get(name)
		if (event === "started") startedAt.set(name, at)
		else if (started !== undefined) seconds[name] = Math.round(at - started)
	}
	const unitTestRun = UNIT_TEST_RUN.exec(log)
	if (unitTestRun) seconds[KIROSHI_TESTS] = Math.round(Number(unitTestRun[1]))
	return seconds
}

const median = (values: number[]) => {
	const sorted = [...values].sort((a, b) => a - b)
	const middle = Math.floor(sorted.length / 2)
	const upper = sorted[middle] ?? 0
	const lower = sorted[sorted.length % 2 === 0 ? middle - 1 : middle] ?? 0
	return Math.round((lower + upper) / 2)
}

type MeasuredShardJob = {
	wholeJobSeconds: number
	classSeconds: Record<string, number>
}

type IosMeasurement = {
	runs: number[]
	jobs: MeasuredShardJob[]
	classes: string[]
}

const sumOf = (values: number[]) =>
	values.reduce((total, value) => total + value, 0)

export const measuredIosTimings = ({
	runs,
	jobs,
	classes,
}: IosMeasurement): IosTimings => {
	const planned = [KIROSHI_TESTS, ...classes].sort()
	const samplesOf = (name: string) =>
		jobs.flatMap(({ classSeconds }) => classSeconds[name] ?? [])
	const unmeasured = planned.filter((name) => samplesOf(name).length === 0)
	if (unmeasured.length > 0)
		throw new Error(
			`runs ${runs.join(", ")} measured no seconds for ${unmeasured.join(", ")}`,
		)
	const testSecondsOf = ({ classSeconds }: MeasuredShardJob) =>
		sumOf(planned.map((name) => classSeconds[name] ?? 0))
	return {
		overheadSeconds: median(
			jobs.map((job) => job.wholeJobSeconds - testSecondsOf(job)),
		),
		classSeconds: Object.fromEntries(
			planned.map((name) => [name, median(samplesOf(name))]),
		),
	}
}

type RunJob = {
	databaseId: number
	name: string
	conclusion: string
	startedAt: string
	completedAt: string
}

const IOS_SHARD_JOB = /^ios \(\d+\)$/

const measuredShardJob = (job: RunJob): MeasuredShardJob => ({
	wholeJobSeconds: Math.round(
		(Date.parse(job.completedAt) - Date.parse(job.startedAt)) / 1000,
	),
	classSeconds: measuredClassSeconds(
		captured({
			command: ["gh", "run", "view", "--log", "--job", `${job.databaseId}`],
			operation: `reading the log of ${job.name}`,
		}),
	),
})

const measuredShardJobsOf = (run: number) => {
	const { jobs } = JSON.parse(
		captured({
			command: ["gh", "run", "view", `${run}`, "--json", "jobs"],
			operation: `listing the jobs of run ${run}`,
		}),
	) as { jobs: RunJob[] }
	const shardJobs = jobs.filter(
		(job) => IOS_SHARD_JOB.test(job.name) && job.conclusion === "success",
	)
	if (shardJobs.length === 0)
		throw new Error(`run ${run} has no ios shard job that succeeded`)
	return shardJobs.map(measuredShardJob)
}

export const parsedRunIds = (texts: string[]) => {
	const runs = texts.map(Number)
	if (
		runs.length === 0 ||
		!runs.every((run) => Number.isSafeInteger(run) && run > 0)
	)
		throw new Error(
			`ios-timings is given "${texts.join(" ")}", expected the id of one or more GitHub Actions runs`,
		)
	return runs
}

const refreshIosTimings = (texts: string[]) => {
	const runs = parsedRunIds(texts)
	const timings = measuredIosTimings({
		runs,
		jobs: runs.flatMap(measuredShardJobsOf),
		classes: uiTestClasses(),
	})
	writeFileSync(
		join(REPO, IOS_TIMINGS),
		`${JSON.stringify(timings, null, "\t")}\n`,
	)
	console.log(
		`ci  ${IOS_TIMINGS} now plans ${Object.keys(timings.classSeconds).length} classes and ${timings.overheadSeconds} s outside the tests, from runs ${runs.join(", ")}`,
	)
	return true
}

type ShardRun = {
	shard: string
	planned: PlannedShard
	timings: IosTimings
	measured: Record<string, number>
	run: string
}

const classNameOf = (test: string) => test.split("/").at(-1) ?? test

const measuredTestSeconds = ({ planned, measured }: ShardRun) =>
	sumOf(planned.tests.map((test) => measured[classNameOf(test)] ?? 0))

export const shardTimingSummary = (shardRun: ShardRun) => {
	const { shard, planned, timings, measured } = shardRun
	const testSeconds = measuredTestSeconds(shardRun)
	const ratio = (testSeconds / planned.testSeconds).toFixed(2)
	const rows = planned.tests.map((test) => {
		const name = classNameOf(test)
		return `| ${name} | ${timings.classSeconds[name]} | ${measured[name] ?? "not measured"} |`
	})
	return [
		`### ios shard ${shard}: ${testSeconds} s of tests measured for ${planned.testSeconds} s planned, ratio ${ratio}`,
		"",
		`Planned whole job: ${planned.wholeJobSeconds} s, ${timings.overheadSeconds} s of it outside the tests.`,
		"",
		"| Class | Planned s | Measured s |",
		"| --- | ---: | ---: |",
		...rows,
		"",
		"",
	].join("\n")
}

export const shardOverPlanWarning = (shardRun: ShardRun) => {
	const { shard, planned, run } = shardRun
	const testSeconds = measuredTestSeconds(shardRun)
	if (testSeconds <= planned.testSeconds * OVER_PLAN_RATIO) return undefined
	return `::warning title=ios shard over its plan::${escapedAnnotationData(
		`ios shard ${shard} ran its tests in ${testSeconds} s for ${planned.testSeconds} s planned. Refresh ${IOS_TIMINGS} with ${IOS_TIMINGS_REFRESH} ${run}`,
	)}`
}

export const startedATest = (log: string) =>
	/^(Test Case '.+'|◇ Test (?!run ).+) started\.$/m.test(log)

type SelectedShard = {
	shard: string
	planned: PlannedShard
	timings: IosTimings
}

const selectIosTests = (): SelectedShard | undefined => {
	// biome-ignore lint/suspicious/noUndeclaredEnvVars: scripts/ci.ts runs outside turbo, its cache never reads this variable
	const shard = process.env.IOS_SHARD
	if (!shard) {
		process.env.IOS_ONLY_TESTING = ""
		console.log("\nci  ios runs every test of the Kiroshi plan")
		return undefined
	}
	const { index, count } = parsedShard(shard)
	const timings = readIosTimings()
	const planned = plannedShards({ count, classes: uiTestClasses(), timings })[
		index - 1
	]
	if (!planned) throw new Error(`ios shard ${shard} has no plan`)
	process.env.IOS_ONLY_TESTING = planned.tests
		.map((test) => `-only-testing:${test}`)
		.join(" ")
	console.log(
		`\nci  ios shard ${shard} runs ${planned.tests.join(", ")}, planned ${planned.wholeJobSeconds} s of whole job`,
	)
	return { shard, planned, timings }
}

const SHARD_TEST_LOG_FILE = join(REPO, IOS_SHARD_TEST_LOG)

const shardTestLog = () =>
	existsSync(SHARD_TEST_LOG_FILE)
		? readFileSync(SHARD_TEST_LOG_FILE, "utf8")
		: ""

const reportRunnerFailure = () => {
	console.error("ci  ios ended before its first test started: runner failure")
	// biome-ignore lint/suspicious/noUndeclaredEnvVars: scripts/ci.ts runs outside turbo, its cache never reads this variable
	const output = process.env.GITHUB_OUTPUT
	if (output) appendFileSync(output, "runner-failure=true\n")
}

const shardPassed = () => {
	try {
		ensureSimulator()
		return runSteps("ios", IOS_SHARD_STEPS)
	} catch (failure) {
		console.error(`ci  ${(failure as Error).message}`)
		return false
	}
}

const reportShardTimings = (selected: SelectedShard, log: string) => {
	const shardRun: ShardRun = {
		...selected,
		measured: measuredClassSeconds(log),
		// biome-ignore lint/suspicious/noUndeclaredEnvVars: scripts/ci.ts runs outside turbo, its cache never reads this variable
		run: process.env.GITHUB_RUN_ID ?? "<run id>",
	}
	const warning = shardOverPlanWarning(shardRun)
	if (warning) console.log(warning)
	// biome-ignore lint/suspicious/noUndeclaredEnvVars: scripts/ci.ts runs outside turbo, its cache never reads this variable
	const summary = process.env.GITHUB_STEP_SUMMARY
	if (summary) appendFileSync(summary, shardTimingSummary(shardRun))
}

const runIosShard = (selected: SelectedShard) => {
	rmSync(SHARD_TEST_LOG_FILE, { force: true })
	const passed = shardPassed()
	const log = shardTestLog()
	reportShardTimings(selected, log)
	if (!passed && !startedATest(log)) reportRunnerFailure()
	return passed
}

const runIosBuild = () => {
	ensureSimulator()
	return runSteps("ios-build", IOS_BUILD_STEPS)
}

const runGroup = (group: Group) => {
	if (group !== "ios") return runSteps(group, GATE[group])
	const selected = selectIosTests()
	if (selected) return runIosShard(selected)
	ensureSimulator()
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
	const started = performance.now()
	const changedPaths = pathsChangedSinceMain()
	const scope = fastUnitTestScope({ changedPaths, repo: REPO })
	console.log(`\n${fastScopeLines(scope).join("\n")}`)
	const timings: StepTiming[] = [
		{ name: "the unit test scope decision", ms: performance.now() - started },
	]
	const passed = fastSteps(changedPaths, scope).every((step) => {
		const stepStarted = performance.now()
		const stepPassed = runWithRetry({ label: "fast", step })
		timings.push({
			name: `fast / ${step.name}`,
			ms: performance.now() - stepStarted,
		})
		return stepPassed
	})
	console.log(`\n${wallTimeLines(timings).join("\n")}`)
	return passed
}

const runRequested = (argument: string | undefined) => {
	if (argument === undefined) return runGate()
	if (argument === "fast") return runFast()
	if (argument === "changed") return runChangedUnitTests()
	if (argument === "rust-pr")
		return runSteps("rust-pr", RUST_PULL_REQUEST_STEPS)
	if (argument === "ios-build") return runIosBuild()
	if (argument === "ios-timings")
		return refreshIosTimings(process.argv.slice(3))
	if (isGroup(argument)) return runGroup(argument)
	throw new Error(
		`unknown argument "${argument}", expected fast, changed, rust-pr, ios-build, ios-timings or one of ${GROUP_ORDER.join(", ")}`,
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
