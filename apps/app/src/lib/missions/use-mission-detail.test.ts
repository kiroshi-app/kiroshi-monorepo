// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { MissionChanged, MissionDetail } from "./mission-contract"
import { missionsTransport } from "./missions-transport"
import { useMissionDetail } from "./use-mission-detail"

import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"

vi.mock("./missions-transport", async (importOriginal) => ({
	...(await importOriginal<typeof import("./missions-transport")>()),
	missionsTransport: { detail: vi.fn(), onChanged: vi.fn() },
}))

const readDetail = vi.mocked(missionsTransport.detail)
const onChanged = vi.mocked(missionsTransport.onChanged)

const DETAIL: MissionDetail = {
	mission: {
		id: "m-1",
		originConversationId: "c-1",
		spaceId: null,
		botId: "b-1",
		threadConversationId: "c-2",
		objective: "Ship the mission thread.",
		ticket: {
			platform: "linear",
			externalId: "OPE-30",
			url: "https://example.com/OPE-30",
			title: "Mission thread screen",
		},
		tools: ["Repository"],
		state: "working",
		stateSeq: 1,
		isAgentRunning: false,
		openedAt: 1,
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
	},
	events: [
		{
			id: "e-1",
			missionId: "m-1",
			kind: "opened",
			source: "bot",
			payload: null,
			createdAt: 2,
		},
	],
}

let announce: (changed: MissionChanged) => void

beforeEach(() => {
	readDetail.mockReset().mockResolvedValue(DETAIL)
	onChanged.mockReset().mockImplementation((listener) => {
		announce = listener
		return Promise.resolve(() => undefined)
	})
})

afterEach(cleanup)

it("reads the mission it is opened on", async () => {
	const { result } = renderHook(() => useMissionDetail("m-1"), {
		wrapper: createQueryTestWrapper().wrapper,
	})

	await waitFor(() => expect(result.current.isReading).toBe(false))

	expect(readDetail).toHaveBeenCalledWith("m-1")
	expect(result.current.read?.mission).toEqual(DETAIL.mission)
	expect(result.current.read?.events).toHaveLength(1)
})

it("leaves the mission alone when a change names another one", async () => {
	const { result } = renderHook(() => useMissionDetail("m-1"), {
		wrapper: createQueryTestWrapper().wrapper,
	})

	await waitFor(() => expect(result.current.isReading).toBe(false))

	announce({
		missionId: "m-2",
		spaceId: null,
		state: "done",
		stateSeq: 2,
		isAgentRunning: false,
		lastActivityAt: null,
	})

	expect(readDetail).toHaveBeenCalledTimes(1)
})

it("reports a failed read and reads again on retry", async () => {
	readDetail.mockRejectedValueOnce({ kind: "unknownMission", id: "m-1" })

	const { result } = renderHook(() => useMissionDetail("m-1"), {
		wrapper: createQueryTestWrapper().wrapper,
	})

	await waitFor(() => expect(result.current.hasFailedToRead).toBe(true))

	result.current.onRetry()

	await waitFor(() => expect(result.current.hasFailedToRead).toBe(false))
	expect(result.current.read?.mission).toEqual(DETAIL.mission)
})

it("applies the activity of a change naming it before the reread returns", async () => {
	const { result } = renderHook(() => useMissionDetail("m-1"), {
		wrapper: createQueryTestWrapper().wrapper,
	})
	await waitFor(() => expect(result.current.isReading).toBe(false))
	readDetail.mockReturnValue(new Promise(() => undefined))

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
		expect(result.current.read?.mission).toMatchObject({
			isAgentRunning: true,
			lastActivityAt: 42,
		}),
	)
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

	const mountSettled = async () => {
		const mounted = renderHook(() => useMissionDetail("m-1"), {
			wrapper: createQueryTestWrapper().wrapper,
		})
		await act(() => vi.advanceTimersByTimeAsync(0))
		return mounted
	}

	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("reads the mission at most once a second while the burst lasts", async () => {
		await mountSettled()
		readDetail.mockClear()
		const readAt: number[] = []
		readDetail.mockImplementation(() => {
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

	it("reads the mission once after the burst ends", async () => {
		await mountSettled()
		readDetail.mockClear()
		for (let change = 0; change < 5; change += 1) {
			act(() => announce(A_CHANGE))
		}

		act(() => vi.advanceTimersByTime(5000))

		expect(readDetail).toHaveBeenCalledTimes(2)
	})

	it("drops the pending read when it unmounts", async () => {
		const { unmount } = await mountSettled()
		readDetail.mockClear()
		act(() => announce(A_CHANGE))
		act(() => announce(A_CHANGE))

		unmount()
		act(() => vi.advanceTimersByTime(5000))

		expect(readDetail).toHaveBeenCalledTimes(1)
	})

	it("stays out of its reading state while it reads again on a change", async () => {
		const { result } = await mountSettled()
		readDetail.mockReturnValue(new Promise(() => undefined))

		act(() => announce(A_CHANGE))
		act(() => vi.advanceTimersByTime(0))

		expect(readDetail).toHaveBeenCalledTimes(2)
		expect(result.current.isReading).toBe(false)
	})

	it("enters its reading state when the reader retries", async () => {
		const { result } = await mountSettled()
		readDetail.mockReturnValue(new Promise(() => undefined))

		act(() => result.current.onRetry())

		expect(result.current.isReading).toBe(true)
	})
})

describe("the skeleton of the mission detail", () => {
	const mountDetail = () =>
		renderHook(() => useMissionDetail("m-1"), {
			wrapper: createQueryTestWrapper().wrapper,
		})

	it("waits on its first read while nothing is held", () => {
		readDetail.mockReturnValue(new Promise(() => undefined))

		const { result } = mountDetail()

		expect(result.current.isPending).toBe(true)
		expect(result.current.read).toBeNull()
	})

	it("keeps the mission it holds while it reads it again", async () => {
		const { result } = mountDetail()
		await waitFor(() => expect(result.current.read).not.toBeNull())
		readDetail.mockReturnValue(new Promise(() => undefined))

		act(() => result.current.onRetry())

		expect(readDetail).toHaveBeenCalledTimes(2)
		expect(result.current.isPending).toBe(false)
	})

	it("stops waiting once the read fails, retry included", async () => {
		readDetail.mockRejectedValueOnce({ kind: "unknownMission", id: "m-1" })
		const { result } = mountDetail()
		await waitFor(() => expect(result.current.hasFailedToRead).toBe(true))
		readDetail.mockReturnValue(new Promise(() => undefined))

		act(() => result.current.onRetry())

		expect(result.current.isPending).toBe(false)
		expect(result.current.hasFailedToRead).toBe(true)
	})
})
