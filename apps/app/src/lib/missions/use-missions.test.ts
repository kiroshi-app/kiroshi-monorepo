// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Mission, MissionChanged } from "./mission-contract"
import { aSpacePage } from "./mission-fixtures"
import { missionsTransport } from "./missions-transport"
import { useMissions } from "./use-missions"
import { useSpaceMissions } from "./use-space-missions"

import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"

vi.mock("./missions-transport", () => ({
	missionsTransport: {
		list: vi.fn(),
		spacePage: vi.fn(),
		onChanged: vi.fn(),
	},
}))

const reachable = vi.hoisted(() => ({ host: "local" as string | null }))

vi.mock("@/lib/host/use-reachable-host", () => ({
	useReachableHost: () => reachable.host,
}))

const listMissions = vi.mocked(missionsTransport.list)
const readSpacePage = vi.mocked(missionsTransport.spacePage)
const listenToMissions = vi.mocked(missionsTransport.onChanged)

const MISSION: Mission = {
	id: "m-1",
	originConversationId: "c-1",
	spaceId: null,
	botId: "bot-1",
	threadConversationId: "c-mission-1",
	objective: "Rewrite the changelog parser",
	ticket: {
		platform: "linear",
		externalId: "OPE-42",
		url: "https://linear.app/ope-42",
		title: "Changelog parser",
	},
	tools: ["Read"],
	state: "working",
	stateSeq: 1,
	isAgentRunning: false,
	openedAt: 0,
	closedAt: null,
	reportedAt: null,
	reportedTurnId: null,
	status: null,
	lastActivityAt: null,
	lastActivity: null,
	commitsAhead: null,
	dirtyFiles: null,
	pullRequestUrl: null,
	branch: null,
	workspacePath: null,
}

const A_MINUTE_MS = 60_000

describe("useMissions", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		reachable.host = "local"
		listMissions.mockResolvedValue({ open: [MISSION], done: [] })
		listenToMissions.mockResolvedValue(() => undefined)
	})

	afterEach(() => {
		cleanup()
		vi.useRealTimers()
	})

	it("reads the missions of the conversation once they are listed", async () => {
		const { result } = renderHook(() => useMissions("c-1"), {
			wrapper: createQueryTestWrapper().wrapper,
		})

		await waitFor(() => expect(result.current.missions).toEqual([MISSION]))
		expect(result.current.open).toHaveLength(1)
		expect(result.current.hasFailed).toBe(false)
	})

	it("reads pending until the missions answer, then settles on an empty answer", async () => {
		const listing = Promise.withResolvers<{
			open: Mission[]
			done: Mission[]
		}>()
		listMissions.mockReturnValue(listing.promise)
		const { result } = renderHook(() => useMissions("c-1"), {
			wrapper: createQueryTestWrapper().wrapper,
		})

		await waitFor(() => expect(result.current.isPending).toBe(true))
		expect(result.current.hasFailed).toBe(false)

		act(() => listing.resolve({ open: [], done: [] }))

		await waitFor(() => expect(result.current.isPending).toBe(false))
		expect(result.current.missions).toEqual([])
		expect(result.current.hasFailed).toBe(false)
	})

	it("holds its read still when the roster clock ticks", async () => {
		const { result } = renderHook(() => useMissions("c-1"), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await waitFor(() => expect(result.current.missions).toEqual([MISSION]))
		const read = result.current

		vi.useFakeTimers()
		vi.setSystemTime(Date.now() + A_MINUTE_MS)
		act(() => {
			document.dispatchEvent(new Event("visibilitychange"))
		})

		expect(result.current).toBe(read)
	})

	it("applies the activity of a change naming a held mission before the reread returns", async () => {
		let announce: (changed: MissionChanged) => void = () => undefined
		listenToMissions.mockImplementation((listener) => {
			announce = listener
			return Promise.resolve(() => undefined)
		})
		const { result } = renderHook(() => useMissions("c-1"), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await waitFor(() => expect(result.current.missions).toEqual([MISSION]))
		listMissions.mockReturnValue(new Promise(() => undefined))

		act(() =>
			announce({
				missionId: "m-1",
				spaceId: null,
				state: "working",
				stateSeq: 2,
				isAgentRunning: true,
				lastActivityAt: 42,
			}),
		)

		await waitFor(() =>
			expect(result.current.open).toEqual([
				{ ...MISSION, isAgentRunning: true, lastActivityAt: 42 },
			]),
		)
	})

	it("holds its read when a change names a mission it does not hold", async () => {
		let announce: (changed: MissionChanged) => void = () => undefined
		listenToMissions.mockImplementation((listener) => {
			announce = listener
			return Promise.resolve(() => undefined)
		})
		const { result } = renderHook(() => useMissions("c-1"), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await waitFor(() => expect(result.current.missions).toEqual([MISSION]))
		listMissions.mockReturnValue(new Promise(() => undefined))
		const read = result.current

		act(() =>
			announce({
				missionId: "m-2",
				spaceId: null,
				state: "working",
				stateSeq: 2,
				isAgentRunning: true,
				lastActivityAt: 42,
			}),
		)
		await waitFor(() => expect(listMissions).toHaveBeenCalledTimes(2))
		await act(() => new Promise((settle) => setTimeout(settle, 0)))

		expect(result.current).toBe(read)
	})

	it("lists the missions once for two readers of the same conversation", async () => {
		const { result } = renderHook(
			() => ({ panel: useMissions("c-1"), thread: useMissions("c-1") }),
			{ wrapper: createQueryTestWrapper().wrapper },
		)

		await waitFor(() =>
			expect(result.current.thread.missions).toEqual([MISSION]),
		)
		expect(result.current.panel.missions).toEqual([MISSION])
		expect(listMissions).toHaveBeenCalledTimes(1)
	})

	it("reads nothing while no host is reachable", async () => {
		reachable.host = null
		const { result } = renderHook(() => useMissions("c-1"), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await act(async () => undefined)

		expect(listMissions).not.toHaveBeenCalled()
		expect(result.current.missions).toEqual([])
		expect(result.current.hasFailed).toBe(false)
	})

	it("reads the missions again when they mount after every reader left", async () => {
		const { wrapper } = createQueryTestWrapper()
		const first = renderHook(() => useMissions("c-1"), { wrapper })
		await waitFor(() =>
			expect(first.result.current.missions).toEqual([MISSION]),
		)
		first.unmount()

		const second = renderHook(() => useMissions("c-1"), { wrapper })

		expect(second.result.current.missions).toEqual([MISSION])
		await waitFor(() => expect(listMissions).toHaveBeenCalledTimes(2))
	})

	it("flags a rejected read and keeps it flagged while the reader retries", async () => {
		listMissions.mockRejectedValue(new Error("unreadable"))
		const { result } = renderHook(() => useMissions("c-1"), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await waitFor(() => expect(result.current.hasFailed).toBe(true))
		listMissions.mockReturnValue(new Promise(() => undefined))

		act(() => result.current.reload())
		await act(() => new Promise((settle) => setTimeout(settle, 0)))

		expect(listMissions).toHaveBeenCalledTimes(2)
		expect(result.current.hasFailed).toBe(true)
	})

	it("patches a change into the conversation and the space feed it holds at once", async () => {
		let announce: (changed: MissionChanged) => void = () => undefined
		listenToMissions.mockImplementation((listener) => {
			announce = listener
			return Promise.resolve(() => undefined)
		})
		readSpacePage.mockResolvedValue(
			aSpacePage([
				{
					mission: MISSION,
					conversationId: "c-1",
					conversationTitle: "Crashes",
				},
			]),
		)
		const { result } = renderHook(
			() => ({ panel: useMissions("c-1"), feed: useSpaceMissions("s-1") }),
			{ wrapper: createQueryTestWrapper().wrapper },
		)
		await waitFor(() => expect(result.current.feed.inProgress).toHaveLength(1))
		await waitFor(() => expect(result.current.panel.open).toHaveLength(1))
		listMissions.mockReturnValue(new Promise(() => undefined))
		readSpacePage.mockReturnValue(new Promise(() => undefined))

		act(() =>
			announce({
				missionId: "m-1",
				spaceId: null,
				state: "waiting_human",
				stateSeq: 2,
				isAgentRunning: true,
				lastActivityAt: 42,
			}),
		)

		await waitFor(() =>
			expect(
				result.current.feed.waitingOnYou.map(({ mission }) => mission.id),
			).toEqual(["m-1"]),
		)
		expect(result.current.panel.open[0]).toMatchObject({
			isAgentRunning: true,
			lastActivityAt: 42,
		})
		expect(listenToMissions).toHaveBeenCalledTimes(1)
		expect(listMissions).toHaveBeenCalledTimes(2)
		expect(readSpacePage).toHaveBeenCalledTimes(2)
	})

	describe("when changes arrive in a burst", () => {
		const A_CHANGE: MissionChanged = {
			missionId: "m-1",
			spaceId: null,
			state: "working",
			stateSeq: 2,
			isAgentRunning: true,
			lastActivityAt: 42,
		}
		let announce: (changed: MissionChanged) => void = () => undefined

		const mountSettled = async () => {
			const mounted = renderHook(() => useMissions("c-1"), {
				wrapper: createQueryTestWrapper().wrapper,
			})
			await act(async () => undefined)
			listMissions.mockClear()
			return mounted
		}

		beforeEach(() => {
			vi.useFakeTimers()
			listenToMissions.mockImplementation((listener) => {
				announce = listener
				return Promise.resolve(() => undefined)
			})
		})

		it("lists the missions at most once a second while the burst lasts", async () => {
			await mountSettled()
			listMissions.mockClear()
			const readAt: number[] = []
			listMissions.mockImplementation(() => {
				readAt.push(Date.now())
				return new Promise(() => undefined)
			})

			for (let elapsed = 0; elapsed < 3000; elapsed += 100) {
				act(() => announce(A_CHANGE))
				act(() => vi.advanceTimersByTime(100))
			}

			const gaps = readAt.slice(1).map((at, i) => at - readAt[i])
			expect(readAt.length).toBeGreaterThan(1)
			expect(gaps.every((gap) => gap >= 1000)).toBe(true)
		})

		it("lists the missions once after the burst ends", async () => {
			await mountSettled()
			for (let change = 0; change < 5; change += 1) {
				act(() => announce(A_CHANGE))
			}

			act(() => vi.advanceTimersByTime(5000))

			expect(listMissions).toHaveBeenCalledTimes(2)
		})

		it("drops the pending list when it unmounts", async () => {
			const { unmount } = await mountSettled()
			act(() => announce(A_CHANGE))
			act(() => announce(A_CHANGE))

			unmount()
			act(() => vi.advanceTimersByTime(5000))

			expect(listMissions).toHaveBeenCalledTimes(1)
		})
	})
})
