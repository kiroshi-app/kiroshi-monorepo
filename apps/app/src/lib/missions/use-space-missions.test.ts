// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { MissionChanged, MissionInSpace } from "./mission-contract"
import { aMission } from "./mission-fixtures"
import { missionsTransport } from "./missions-transport"
import { useSpaceMissions } from "./use-space-missions"

import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"

vi.mock("./missions-transport", () => ({
	missionsTransport: {
		spaceFeed: vi.fn(),
		onChanged: vi.fn(),
	},
}))

const readSpaceFeed = vi.mocked(missionsTransport.spaceFeed)
const listenToMissions = vi.mocked(missionsTransport.onChanged)

const WORKING: MissionInSpace = {
	mission: aMission({ id: "m-1", state: "working", stateSeq: 1 }),
	conversationId: "c-1",
	conversationTitle: "Crashes",
}

const ELSEWHERE: MissionInSpace = {
	mission: aMission({ id: "m-2", state: "working", stateSeq: 1 }),
	conversationId: "c-2",
	conversationTitle: "Billing",
}

const idsOf = (entries: MissionInSpace[]): string[] =>
	entries.map(({ mission }) => mission.id)

describe("useSpaceMissions", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		readSpaceFeed.mockResolvedValue([WORKING])
		listenToMissions.mockResolvedValue(() => undefined)
	})

	afterEach(cleanup)

	it("reads the feed of the space from the local midnight", async () => {
		const { result } = renderHook(() => useSpaceMissions("s-1"), {
			wrapper: createQueryTestWrapper().wrapper,
		})

		await waitFor(() =>
			expect(idsOf(result.current.inProgress)).toEqual(["m-1"]),
		)
		const midnight = new Date()
		midnight.setHours(0, 0, 0, 0)
		expect(readSpaceFeed).toHaveBeenCalledWith("s-1", midnight.getTime())
	})

	it("moves a mission into waiting on you when a change says so", async () => {
		let announce: (changed: MissionChanged) => void = () => undefined
		listenToMissions.mockImplementation((listener) => {
			announce = listener
			return Promise.resolve(() => undefined)
		})
		const { result } = renderHook(() => useSpaceMissions("s-1"), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await waitFor(() =>
			expect(idsOf(result.current.inProgress)).toEqual(["m-1"]),
		)
		await waitFor(() => expect(listenToMissions).toHaveBeenCalled())
		readSpaceFeed.mockReturnValue(new Promise(() => undefined))

		act(() => {
			announce({
				missionId: "m-1",
				state: "waiting_human",
				stateSeq: 2,
				isAgentRunning: false,
				lastActivityAt: null,
			})
		})

		await waitFor(() =>
			expect(idsOf(result.current.waitingOnYou)).toEqual(["m-1"]),
		)
		expect(result.current.inProgress).toEqual([])
		expect(result.current.waitingCount).toBe(1)
		expect(readSpaceFeed).toHaveBeenCalledTimes(2)
	})

	it("lists a mission a change closes in earlier today before the reread answers", async () => {
		let announce: (changed: MissionChanged) => void = () => undefined
		listenToMissions.mockImplementation((listener) => {
			announce = listener
			return Promise.resolve(() => undefined)
		})
		const { result } = renderHook(() => useSpaceMissions("s-1"), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await waitFor(() =>
			expect(idsOf(result.current.inProgress)).toEqual(["m-1"]),
		)
		await waitFor(() => expect(listenToMissions).toHaveBeenCalled())
		readSpaceFeed.mockReturnValue(new Promise(() => undefined))

		act(() => {
			announce({
				missionId: "m-1",
				state: "done",
				stateSeq: 2,
				isAgentRunning: false,
				lastActivityAt: null,
			})
		})

		await waitFor(() =>
			expect(idsOf(result.current.earlierToday)).toEqual(["m-1"]),
		)
		expect(result.current.inProgress).toEqual([])
	})

	it("flags a rejected read and keeps the missions it held", async () => {
		const { result } = renderHook(() => useSpaceMissions("s-1"), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await waitFor(() =>
			expect(idsOf(result.current.inProgress)).toEqual(["m-1"]),
		)
		readSpaceFeed.mockRejectedValue(new Error("the database is locked"))

		act(() => result.current.reload())

		await waitFor(() => expect(result.current.hasFailed).toBe(true))
		expect(idsOf(result.current.inProgress)).toEqual(["m-1"])
	})

	it("issues no read and holds empty groups without a space", () => {
		const { result } = renderHook(() => useSpaceMissions(null), {
			wrapper: createQueryTestWrapper().wrapper,
		})

		expect(readSpaceFeed).not.toHaveBeenCalled()
		expect(result.current.waitingOnYou).toEqual([])
		expect(result.current.inProgress).toEqual([])
		expect(result.current.earlierToday).toEqual([])
		expect(result.current.waitingCount).toBe(0)
	})

	it("drops a read that answers after the space changed", async () => {
		let answerFirst: (entries: MissionInSpace[]) => void = () => undefined
		readSpaceFeed.mockReturnValueOnce(
			new Promise((resolve) => {
				answerFirst = resolve
			}),
		)
		readSpaceFeed.mockResolvedValueOnce([ELSEWHERE])
		const { result, rerender } = renderHook(
			({ spaceId }) => useSpaceMissions(spaceId),
			{
				wrapper: createQueryTestWrapper().wrapper,
				initialProps: { spaceId: "s-1" },
			},
		)
		rerender({ spaceId: "s-2" })
		await waitFor(() =>
			expect(idsOf(result.current.inProgress)).toEqual(["m-2"]),
		)

		await act(async () => answerFirst([WORKING]))

		expect(idsOf(result.current.inProgress)).toEqual(["m-2"])
	})
})
