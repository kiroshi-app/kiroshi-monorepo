// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type {
	MissionChanged,
	MissionInSpace,
	MissionSpacePage,
} from "./mission-contract"
import { aMission, aSpacePage } from "./mission-fixtures"
import { missionsTransport } from "./missions-transport"
import { useSpaceMissions } from "./use-space-missions"

import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"

vi.mock("./missions-transport", () => ({
	missionsTransport: {
		spacePage: vi.fn(),
		onChanged: vi.fn(),
	},
}))

const readSpacePage = vi.mocked(missionsTransport.spacePage)
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
		readSpacePage.mockResolvedValue(aSpacePage([WORKING]))
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
		expect(readSpacePage).toHaveBeenCalledWith(
			"s-1",
			midnight.getTime(),
			null,
			30,
		)
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
		readSpacePage.mockReturnValue(new Promise(() => undefined))

		act(() => {
			announce({
				missionId: "m-1",
				spaceId: null,
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
		expect(readSpacePage).toHaveBeenCalledTimes(2)
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
		readSpacePage.mockReturnValue(new Promise(() => undefined))

		act(() => {
			announce({
				missionId: "m-1",
				spaceId: null,
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
		readSpacePage.mockRejectedValue(new Error("the database is locked"))

		act(() => result.current.reload())

		await waitFor(() => expect(result.current.hasFailed).toBe(true))
		expect(idsOf(result.current.inProgress)).toEqual(["m-1"])
	})

	it("issues no read and holds empty groups without a space", () => {
		const { result } = renderHook(() => useSpaceMissions(null), {
			wrapper: createQueryTestWrapper().wrapper,
		})

		expect(readSpacePage).not.toHaveBeenCalled()
		expect(result.current.waitingOnYou).toEqual([])
		expect(result.current.inProgress).toEqual([])
		expect(result.current.earlierToday).toEqual([])
		expect(result.current.waitingCount).toBe(0)
	})

	it("drops a read that answers after the space changed", async () => {
		let answerFirst: (page: MissionSpacePage) => void = () => undefined
		readSpacePage.mockReturnValueOnce(
			new Promise((resolve) => {
				answerFirst = resolve
			}),
		)
		readSpacePage.mockResolvedValueOnce(aSpacePage([ELSEWHERE]))
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

		await act(async () => answerFirst(aSpacePage([WORKING])))

		expect(idsOf(result.current.inProgress)).toEqual(["m-2"])
	})
	describe("the skeleton of the feed", () => {
		const mountFeed = () =>
			renderHook(() => useSpaceMissions("s-1"), {
				wrapper: createQueryTestWrapper().wrapper,
			})

		it("waits on its first read while nothing is held", () => {
			readSpacePage.mockReturnValue(new Promise(() => undefined))

			const { result } = mountFeed()

			expect(result.current.isPending).toBe(true)
		})

		it("keeps the feed it holds while it reads it again", async () => {
			const { result } = mountFeed()
			await waitFor(() => expect(result.current.hasLoaded).toBe(true))
			readSpacePage.mockReturnValue(new Promise(() => undefined))

			act(() => result.current.reload())

			expect(readSpacePage).toHaveBeenCalledTimes(2)
			expect(result.current.isPending).toBe(false)
		})

		it("stops waiting once the read fails, retry included", async () => {
			readSpacePage.mockRejectedValueOnce(new Error("the database is locked"))
			const { result } = mountFeed()
			await waitFor(() => expect(result.current.hasFailed).toBe(true))
			readSpacePage.mockReturnValue(new Promise(() => undefined))

			act(() => result.current.reload())

			expect(result.current.isPending).toBe(false)
		})
	})
})
