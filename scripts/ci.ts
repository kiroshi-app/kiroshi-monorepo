import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { touchedJobs } from "./ci-changes"

export type Step = {
	name: string
	command: string
	cwd?: string
	heavy?: true
}

const REPO = fileURLToPath(new URL("..", import.meta.url))

const SLOT = join(REPO, "scripts/slot.sh")

const APP = "apps/app"

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

const PR_DEQUEUE_PATHS = ["scripts/pr-dequeue.sh", "scripts/pr-dequeue.test.ts"]

const BINDINGS_MATCH: Step = {
	name: "Bindings match the command surface",
	command: "git diff --exit-code apps/app/src/lib/bindings.ts",
}

export const RUST_LIB_STEPS: Step[] = [
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
		},
		BINDINGS_MATCH,
	],
	storybook: [
		{
			name: "Stories played in chromium against the baseline",
			command: "bun run baseline storybook",
			heavy: true,
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
// runs the format, Biome and knip against the baseline, the types, and only
// the apps/app and packages/ui unit test files changed since origin/main,
// never a file of the apps/app perf project, and the pr-dequeue script tests
// when the diff touches the script or its tests. bun run ci and the CI jobs
// keep the rest: the full unit set, the perf set, the story ids, the
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

export const SIMULATOR_LOOKUP = `xcrun simctl list devices available "iOS $(cat .xcode-version)" | grep -m1 -E '^ +iPhone 17 \\(' | grep -oE '[0-9A-F-]{36}'`

const gateSteps = (): Step[] => GROUP_ORDER.flatMap((group) => GATE[group])

const touchesPrDequeue = (changedPaths: string[]) =>
	changedPaths.some((path) => PR_DEQUEUE_PATHS.includes(path))

export const fastSteps = (changedPaths: string[]): Step[] => [
	...FAST_STEP_NAMES.map((name) => {
		const step = gateSteps().find((candidate) => candidate.name === name)
		if (!step) throw new Error(`ci:fast names "${name}", not a gate step`)
		return step
	}),
	...(touchesPrDequeue(changedPaths) ? [PR_DEQUEUE_UNIT_TESTS] : []),
	CHANGED_UNIT_TESTS,
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

const runSteps = (label: string, steps: Step[]) =>
	steps.every((step) => runStep({ label, step }))

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

const runRequested = (argument: string | undefined) => {
	if (argument === undefined) return runGate()
	if (argument === "fast")
		return runSteps("fast", fastSteps(pathsChangedSinceMain()))
	if (argument === "changed") return runSteps("changed", [CHANGED_UNIT_TESTS])
	if (argument === "rust-lib") return runSteps("rust-lib", RUST_LIB_STEPS)
	if (isGroup(argument)) return runGroup(argument)
	throw new Error(
		`unknown argument "${argument}", expected fast, changed, rust-lib or one of ${GROUP_ORDER.join(", ")}`,
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
