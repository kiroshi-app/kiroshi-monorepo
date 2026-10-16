// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BLANK_BOT_PERMISSIONS } from "@workspace/ui/components/bot-settings"
import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"

import type {
	Mission,
	MissionChanged,
	MissionOnBoard,
} from "./mission-contract"
import { aMission } from "./mission-fixtures"
import {
	type MissionEntry,
	missionRingBadges,
	missionsBySpaceId,
} from "./missions-model"
import { missionsTransport } from "./missions-transport"
import { useMissionMarks } from "./use-mission-marks"

import { toSpaceBadges } from "@/lib/chat/sidebar-badges"
import type { Bot } from "@/lib/conversations/store-contract"
import { hostOfflineOf } from "@/lib/host/host-offline"
import { HostRefused } from "@/lib/host/host-refused"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"
import { useRosterBotsBySpace } from "@/lib/workspace/use-roster-bots-by-space"

const reachable = vi.hoisted(() => ({ host: "local" as string | null }))

vi.mock("@/lib/host/use-reachable-host", () => ({
	LOCAL_HOST: "local",
	useReachableHost: () => reachable.host,
}))

vi.mock("@workspace/ui/components/notice-surface", () => ({
	raiseFailureNotice: vi.fn(),
}))

vi.mock("./missions-transport", () => ({
	missionsTransport: {
		board: vi.fn(),
		spaceFeed: vi.fn(),
		onChanged: vi.fn(),
	},
}))

const readBoard = vi.mocked(missionsTransport.board)
const readSpaceFeed = vi.mocked(missionsTransport.spaceFeed)
const listenToMissions = vi.mocked(missionsTransport.onChanged)

const BOT: Bot = {
	id: "bot-1",
	name: "Atlas",
	title: "",
	model: "sonnet",
	avatarBlot: "blue",
	avatarImagePath: null,
	instructions: "",
	deniedTools: [],
	permissions: BLANK_BOT_PERMISSIONS,
	outputStyle: "",
	effort: null,
	createdAt: 1,
	changesNothing: false,
	memory: "",
	sectionId: null,
	pinPosition: null,
}

const onBoard = (mission: Partial<Mission>): MissionOnBoard => ({
	mission: aMission(mission),
	bot: BOT,
})

const inSpace = (id: string) => ({
	mission: aMission({ id }),
	conversationId: "c-1",
	conversationTitle: "Crashes",
})

const LOCAL_BOARD = [onBoard({ id: "m-local" })]
const JOINED_FEED = [inSpace("m-joined")]
const OTHER_JOINED_FEED = [inSpace("m-other")]

const A_CLOSE: MissionChanged = {
	missionId: "m-local",
	state: "closed",
	stateSeq: 2,
	isAgentRunning: false,
	lastActivityAt: null,
}

const idsOf = (entries: MissionEntry[]) =>
	entries.map(({ mission }) => mission.id)

const answerFeedOf = (spaceId: string) =>
	Promise.resolve(spaceId === "joined" ? JOINED_FEED : OTHER_JOINED_FEED)

const pending = () => {
	let resolve: (entries: MissionOnBoard[]) => void = () => undefined
	const promise = new Promise<MissionOnBoard[]>((settle) => {
		resolve = settle
	})
	return { promise, resolve }
}

const renderMarks = (shown: string | null) =>
	renderHook(({ spaceId }) => useMissionMarks(spaceId), {
		initialProps: { spaceId: shown },
		wrapper: createQueryTestWrapper().wrapper,
	})

const announced = async () => {
	await waitFor(() => expect(listenToMissions).toHaveBeenCalled())
	const [announce] = listenToMissions.mock.calls[0]
	return announce
}

beforeEach(() => {
	vi.clearAllMocks()
	reachable.host = "local"
	readBoard.mockResolvedValue(LOCAL_BOARD)
	readSpaceFeed.mockImplementation(answerFeedOf)
	listenToMissions.mockResolvedValue(() => undefined)
})

afterEach(cleanup)

describe("useMissionMarks on a local Space", () => {
	it("reads the local board and never the feed", async () => {
		const { result } = renderMarks("space-a")

		await waitFor(() => expect(idsOf(result.current)).toEqual(["m-local"]))
		expect(readSpaceFeed).not.toHaveBeenCalled()
	})

	it("keeps the marks of the board on a local Space change without reading it again", async () => {
		const { result, rerender } = renderMarks("space-a")
		await waitFor(() => expect(idsOf(result.current)).toEqual(["m-local"]))

		rerender({ spaceId: "space-b" })

		expect(readBoard).toHaveBeenCalledOnce()
		expect(idsOf(result.current)).toEqual(["m-local"])
	})

	it("drops the mark of a mission closed once a change arrives", async () => {
		const { result } = renderMarks("space-a")
		await waitFor(() => expect(idsOf(result.current)).toEqual(["m-local"]))
		const announce = await announced()

		readBoard.mockResolvedValue([])
		act(() => announce(A_CLOSE))

		await waitFor(() => expect(result.current).toEqual([]), { timeout: 2000 })
	})

	it("raises one notice when the board keeps failing", async () => {
		readBoard.mockRejectedValue(new Error("no board"))
		const { result } = renderMarks("space-a")
		await waitFor(() => expect(raiseFailureNotice).toHaveBeenCalledOnce())
		const announce = await announced()

		act(() => announce(A_CLOSE))

		await waitFor(() => expect(readBoard).toHaveBeenCalledTimes(2), {
			timeout: 2000,
		})
		await Promise.resolve()
		expect(raiseFailureNotice).toHaveBeenCalledOnce()
		expect(raiseFailureNotice).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "Couldn’t load missions",
				description: "Restart Kiroshi to retry.",
				report: expect.objectContaining({
					context: expect.objectContaining({ raisedIn: "use-mission-marks" }),
				}),
			}),
		)
		expect(result.current).toEqual([])
	})

	it("raises a notice again once a read succeeded between two failures", async () => {
		readBoard.mockRejectedValueOnce(new Error("no board"))
		const { result } = renderMarks("space-a")
		await waitFor(() => expect(raiseFailureNotice).toHaveBeenCalledOnce())
		const announce = await announced()

		act(() => announce(A_CLOSE))
		await waitFor(() => expect(idsOf(result.current)).toEqual(["m-local"]))

		readBoard.mockRejectedValueOnce(new Error("no board"))
		act(() => announce(A_CLOSE))

		await waitFor(() => expect(raiseFailureNotice).toHaveBeenCalledTimes(2), {
			timeout: 2000,
		})
		expect(result.current).toEqual([])
	})

	it("stops listening for mission changes once unmounted", async () => {
		const stopListening = vi.fn()
		listenToMissions.mockResolvedValue(stopListening)
		const { unmount } = renderMarks("space-a")
		await waitFor(() => expect(listenToMissions).toHaveBeenCalled())

		unmount()

		await waitFor(() => expect(stopListening).toHaveBeenCalled())
	})
})

describe("useMissionMarks on a joined Space", () => {
	beforeEach(() => {
		reachable.host = "garage"
	})

	it("reads only the open missions of the shown Space and never the board", async () => {
		const before = Date.now()
		const { result } = renderMarks("joined")

		await waitFor(() => expect(idsOf(result.current)).toEqual(["m-joined"]))
		const [spaceId, closedSince] = readSpaceFeed.mock.calls[0]
		expect(spaceId).toBe("joined")
		expect(closedSince).toBeGreaterThanOrEqual(before)
		expect(readBoard).not.toHaveBeenCalled()
	})

	it("re-reads the marks when the shown joined Space changes", async () => {
		const { result, rerender } = renderMarks("joined")
		await waitFor(() => expect(idsOf(result.current)).toEqual(["m-joined"]))

		rerender({ spaceId: "other-joined" })

		expect(result.current).toEqual([])
		await waitFor(() => expect(idsOf(result.current)).toEqual(["m-other"]))
	})

	it("shows the marks of each side across a switch to local and back", async () => {
		const { result, rerender } = renderMarks("joined")
		await waitFor(() => expect(idsOf(result.current)).toEqual(["m-joined"]))

		reachable.host = "local"
		rerender({ spaceId: "space-a" })
		expect(result.current).toEqual([])
		await waitFor(() => expect(idsOf(result.current)).toEqual(["m-local"]))

		reachable.host = "garage"
		rerender({ spaceId: "joined" })
		expect(idsOf(result.current)).toEqual(["m-joined"])
		await waitFor(() => expect(readSpaceFeed).toHaveBeenCalledTimes(2))
		expect(readBoard).toHaveBeenCalledOnce()
	})

	it("keeps an answer of a Space it left from landing", async () => {
		const late = pending()
		reachable.host = "local"
		readBoard.mockReturnValueOnce(late.promise)
		const { result, rerender } = renderMarks("space-a")

		reachable.host = "garage"
		rerender({ spaceId: "joined" })
		await waitFor(() => expect(idsOf(result.current)).toEqual(["m-joined"]))
		await act(async () => late.resolve(LOCAL_BOARD))

		expect(idsOf(result.current)).toEqual(["m-joined"])
	})

	it("shows no marks while the host is unreachable and re-reads once it is back", async () => {
		const { result, rerender } = renderMarks("joined")
		await waitFor(() => expect(idsOf(result.current)).toEqual(["m-joined"]))

		reachable.host = null
		rerender({ spaceId: "joined" })

		expect(result.current).toEqual([])
		expect(readSpaceFeed).toHaveBeenCalledOnce()

		reachable.host = "garage"
		rerender({ spaceId: "joined" })

		await waitFor(() => expect(idsOf(result.current)).toEqual(["m-joined"]))
		expect(readSpaceFeed).toHaveBeenCalledTimes(2)
		expect(readBoard).not.toHaveBeenCalled()
		expect(raiseFailureNotice).not.toHaveBeenCalled()
	})

	it("raises no notice when the host refuses the feed", async () => {
		readSpaceFeed.mockRejectedValue(new HostRefused("forbidden", "403"))

		const { result } = renderMarks("joined")

		await waitFor(() => expect(readSpaceFeed).toHaveBeenCalled())
		await Promise.resolve()
		expect(result.current).toEqual([])
		expect(raiseFailureNotice).not.toHaveBeenCalled()
	})

	it("raises no notice when the host drops while the feed is read", async () => {
		readSpaceFeed.mockRejectedValue(hostOfflineOf("the host is offline"))

		const { result } = renderMarks("joined")

		await waitFor(() => expect(readSpaceFeed).toHaveBeenCalled())
		await Promise.resolve()
		expect(result.current).toEqual([])
		expect(raiseFailureNotice).not.toHaveBeenCalled()
	})
})

describe("the rail rings of local Spaces", () => {
	const ROSTERS = { "space-a": [BOT], "space-b": [{ ...BOT, id: "bot-2" }] }
	const SOLO_THREADS = {
		"chat-a": { spaceId: "space-a", botId: "bot-1" },
		"chat-b": { spaceId: "space-b", botId: "bot-2" },
	}
	const NO_WAITING = new Set<string>()

	const useRailRings = (shownSpaceId: string) => {
		const entries = useMissionMarks(shownSpaceId)
		const missions = missionsBySpaceId({
			entries,
			conversationRosters: {},
			soloThreads: SOLO_THREADS,
			waitingMissionIds: NO_WAITING,
		})
		const botsBySpace = useRosterBotsBySpace({
			badges: {},
			missions,
			now: 0,
			previews: {} as never,
			rosters: ROSTERS,
			working: {} as never,
		})
		return toSpaceBadges(botsBySpace, missionRingBadges(botsBySpace))
	}

	it("keeps the ring of a local Space that is not shown", async () => {
		readBoard.mockResolvedValue([
			onBoard({
				id: "m-b",
				botId: "bot-2",
				originConversationId: "chat-b",
				state: "waiting_human",
			}),
		])

		const { result } = renderHook(() => useRailRings("space-a"), {
			wrapper: createQueryTestWrapper().wrapper,
		})

		await waitFor(() => expect(result.current["space-b"]).toBe("attention"))
		expect(result.current["space-a"]).toBeUndefined()
	})
})
