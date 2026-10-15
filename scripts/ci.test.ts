import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"

import {
	CHANGED_UNIT_TESTS,
	FAST_STEP_NAMES,
	fastSteps,
	GATE,
	GROUP_ORDER,
	SIMULATOR_LOOKUP,
	skipReason,
} from "./ci"

type WorkflowStep = {
	name?: string
	uses?: string
	run?: string
	if?: string
	"timeout-minutes"?: number
}

type Workflow = {
	jobs: Record<
		string,
		{ if?: string; "timeout-minutes"?: number; steps?: WorkflowStep[] }
	>
}

const workflow = Bun.YAML.parse(
	readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8"),
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

const EVERY_PATH_TOUCHED = {
	rust: true,
	vitest: true,
	website: true,
	ios: true,
}

const runStepsOf = (job: string) =>
	(workflow.jobs[job]?.steps ?? []).filter((step) => step.run !== undefined)

const stepNamed = (job: string, name: string) =>
	runStepsOf(job).find((step) => step.name === name)

describe("the gate", () => {
	it("runs lint, rust, vitest, website and ios, in that order", () => {
		expect(GROUP_ORDER).toEqual(["lint", "rust", "vitest", "website", "ios"])
		expect(Object.keys(GATE).sort()).toEqual([...GROUP_ORDER].sort())
	})

	it("names every step once", () => {
		const names = GROUP_ORDER.flatMap((group) =>
			GATE[group].map((step) => step.name),
		)

		expect(new Set(names).size).toBe(names.length)
	})

	it("skips ios as a post-merge job, whatever the paths touched", () => {
		expect(skipReason({ group: "ios", touched: EVERY_PATH_TOUCHED })).toBe(
			"ios is a post-merge job, CI runs it on a push to main and on a v* tag: run bun run ci ios to run it here",
		)
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

	it("runs ios on a push only, never on a pull_request, within 60 minutes", () => {
		expect(workflow.jobs.ios?.if?.startsWith(ON_PUSH_ONLY)).toBe(true)
		expect(workflow.jobs.ios?.["timeout-minutes"]).toBe(60)
	})

	it("has verify expect ios skipped on a pull_request", () => {
		const requireIos = (workflow.jobs.verify?.steps ?? []).find((step) =>
			step.if?.startsWith("needs.ios.result"),
		)

		expect(requireIos?.if).toBe(
			`needs.ios.result != (${ON_PUSH_ONLY}needs.changes.outputs.ios == 'true' && 'success' || 'skipped')`,
		)
	})

	it("boots the simulator bun run ci looks up", () => {
		expect(
			stepNamed("ios", "Boot the simulator while the app builds")?.run,
		).toContain(SIMULATOR_LOOKUP)
	})
})
