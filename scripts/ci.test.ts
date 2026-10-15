import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"

import {
	CHANGED_UNIT_TESTS,
	FAST_STEP_NAMES,
	fastSteps,
	GATE,
	GROUP_ORDER,
	type Group,
	postMergeNote,
	SIMULATOR_LOOKUP,
	type Step,
	skipReason,
} from "./ci"

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
	jobs: Record<
		string,
		{
			if?: string
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
])

const UNGATED_JOBS = new Set(["changes", "verify"])

const ON_PUSH_ONLY = "github.event_name == 'push' && "

const ON_MAIN_ONLY = "github.ref == 'refs/heads/main' && "

const ON_PULL_REQUEST_ONLY = "github.event_name == 'pull_request' && "

const POST_MERGE_JOBS: Group[] = ["rust", "storybook", "ios"]

const PULL_REQUEST_JOBS = ["rust-check", "vitest", "website"]

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

	it("plays the stories in the storybook group only", () => {
		const playing = GROUP_ORDER.filter((group) =>
			GATE[group].some((step) => step.command.includes("baseline storybook")),
		)

		expect(playing).toEqual(["storybook"])
	})

	it("notes rust, storybook and ios as post-merge jobs, nothing else", () => {
		expect(GROUP_ORDER.filter((group) => postMergeNote(group))).toEqual(
			POST_MERGE_JOBS,
		)
		for (const group of ["rust", "storybook"] as const) {
			expect(postMergeNote(group)).toBe(
				`${group} is a post-merge job, CI runs it on a push to main and on a v* tag`,
			)
		}
		expect(postMergeNote("ios")).toBe(
			"ios is a post-merge job, CI runs it on a push to main only",
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
})

describe("the jobs of ci.yml", () => {
	it("gate exactly the groups of scripts/ci.ts, one job per group", () => {
		const gatedJobs = Object.keys(workflow.jobs).filter(
			(job) => !UNGATED_JOBS.has(job),
		)

		expect(gatedJobs.sort()).toEqual([...GROUP_ORDER].sort())
	})

	it.each(GROUP_ORDER)(
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

	it.each(GROUP_ORDER)("%s bounds its gate by the job timeout only", (job) => {
		const stepTimeouts = (workflow.jobs[job]?.steps ?? []).flatMap(
			(step) => step["timeout-minutes"] ?? [],
		)

		expect(stepTimeouts).toEqual([])
	})

	it("runs ios on a push to main only, never on a v* tag or a pull_request, within 60 minutes", () => {
		const filter = "needs.changes.outputs.ios == 'true'"

		expect(workflow.jobs.ios?.if).toBe(`${ON_MAIN_ONLY}${filter}`)
		expect(verifyCondition("ios")).toBe(
			`needs.ios.result != (${ON_MAIN_ONLY}${filter} && 'success' || 'skipped')`,
		)
		expect(workflow.jobs.ios?.["timeout-minutes"]).toBe(60)
	})

	it.each(["rust", "storybook"])(
		"runs %s on a push only and has verify expect it skipped on a pull_request",
		(job) => {
			const filter = `needs.changes.outputs.${job} == 'true'`

			expect(workflow.jobs[job]?.if).toBe(`${ON_PUSH_ONLY}${filter}`)
			expect(verifyCondition(job)).toBe(
				`needs.${job}.result != (${ON_PUSH_ONLY}${filter} && 'success' || 'skipped')`,
			)
		},
	)

	it("runs rust-check on a pull_request only and has verify expect it skipped on a push", () => {
		const filter = "needs.changes.outputs.rust == 'true'"

		expect(workflow.jobs["rust-check"]?.if).toBe(
			`${ON_PULL_REQUEST_ONLY}${filter}`,
		)
		expect(verifyCondition("rust-check")).toBe(
			`needs.rust-check.result != (${ON_PULL_REQUEST_ONLY}${filter} && 'success' || 'skipped')`,
		)
	})

	it.each(["vitest", "website"])(
		"has verify require %s whenever its paths changed",
		(job) => {
			expect(verifyCondition(job)).toBe(
				`needs.${job}.result != (needs.changes.outputs.${job} == 'true' && 'success' || 'skipped')`,
			)
		},
	)

	it("has verify wait on every job", () => {
		expect(workflow.jobs.verify?.needs).toEqual([
			"changes",
			"lint",
			...PULL_REQUEST_JOBS,
			...POST_MERGE_JOBS,
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
