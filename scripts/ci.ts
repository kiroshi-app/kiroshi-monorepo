import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { decideJobs } from "./ci-changes"

export type Step = { name: string; command: string; cwd?: string }

const REPO = fileURLToPath(new URL("..", import.meta.url))

const APP = "apps/app"

const SIMULATOR_DESTINATION =
	'-destination "platform=iOS Simulator,id=$SIMULATOR"'

export const GATE = {
	lint: [
		{ name: "Biome format", command: "bun run format" },
		{ name: "Baseline unit tests", command: "bun run test:baseline" },
		{
			name: "CI change detection unit tests",
			command: "bun run test:ci-changes",
		},
		{ name: "Red main reporter unit tests", command: "bun run test:red-main" },
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
	rust: [
		{
			name: "Rustfmt",
			command: "cargo fmt --manifest-path src-tauri/Cargo.toml --check",
			cwd: APP,
		},
		{ name: "Build sidecar", command: "bun run --filter sidecar build" },
		{
			name: "Clippy",
			command:
				"cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --features fake-claude -- -D warnings",
			cwd: APP,
		},
		{
			name: "Test",
			command:
				"cargo test --manifest-path src-tauri/Cargo.toml --features fake-claude",
			cwd: APP,
		},
		{
			name: "Bindings match the command surface",
			command: "git diff --exit-code apps/app/src/lib/bindings.ts",
		},
	],
	vitest: [
		{
			name: "Unit tests and story ids against the baseline",
			command: "bun run baseline unit",
		},
		{
			name: "Tests and stories against the baseline",
			command: "bun run baseline vitest",
		},
	],
	website: [
		{ name: "Build website", command: "bun run --filter=website build" },
	],
	ios: [
		{ name: "Generate", command: "bun run ios:generate" },
		{
			name: "Build for testing",
			command: `xcodebuild -project apps/ios/Kiroshi.xcodeproj -scheme Kiroshi -testPlan Kiroshi ${SIMULATOR_DESTINATION} -derivedDataPath apps/ios/build build-for-testing`,
		},
		{
			name: "Test on the simulator",
			command: `xcodebuild -project apps/ios/Kiroshi.xcodeproj -scheme Kiroshi -testPlan Kiroshi ${SIMULATOR_DESTINATION} -derivedDataPath apps/ios/build -parallel-testing-enabled NO -collect-test-diagnostics never test-without-building`,
		},
		{
			name: "Swift format",
			command: "swift format lint --recursive --strict apps/ios",
		},
	],
} satisfies Record<string, Step[]>

export type Group = keyof typeof GATE

export const GROUP_ORDER: Group[] = ["lint", "rust", "vitest", "website", "ios"]

export const FAST_STEP_NAMES = [
	"Biome format",
	"Biome and knip against the baseline",
	"Types",
	"Unit tests and story ids against the baseline",
]

export const SIMULATOR_LOOKUP = `xcrun simctl list devices available "iOS $(cat .xcode-version)" | grep -m1 -E '^ +iPhone 17 \\(' | grep -oE '[0-9A-F-]{36}'`

const gateSteps = (): Step[] => GROUP_ORDER.flatMap((group) => GATE[group])

export const fastSteps = (): Step[] =>
	FAST_STEP_NAMES.map((name) => {
		const step = gateSteps().find((candidate) => candidate.name === name)
		if (!step) throw new Error(`ci:fast names "${name}", not a gate step`)
		return step
	})

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
		throw new Error(`${operation} failed: ${finished.stderr.toString().trim()}`)
	}
	return finished.stdout.toString().trim()
}

const pathsChangedSinceMain = () => {
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

type TouchedJobs = ReturnType<typeof decideJobs>

type GroupDecision = { group: Group; touched: TouchedJobs }

export const skipReason = ({ group, touched }: GroupDecision) => {
	if (group === "ios") {
		return "ios is a post-merge job, CI runs it on a push to main and on a v* tag: run bun run ci ios to run it here"
	}
	if (group === "lint" || touched[group]) return undefined
	return "scripts/ci-changes.ts finds no path changed since the merge base with origin/main that touches it"
}

const ensureSimulator = () => {
	// biome-ignore lint/suspicious/noUndeclaredEnvVars: scripts/ci.ts runs outside turbo, its cache never reads this variable
	if (process.env.SIMULATOR) return
	const simulator = captured({
		command: ["bash", "-c", SIMULATOR_LOOKUP],
		operation: "finding the iPhone 17 simulator",
	})
	if (simulator.length === 0) {
		throw new Error("no available iPhone 17 simulator on the pinned iOS")
	}
	process.env.SIMULATOR = simulator
}

type Labelled = { label: string; step: Step }

const runStep = ({ label, step }: Labelled) => {
	console.log(`\nci  ${label} / ${step.name}\n    $ ${step.command}`)
	const finished = Bun.spawnSync({
		cmd: ["bash", "-ec", step.command],
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
	const touched = decideJobs({
		event: "pull_request",
		paths: pathsChangedSinceMain(),
	})
	return GROUP_ORDER.every((group) => {
		const skipped = skipReason({ group, touched })
		if (skipped === undefined) return runGroup(group)
		console.log(`\nci  skipped ${group}: ${skipped}`)
		return true
	})
}

const runRequested = (argument: string | undefined) => {
	if (argument === undefined) return runGate()
	if (argument === "fast") return runSteps("fast", fastSteps())
	if (isGroup(argument)) return runGroup(argument)
	throw new Error(
		`unknown argument "${argument}", expected fast or one of ${GROUP_ORDER.join(", ")}`,
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
