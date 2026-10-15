// @vitest-environment happy-dom

import type { EventCallback } from "@tauri-apps/api/event"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { createElement, type PropsWithChildren, StrictMode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Mission, MissionInSpace } from "./mission-contract"
import { aSpacePage } from "./mission-fixtures"
import { missionsTransport } from "./missions-transport"
import { useSpaceMissionsFailure } from "./use-mission-failure-notices"
import { useMissionMarks } from "./use-mission-marks"
import { useMissions } from "./use-missions"
import { useSpaceMissions } from "./use-space-missions"

import {
	JOINED_SPACE_RECONNECTED_EVENT,
	type JoinedSpaceReconnected,
} from "../bindings"
import type { FailureFacts } from "../failure-report"
import { invalidateOnHostReconnect } from "@/lib/query/host-invalidations"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"
import { type HostSocket, raiseRefusalNotice } from "../host/http"
import { createJoinedHosts, type JoinedHosts } from "../host/joined-hosts"

const HOST = "http://192.168.1.20:45367"

type Answer = (command: string) => Promise<unknown>

type RaisedNotice = {
	title: string
	facts: FailureFacts
}

const wire = vi.hoisted(() => ({
	localAnswer: (async (command) =>
		command === "conversation_local_ids" ? [] : null) as Answer,
	hostAnswer: (async () => null) as Answer,
	sockets: [] as HostSocket[],
	relays: new Set<EventCallback<JoinedSpaceReconnected>>(),
	hostReads: [] as string[],
	failedReads: new Map<string, () => Response>(),
	raised: [] as RaisedNotice[],
	joinedHosts: null as JoinedHosts | null,
}))

vi.mock("../failure-report", async (original) => ({
	...(await original<object>()),
	raiseReportedFailure: (notice: { title: string }, facts: FailureFacts) => {
		wire.raised.push({ title: notice.title, facts })
		return `notice-${wire.raised.length}`
	},
}))

vi.mock("../host", () => {
	const joinedHosts = new Proxy({} as JoinedHosts, {
		get: (_, key) => {
			if (!wire.joinedHosts) {
				throw new Error("no joined-hosts router built for this test")
			}
			return Reflect.get(wire.joinedHosts, key)
		},
	})
	return {
		joinedHosts,
		activeJoinedSpaceId: () => joinedHosts.activeSpaceId(),
		invoke: ((...args: Parameters<JoinedHosts["invoke"]>) =>
			joinedHosts.invoke(...args)) as JoinedHosts["invoke"],
		listen: ((...args: Parameters<JoinedHosts["listen"]>) =>
			joinedHosts.listen(...args)) as JoinedHosts["listen"],
		onHostReconnected: ((...args: Parameters<JoinedHosts["onReconnected"]>) =>
			joinedHosts.onReconnected(...args)) as JoinedHosts["onReconnected"],
	}
})

const reconnectingQueryWrapper = () => {
	const { queryClient, wrapper } = createQueryTestWrapper()
	invalidateOnHostReconnect(queryClient)
	return wrapper
}

const buildJoinedHosts = (): JoinedHosts =>
	createJoinedHosts({
		local: {
			invoke: ((command: string) => wire.localAnswer(command)) as never,
			listen: async (event, handler) => {
				if (event === JOINED_SPACE_RECONNECTED_EVENT) {
					wire.relays.add(handler as EventCallback<JoinedSpaceReconnected>)
				}
				return () => undefined
			},
			fileSrc: (path) => path,
		},
		join: async (id) => ({
			status: "ok",
			data: {
				id,
				hostUrl: HOST,
				token: "joined",
				remoteSpaceId: null,
				name: id,
			},
		}),
		fetch: async (input) => {
			const command = decodeURIComponent(String(input).split("/").pop() ?? "")
			wire.hostReads.push(command)
			const failedRead = wire.failedReads.get(command)
			if (failedRead) {
				return failedRead()
			}
			return new Response(JSON.stringify(await wire.hostAnswer(command)), {
				headers: { "content-type": "application/json" },
			})
		},
		openSocket: () => {
			const socket: HostSocket = {
				onopen: null,
				onmessage: null,
				onclose: null,
				close: () => undefined,
			}
			wire.sockets.push(socket)
			return socket
		},
		reportFailure: raiseRefusalNotice,
	})

const { joinedHosts } = await import("../host")

const missionOf = (id: string, objective: string): Mission => ({
	id,
	originConversationId: "c-1",
	botId: "bot-on-host",
	threadConversationId: `c-${id}`,
	objective,
	ticket: {
		platform: "linear",
		externalId: "OPE-42",
		url: "https://linear.app/ope-42",
		title: "Changelog parser",
	},
	tools: [],
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
})

const HOST_MISSION = missionOf("m-host", "Rewrite the changelog parser")
const LOCAL_MISSION = missionOf("m-local", "A mission of the guest's own")

const deferred = <T>() => {
	let resolve: (value: T) => void = () => undefined
	const promise = new Promise<T>((settle) => {
		resolve = settle
	})
	return { promise, resolve }
}

const answering =
	(answers: Record<string, unknown>): Answer =>
	async (command) =>
		answers[command] ?? null

const HOST_FEED: MissionInSpace[] = [
	{
		mission: HOST_MISSION,
		conversationId: "c-1",
		conversationTitle: "Parser",
	},
]

const hostAnswers = answering({
	mission_list: { open: [HOST_MISSION], done: [] },
	mission_space_feed: HOST_FEED,
	mission_space_page: aSpacePage(HOST_FEED),
})

const objectivesOf = (missions: Mission[]) =>
	missions.map(({ objective }) => objective)

const lastSocket = () => wire.sockets[wire.sockets.length - 1]

const openLastSocket = () =>
	act(() => {
		const socket = lastSocket()
		socket?.onopen?.call(socket as WebSocket, new Event("open"))
	})

const reopenRelay = (id: string) =>
	act(async () => {
		for (const relay of wire.relays) {
			relay({ event: JOINED_SPACE_RECONNECTED_EVENT, id: 0, payload: { id } })
		}
	})

const readsOf = (command: string) =>
	wire.hostReads.filter((read) => read === command).length

const settled = () =>
	act(async () => {
		for (let round = 0; round < 20; round += 1) {
			await Promise.resolve()
		}
	})

const dropLastSocket = () => {
	vi.useFakeTimers()
	act(() => {
		const socket = lastSocket()
		socket?.onclose?.call(socket as WebSocket, new Event("close") as CloseEvent)
	})
	vi.runOnlyPendingTimers()
	vi.useRealTimers()
}

const joinGarage = async () => {
	wire.localAnswer = answering({ mission_list: { open: [], done: [] } })
	await joinedHosts.activate("garage")
	await openLastSocket()
}

const activityPanelOnGarage = async () => {
	await joinGarage()
	const rendered = renderHook(() => useMissions("c-1"), {
		wrapper: reconnectingQueryWrapper(),
	})
	await waitFor(() =>
		expect(objectivesOf(rendered.result.current.open)).toEqual([
			HOST_MISSION.objective,
		]),
	)
	return rendered
}

describe("missions read on a joined host", () => {
	beforeEach(() => {
		wire.joinedHosts = buildJoinedHosts()
		wire.sockets.length = 0
		wire.relays.clear()
		wire.hostReads.length = 0
		wire.hostAnswer = hostAnswers
	})

	afterEach(() => {
		cleanup()
		joinedHosts.forget("garage")
	})

	it("shows the host's missions once the host of the selected space becomes active", async () => {
		const localRead = deferred<unknown>()
		wire.localAnswer = async (command) =>
			command === "conversation_local_ids" ? [] : localRead.promise
		const { result } = renderHook(
			() => ({
				conversation: useMissions("c-1"),
				space: useSpaceMissions("space-on-host"),
			}),
			{ wrapper: reconnectingQueryWrapper() },
		)

		await act(() => joinedHosts.activate("garage"))
		await openLastSocket()
		await waitFor(() =>
			expect(objectivesOf(result.current.conversation.open)).toEqual([
				HOST_MISSION.objective,
			]),
		)
		await act(async () => {
			localRead.resolve([{ mission: LOCAL_MISSION, conversationId: "c-1" }])
		})

		expect(objectivesOf(result.current.conversation.missions)).toEqual([
			HOST_MISSION.objective,
		])
		expect(
			result.current.space.inProgress.map(({ mission }) => mission.objective),
		).toEqual([HOST_MISSION.objective])
	})

	it("reads the missions again when the active host reconnects", async () => {
		wire.localAnswer = answering({
			conversation_local_ids: [],
			mission_list: { open: [], done: [] },
		})
		await joinedHosts.activate("garage")
		await openLastSocket()
		const { result } = renderHook(() => useMissions("c-1"), {
			wrapper: reconnectingQueryWrapper(),
		})
		await waitFor(() =>
			expect(objectivesOf(result.current.open)).toEqual([
				HOST_MISSION.objective,
			]),
		)

		dropLastSocket()
		const reopened = missionOf("m-reopened", "Ship the parser")
		wire.hostAnswer = answering({
			mission_list: { open: [reopened], done: [] },
		})
		await openLastSocket()

		await waitFor(() =>
			expect(objectivesOf(result.current.open)).toEqual([reopened.objective]),
		)
	})

	it("marks the host's open missions without asking the host for its board", async () => {
		const asked: string[] = []
		wire.hostAnswer = async (command) => {
			asked.push(command)
			return hostAnswers(command)
		}
		await joinedHosts.activate("garage")
		await openLastSocket()
		const { result } = renderHook(() => useMissionMarks("space-on-host"), {
			wrapper: reconnectingQueryWrapper(),
		})

		await waitFor(() =>
			expect(
				objectivesOf(result.current.map(({ mission }) => mission)),
			).toEqual([HOST_MISSION.objective]),
		)
		expect(await missionsTransport.board()).toEqual([])
		expect(asked).not.toContain("mission_board")
	})

	it("drops the marks while the host is down and reads them again once it is back", async () => {
		await joinedHosts.activate("garage")
		await openLastSocket()
		const { result } = renderHook(() => useMissionMarks("space-on-host"), {
			wrapper: reconnectingQueryWrapper(),
		})
		await waitFor(() => expect(result.current).toHaveLength(1))

		dropLastSocket()
		await waitFor(() => expect(result.current).toEqual([]))

		const reopened = missionOf("m-reopened", "Ship the parser")
		wire.hostAnswer = answering({
			mission_space_feed: [
				{
					mission: reopened,
					conversationId: "c-1",
					conversationTitle: "Parser",
				},
			] satisfies MissionInSpace[],
		})
		await openLastSocket()

		await waitFor(() =>
			expect(result.current.map(({ mission }) => mission.objective)).toEqual([
				reopened.objective,
			]),
		)
	})

	it("reads the local board again and drops the host's marks when leaving for a local Space", async () => {
		wire.localAnswer = answering({
			conversation_local_ids: [],
			mission_board: [{ mission: LOCAL_MISSION }],
		})
		await joinedHosts.activate("garage")
		await openLastSocket()
		const { result, rerender } = renderHook(
			({ spaceId }) => useMissionMarks(spaceId),
			{
				wrapper: reconnectingQueryWrapper(),
				initialProps: { spaceId: "space-on-host" },
			},
		)
		await waitFor(() =>
			expect(result.current.map(({ mission }) => mission.id)).toEqual([
				HOST_MISSION.id,
			]),
		)

		await act(() => joinedHosts.activate(null))
		rerender({ spaceId: "local-space" })

		await waitFor(() =>
			expect(result.current.map(({ mission }) => mission.id)).toEqual([
				LOCAL_MISSION.id,
			]),
		)
	})

	const markIdsOf = (marks: { mission: Mission }[]) =>
		marks.map(({ mission }) => mission.id)

	const marksOnGarage = async () => {
		await joinGarage()
		const rendered = renderHook(() => useMissionMarks("space-on-host"), {
			wrapper: reconnectingQueryWrapper(),
		})
		await waitFor(() =>
			expect(markIdsOf(rendered.result.current)).toEqual([HOST_MISSION.id]),
		)
		const reopened = missionOf("m-reopened", "Ship the parser")
		wire.hostAnswer = answering({
			mission_space_feed: [
				{
					mission: reopened,
					conversationId: "c-1",
					conversationTitle: "Parser",
				},
			] satisfies MissionInSpace[],
		})
		return { ...rendered, reopened }
	}

	it("reads the conversation-row marks again when the relay of the joined Space reopens", async () => {
		const { result, reopened } = await marksOnGarage()

		await reopenRelay("garage")

		await waitFor(() =>
			expect(markIdsOf(result.current)).toEqual([reopened.id]),
		)
	})

	it("reads no marks when the relay of another Space reopens", async () => {
		const { result } = await marksOnGarage()
		const before = readsOf("mission_space_feed")

		await reopenRelay("attic")
		await settled()

		expect(readsOf("mission_space_feed")).toBe(before)
		expect(markIdsOf(result.current)).toEqual([HOST_MISSION.id])
	})

	it.each([
		{ first: "socket", second: "relay", times: "twice", rereads: 2 },
		{ first: "relay", second: "socket", times: "once", rereads: 1 },
	])(
		"reads the marks $times when the $first reopens before the $second",
		async ({ first, rereads }) => {
			const { result, reopened } = await marksOnGarage()
			const before = readsOf("mission_space_feed")

			dropLastSocket()
			if (first === "relay") {
				await reopenRelay("garage")
				await openLastSocket()
			} else {
				await openLastSocket()
				await reopenRelay("garage")
			}
			await waitFor(() =>
				expect(markIdsOf(result.current)).toEqual([reopened.id]),
			)
			await settled()

			expect(readsOf("mission_space_feed")).toBe(before + rereads)
		},
	)

	it("reads the Activity panel again when the relay of the joined Space reopens", async () => {
		const { result } = await activityPanelOnGarage()
		const reopened = missionOf("m-reopened", "Ship the parser")
		wire.hostAnswer = answering({
			mission_list: { open: [reopened], done: [] },
		})

		await reopenRelay("garage")

		await waitFor(() =>
			expect(objectivesOf(result.current.open)).toEqual([reopened.objective]),
		)
	})

	it("reads the Missions tab again when the relay of the joined Space reopens", async () => {
		await joinGarage()
		const { result } = renderHook(() => useSpaceMissions("space-on-host"), {
			wrapper: reconnectingQueryWrapper(),
		})
		await waitFor(() => expect(result.current.inProgress).toHaveLength(1))
		const reopened = missionOf("m-reopened", "Ship the parser")
		wire.hostAnswer = answering({
			mission_space_page: aSpacePage([
				{
					mission: reopened,
					conversationId: "c-1",
					conversationTitle: "Parser",
				},
			]),
		})

		await reopenRelay("garage")

		await waitFor(() =>
			expect(
				result.current.inProgress.map(({ mission }) => mission.objective),
			).toEqual([reopened.objective]),
		)
	})

	it("reads no mission again when the relay of another Space reopens", async () => {
		await activityPanelOnGarage()
		renderHook(() => useSpaceMissions("space-on-host"), {
			wrapper: reconnectingQueryWrapper(),
		})
		await settled()
		const before = [readsOf("mission_list"), readsOf("mission_space_page")]

		await reopenRelay("attic")
		await settled()

		expect([readsOf("mission_list"), readsOf("mission_space_page")]).toEqual(
			before,
		)
	})

	it("reads the missions twice when the socket reopens before the relay", async () => {
		await activityPanelOnGarage()
		renderHook(() => useSpaceMissions("space-on-host"), {
			wrapper: reconnectingQueryWrapper(),
		})
		await settled()
		const before = [readsOf("mission_list"), readsOf("mission_space_page")]

		dropLastSocket()
		await openLastSocket()
		await reopenRelay("garage")
		await settled()

		expect([readsOf("mission_list"), readsOf("mission_space_page")]).toEqual(
			before.map((count) => count + 2),
		)
	})

	it("reads no mission again once the panels are gone", async () => {
		const { unmount } = await activityPanelOnGarage()
		unmount()
		const before = readsOf("mission_list")

		await reopenRelay("garage")
		await settled()

		expect(readsOf("mission_list")).toBe(before)
	})
})

const OTHER_SPACE_REFUSAL = "this command reaches outside the shared space"

const refusedByTheHost = () =>
	new Response(OTHER_SPACE_REFUSAL, { status: 403 })

const failedOnTheHost = () =>
	new Response('{"kind":"storage"}', {
		status: 500,
		headers: { "content-type": "application/json" },
	})

const useMissionFeedSubscriber = () => {
	const feed = useSpaceMissions("space-on-host")
	useSpaceMissionsFailure(feed)
	useMissionMarks("space-on-host")
	return feed
}

const useTwoMissionFeedSubscribers = () => [
	useMissionFeedSubscriber(),
	useMissionFeedSubscriber(),
]

const feedsOnGarageInStrictMode = async () => {
	await joinGarage()
	const QueryWrapper = reconnectingQueryWrapper()
	const rendered = renderHook(useTwoMissionFeedSubscribers, {
		wrapper: ({ children }: PropsWithChildren) =>
			createElement(
				StrictMode,
				null,
				createElement(QueryWrapper, null, children),
			),
	})
	await waitFor(() =>
		expect(rendered.result.current.every(({ hasFailed }) => hasFailed)).toBe(
			true,
		),
	)
	rendered.rerender()
	await settled()
	return rendered
}

const distinctNotices = (raised: RaisedNotice[]) => [
	...new Map(raised.map((notice) => [JSON.stringify(notice), notice])).values(),
]

describe("a mission feed read that fails on a joined host", () => {
	beforeEach(() => {
		wire.joinedHosts = buildJoinedHosts()
		wire.sockets.length = 0
		wire.relays.clear()
		wire.hostReads.length = 0
		wire.raised.length = 0
		wire.hostAnswer = hostAnswers
	})

	afterEach(() => {
		cleanup()
		wire.failedReads.clear()
		joinedHosts.forget("garage")
	})

	it("raises only the host refusal, with its command, status and side, whatever the number of subscribers", async () => {
		wire.failedReads.set("mission_space_feed", refusedByTheHost)
		wire.failedReads.set("mission_space_page", refusedByTheHost)

		await feedsOnGarageInStrictMode()

		const notices = distinctNotices(wire.raised)
		expect(notices).toHaveLength(2)
		expect(notices).toEqual(
			expect.arrayContaining(
				["mission_space_feed", "mission_space_page"].map((command) => ({
					title: "Couldn’t send that request",
					facts: {
						raisedIn: "host-refusal",
						command,
						httpStatus: 403,
						side: "member",
					},
				})),
			),
		)
	})

	it("still raises the missions notices for a failure the host did not report", async () => {
		wire.failedReads.set("mission_space_feed", failedOnTheHost)
		wire.failedReads.set("mission_space_page", failedOnTheHost)

		await feedsOnGarageInStrictMode()

		expect(
			distinctNotices(wire.raised).map(({ facts }) => facts.raisedIn),
		).toEqual(["use-mission-marks", "use-mission-failure-notices"])
	})
})
