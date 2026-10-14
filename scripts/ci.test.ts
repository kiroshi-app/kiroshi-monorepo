import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"

import {
	FAST_STEP_NAMES,
	fastSteps,
	GATE,
	GROUP_ORDER,
	SIMULATOR_LOOKUP,
} from "./ci"

type WorkflowStep = {
	name?: string
	uses?: string
	run?: string
	"timeout-minutes"?: number
}

type Workflow = { jobs: Record<string, { steps?: WorkflowStep[] }> }

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
})

describe("ci:fast", () => {
	it("names only steps the full gate runs, with the same command", () => {
		const gate = GROUP_ORDER.flatMap((group) => GATE[group])

		expect(fastSteps().map((step) => step.name)).toEqual(FAST_STEP_NAMES)
		for (const step of fastSteps()) expect(gate).toContainEqual(step)
	})
})

describe("the PR jobs of ci.yml", () => {
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

	it("boots the simulator bun run ci looks up", () => {
		expect(
			stepNamed("ios", "Boot the simulator while the app builds")?.run,
		).toContain(SIMULATOR_LOOKUP)
	})
})
