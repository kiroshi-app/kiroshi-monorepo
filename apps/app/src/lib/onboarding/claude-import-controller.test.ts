import { beforeEach, describe, expect, it, type Mock, vi } from "vitest"

import "@workspace/ui/lib/i18n"
import type { NoticeMessage } from "@workspace/ui/components/notice-surface"

import {
	type ClaudeImportController,
	type ClaudeImported,
	type ClaudeImportPort,
	type ClaudeImportWorld,
	createClaudeImportController,
} from "./claude-import-controller"

import type { ClaudeImportOutcome, ClaudeImportProgress } from "@/lib/bindings"

const SPACE_ID = "space-home"

const NOTHING_IMPORTED: ClaudeImported = {
	companions: [],
	hasInstructions: false,
	skillCount: 0,
}

let announce: (progress: ClaudeImportProgress) => void
let run: Mock<ClaudeImportPort["run"]>
let markSeen: Mock<() => Promise<void>>
let leave: Mock<ClaudeImportWorld["leave"]>
let reportFailure: Mock<(notice: NoticeMessage) => void>
let controller: ClaudeImportController

const importedOf = (key: string): ClaudeImportOutcome => ({
	key,
	result: { kind: "imported", id: key, name: key },
})

const failedOf = (key: string): ClaudeImportOutcome => ({
	key,
	result: { kind: "failed", cause: "unparsable" },
})

beforeEach(() => {
	announce = () => undefined
	run = vi.fn<ClaudeImportPort["run"]>(async () => [])
	markSeen = vi.fn(async () => undefined)
	leave = vi.fn()
	reportFailure = vi.fn<(notice: NoticeMessage) => void>()
	controller = createClaudeImportController(
		{
			run,
			onProgress: async (onProgress) => {
				announce = onProgress
				return () => {
					announce = () => undefined
				}
			},
		},
		{ spaceId: () => SPACE_ID, markSeen, leave },
		{ reportFailure },
	)
})

describe("the seen mark", () => {
	it("is written once however many times the screen is left", async () => {
		controller.leave(NOTHING_IMPORTED)
		controller.leave(NOTHING_IMPORTED)
		await Promise.resolve()

		expect(markSeen).toHaveBeenCalledOnce()
		expect(leave).toHaveBeenCalledTimes(2)
	})

	it("reports a refused mark and still leaves", async () => {
		markSeen.mockRejectedValue(new Error("database locked"))

		controller.leave(NOTHING_IMPORTED)
		await vi.waitFor(() => expect(reportFailure).toHaveBeenCalledOnce())

		expect(leave).toHaveBeenCalledOnce()
	})
})

describe("an import", () => {
	it("unchecks then rechecks a row", () => {
		controller.toggle("agent:atlas", false)
		expect(controller.getState().unchecked).toEqual(["agent:atlas"])

		controller.toggle("agent:atlas", true)
		expect(controller.getState().unchecked).toEqual([])
	})

	it("runs the picked keys in the current space, recording each progress event", async () => {
		let finish: (outcomes: ClaudeImportOutcome[]) => void = () => undefined
		run.mockReturnValue(
			new Promise((resolve) => {
				finish = resolve
			}),
		)

		const running = controller.importPicked(["agent:atlas", "skill:changelog"])
		await vi.waitFor(() => expect(run).toHaveBeenCalled())
		announce({ ...importedOf("agent:atlas"), done: 1, total: 2 })
		announce({ ...importedOf("agent:other"), done: 1, total: 1 })

		expect(run).toHaveBeenCalledWith(
			["agent:atlas", "skill:changelog"],
			SPACE_ID,
		)
		expect(controller.getState()).toMatchObject({
			isImporting: true,
			selection: ["agent:atlas", "skill:changelog"],
			results: { "agent:atlas": importedOf("agent:atlas").result },
		})

		finish([importedOf("agent:atlas"), failedOf("skill:changelog")])
		await running

		expect(controller.getState().isImporting).toBe(false)
		expect(controller.getState().results["skill:changelog"]?.kind).toBe(
			"failed",
		)
	})

	it("retries the failed keys only and keeps the first selection", async () => {
		run.mockResolvedValueOnce([
			importedOf("agent:atlas"),
			failedOf("skill:changelog"),
		])
		await controller.importPicked(["agent:atlas", "skill:changelog"])
		run.mockResolvedValueOnce([importedOf("skill:changelog")])

		await controller.retryFailed()

		expect(run).toHaveBeenLastCalledWith(["skill:changelog"], SPACE_ID)
		expect(controller.getState().selection).toEqual([
			"agent:atlas",
			"skill:changelog",
		])
		expect(controller.getState().results["skill:changelog"]?.kind).toBe(
			"imported",
		)
	})

	it("reports a rejected import and goes back to the selection", async () => {
		run.mockRejectedValue(new Error("database locked"))

		await controller.importPicked(["agent:atlas"])

		expect(reportFailure).toHaveBeenCalledOnce()
		expect(controller.getState()).toEqual({
			unchecked: [],
			selection: [],
			results: {},
			isImporting: false,
		})
	})

	it("reports an import with no local space and keeps the selection", async () => {
		controller = createClaudeImportController(
			{ run, onProgress: async () => () => undefined },
			{ spaceId: () => null, markSeen, leave },
			{ reportFailure },
		)

		await controller.importPicked(["agent:atlas"])

		expect(run).not.toHaveBeenCalled()
		expect(reportFailure).toHaveBeenCalledOnce()
		expect(controller.getState()).toMatchObject({
			selection: [],
			isImporting: false,
		})
	})
})
