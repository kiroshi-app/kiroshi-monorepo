import { invoke } from "@tauri-apps/api/core"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Routine, RoutineDraft } from "./routine-contract"
import { DEFAULT_RUN_PAGE, routinesTransport } from "./routines-transport"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))

const hostInvoke = vi.mocked(invoke)

const DRAFT: RoutineDraft = {
	conversationId: "c-1",
	botId: "b-1",
	title: "Nightly report",
	instruction: "Read the shift log and report what changed.",
	triggerSourceId: "schedule",
	filter: { matchMode: "all", rows: [] },
	triggerConfig: { every: "1h" },
}

const ROUTINE: Routine = {
	id: "r-1",
	conversationId: "c-1",
	botId: "b-1",
	title: "Nightly report",
	instruction: "Read the shift log and report what changed.",
	triggerSourceId: "schedule",
	filter: { matchMode: "all", rows: [] },
	triggerConfig: { every: "1h" },
	isEnabled: true,
	consecutiveFailures: 0,
	createdAt: 1,
}

describe("routinesTransport", () => {
	beforeEach(() => {
		hostInvoke.mockReset()
	})

	it("asks the host to write a routine and answers the row it stored", async () => {
		hostInvoke.mockResolvedValueOnce(ROUTINE)

		await expect(routinesTransport.create(DRAFT)).resolves.toEqual(ROUTINE)

		expect(hostInvoke).toHaveBeenCalledWith("routine_create", { draft: DRAFT })
	})

	it("reads a page of runs bounded by default", async () => {
		hostInvoke.mockResolvedValueOnce([])

		await routinesTransport.runs("r-1")

		expect(hostInvoke).toHaveBeenCalledWith("routine_runs", {
			routineId: "r-1",
			limit: DEFAULT_RUN_PAGE,
		})
	})

	it("reads the runs of every routine of a space in one call, bounded by default", async () => {
		hostInvoke.mockResolvedValueOnce([])

		await routinesTransport.runsOfSpace("personal")

		expect(hostInvoke).toHaveBeenCalledOnce()
		expect(hostInvoke).toHaveBeenCalledWith("routine_runs_of_space", {
			spaceId: "personal",
			limit: DEFAULT_RUN_PAGE,
		})
	})

	it("reads the runs of a conversation that reported in a turn", async () => {
		const reported = {
			turnId: "t-1",
			routineTitle: "Nightly report",
			triggerSourceId: "schedule",
		}
		hostInvoke.mockResolvedValueOnce([reported])

		await expect(routinesTransport.reportedRuns("c-1")).resolves.toEqual([
			reported,
		])

		expect(hostInvoke).toHaveBeenCalledWith("routine_reported_runs", {
			conversationId: "c-1",
		})
	})

	it("carries the decision run now reached back to the caller", async () => {
		hostInvoke.mockResolvedValueOnce({
			kind: "skipped",
			runId: "run-1",
			reason: "hourlyCap",
		})

		await expect(routinesTransport.runNow("r-1")).resolves.toEqual({
			kind: "skipped",
			runId: "run-1",
			reason: "hourlyCap",
		})
	})

	it("carries a refused save back to the caller with the row it names", async () => {
		const failure = {
			kind: "unsupportedOperator",
			row: 1,
			field: "issue.draft",
			operator: "contains",
			fieldType: "boolean",
		}
		hostInvoke.mockRejectedValueOnce(failure)

		await expect(
			routinesTransport.update("r-1", {
				title: "Nightly report",
				instruction: "Read the shift log and report what changed.",
				filter: { matchMode: "all", rows: [] },
				triggerConfig: {},
				isEnabled: true,
			}),
		).rejects.toEqual(failure)
	})
})
