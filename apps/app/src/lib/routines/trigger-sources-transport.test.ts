import { invoke } from "@tauri-apps/api/core"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { TriggerSource } from "./trigger-contract"
import { triggerSourcesTransport } from "./trigger-sources-transport"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))

const hostInvoke = vi.mocked(invoke)

const SCHEDULE: TriggerSource = {
	id: "schedule",
	title: "On a schedule",
	payload: [{ name: "firedAt", type: "datetime" }],
	dedupeKey: "firedAt",
}

describe("triggerSourcesTransport", () => {
	beforeEach(() => {
		hostInvoke.mockReset()
	})

	it("asks the host for the sources stacked for every companion of a space in one call", async () => {
		const declared = [
			{ botId: "b-1", triggerSources: [SCHEDULE], failure: null },
		]
		hostInvoke.mockResolvedValueOnce(declared)

		await expect(
			triggerSourcesTransport.sourcesOfSpace("personal"),
		).resolves.toEqual(declared)

		expect(hostInvoke).toHaveBeenCalledOnce()
		expect(hostInvoke).toHaveBeenCalledWith(
			"routine_trigger_sources_of_space",
			{ spaceId: "personal" },
		)
	})

	it("carries an unreadable space declaration back to the caller", async () => {
		const failure = {
			kind: "unreadableSources",
			path: "space/.triggers.json",
			reason: "expected value at line 1",
		}
		hostInvoke.mockRejectedValueOnce(failure)

		await expect(
			triggerSourcesTransport.sourcesOfSpace("personal"),
		).rejects.toEqual(failure)
	})
})
