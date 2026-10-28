// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { MissionOnBoard } from "./mission-contract"
import { aMission } from "./mission-fixtures"
import {
	type MissionRunDriverMount,
	useMissionRunDriver,
} from "./use-mission-run-driver"

const transport = vi.hoisted(() => ({
	board: vi.fn(async (): Promise<Pick<MissionOnBoard, "mission">[]> => []),
	unreported: vi.fn(async (): Promise<Pick<MissionOnBoard, "mission">[]> => []),
	onChanged: vi.fn(async () => () => undefined),
}))

vi.mock("./missions-transport", () => ({
	missionRunTransport: transport,
}))

const CLOSED_MISSION = aMission({ state: "done", closedAt: 9 })

const mountIn = async (isDriverWindow: boolean) => {
	transport.unreported.mockResolvedValue([{ mission: CLOSED_MISSION }])
	const startOrResumeSession = vi.fn()
	const mount = {
		driver: {
			subscribe: vi.fn(async () => () => undefined),
			startOrResumeSession,
		},
		store: { openRuntimeSession: vi.fn() },
		runtimes: { runtimeFor: vi.fn() },
		chat: { reportRun: vi.fn() },
		isDriverWindow,
	} as unknown as MissionRunDriverMount
	renderHook(() => useMissionRunDriver(mount))
	await act(async () => undefined)
	return { startOrResumeSession }
}

describe("useMissionRunDriver", () => {
	afterEach(() => {
		cleanup()
		vi.clearAllMocks()
	})

	it("starts no run in a window that does not drive", async () => {
		const { startOrResumeSession } = await mountIn(false)

		expect(transport.unreported).not.toHaveBeenCalled()
		expect(transport.onChanged).not.toHaveBeenCalled()
		expect(startOrResumeSession).not.toHaveBeenCalled()
	})

	it("takes the missions owing a report in the window that drives", async () => {
		await mountIn(true)

		expect(transport.unreported).toHaveBeenCalledTimes(1)
		expect(transport.onChanged).toHaveBeenCalledTimes(1)
	})
})
