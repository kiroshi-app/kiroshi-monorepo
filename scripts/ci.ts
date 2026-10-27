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
// never a file of the apps/app perf project, and the pr-dequeue or pr-enqueue
// script tests when the diff touches that script or its tests. bun run ci and the CI jobs
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

export const SHARED_IMPORTER_THRESHOLD = 20

export const SHARED_PATH_RULES = [
	"packages/ui/src/tokens/**",
	"packages/ui/src/tokens.*",
	"packages/ui/src/styles/**",
	"packages/ui/src/lib/**",
	"packages/shared/**",
	"apps/app/src/lib/**",
	"apps/app/vitest.config.ts",
	"packages/ui/vitest.config.ts",
	"baselines/**",
	"packages/ui/src/components/bot-badge.tsx",
	"packages/ui/src/components/bot-identity-avatar.tsx",
	"packages/ui/src/components/bot-settings.ts",
	"packages/ui/src/components/code-block.tsx",
	"packages/ui/src/components/companion-avatar.ts",
	"packages/ui/src/components/companion-colour.ts",
	"packages/ui/src/components/companion-field.ts",
	"packages/ui/src/components/companion-menu.tsx",
	"packages/ui/src/components/companion-picture.ts",
	"packages/ui/src/components/companion-silhouette.ts",
	"packages/ui/src/components/conversation-subject-icon.tsx",
	"packages/ui/src/components/dithered-field-avatar.tsx",
	"packages/ui/src/components/field-frame.tsx",
	"packages/ui/src/components/field-grid.ts",
	"packages/ui/src/components/glaze-border.ts",
	"packages/ui/src/components/icon-swap.tsx",
	"packages/ui/src/components/icons.tsx",
	"packages/ui/src/components/initials-avatar.tsx",
	"packages/ui/src/components/inverse-button.ts",
	"packages/ui/src/components/kiroshi-hexagon.ts",
	"packages/ui/src/components/list-skeleton.tsx",
	"packages/ui/src/components/markdown/prose.ts",
	"packages/ui/src/components/message-bubble.tsx",
	"packages/ui/src/components/message-side-context.tsx",
	"packages/ui/src/components/mission-marks.tsx",
	"packages/ui/src/components/motion/text-shimmer.tsx",
	"packages/ui/src/components/notice-surface.tsx",
	"packages/ui/src/components/outlined-hexagon.tsx",
	"packages/ui/src/components/plugin-settings/application-mark.tsx",
	"packages/ui/src/components/roster-menu-items.tsx",
	"packages/ui/src/components/row-anatomy.tsx",
	"packages/ui/src/components/settings-field.tsx",
	"packages/ui/src/components/settings-select.tsx",
	"packages/ui/src/components/settings-styles.ts",
	"packages/ui/src/components/sidebar-list-row.tsx",
	"packages/ui/src/components/sidebar-menu-row.tsx",
	"packages/ui/src/components/space-avatar-recipe.ts",
	"packages/ui/src/components/space-avatar.tsx",
	"packages/ui/src/components/tooltip-button.tsx",
	"packages/ui/src/components/tooltip-hint.tsx",
	"packages/ui/src/components/ui/avatar.tsx",
	"packages/ui/src/components/ui/badge.tsx",
	"packages/ui/src/components/ui/button.tsx",
	"packages/ui/src/components/ui/context-menu.tsx",
	"packages/ui/src/components/ui/input.tsx",
	"packages/ui/src/components/ui/item.tsx",
	"packages/ui/src/components/ui/separator.tsx",
	"packages/ui/src/components/ui/sheet.tsx",
	"packages/ui/src/components/ui/sidebar.tsx",
	"packages/ui/src/components/ui/skeleton.tsx",
	"packages/ui/src/components/ui/toast.tsx",
	"packages/ui/src/components/ui/tooltip.tsx",
	"packages/ui/src/hooks/use-chat-copy.ts",
	"packages/ui/src/hooks/use-code-highlight-ready.ts",
	"packages/ui/src/hooks/use-color-scheme.ts",
	"packages/ui/src/hooks/use-copy-text.ts",
	"packages/ui/src/hooks/use-focus-first-invalid.ts",
	"packages/ui/src/hooks/use-mobile.ts",
	"packages/ui/src/hooks/use-overlay-scrollbars.ts",
	"packages/ui/src/hooks/use-pending-submit.ts",
	"packages/ui/src/hooks/use-prefers-reduced-motion.ts",
	"packages/ui/src/hooks/use-skeleton-timing.ts",
]

export type UnitTestScope =
	| { scope: "changed" }
	| { scope: "full"; path: string; rule: string }

const sharedRuleOf = (path: string) =>
	SHARED_PATH_RULES.find((rule) => new Bun.Glob(rule).match(path))

export const unitTestScope = (changedPaths: string[]): UnitTestScope => {
	for (const path of changedPaths) {
		const rule = sharedRuleOf(path)
		if (rule !== undefined) return { scope: "full", path, rule }
	}
	return { scope: "changed" }
}

export const SIMULATOR_LOOKUP = `xcrun simctl list devices available "iOS $(cat .xcode-version)" | grep -m1 -E '^ +iPhone 17 \\(' | grep -oE '[0-9A-F-]{36}'`

const gateSteps = (): Step[] => GROUP_ORDER.flatMap((group) => GATE[group])

const touchedQueueScriptUnitTests = (changedPaths: string[]) =>
	QUEUE_SCRIPT_UNIT_TESTS.filter(({ paths }) =>
		paths.some((path) => changedPaths.includes(path)),
	).map(({ step }) => step)

export const fastSteps = (changedPaths: string[]): Step[] => [
	...FAST_STEP_NAMES.map((name) => {
		const step = gateSteps().find((candidate) => candidate.name === name)
		if (!step) throw new Error(`ci:fast names "${name}", not a gate step`)
		return step
	}),
	...touchedQueueScriptUnitTests(changedPaths),
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

const runChangedUnitTests = () => {
	const decision = unitTestScope(pathsChangedSinceMain())
	if (decision.scope === "changed")
		return runSteps("changed", [CHANGED_UNIT_TESTS])
	console.log(`\nci  full suite: ${decision.path} is shared (${decision.rule})`)
	return runSteps("changed", GATE.vitest)
}

const runRequested = (argument: string | undefined) => {
	if (argument === undefined) return runGate()
	if (argument === "fast")
		return runSteps("fast", fastSteps(pathsChangedSinceMain()))
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
