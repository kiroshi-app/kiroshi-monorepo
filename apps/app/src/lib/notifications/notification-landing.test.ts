// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react"
import { useSyncExternalStore } from "react"
import { afterEach, expect, it, vi } from "vitest"

import { createFakeNotificationPort } from "./fake-notification-port"
import { startNotificationSource } from "./notification-source"

import type { JoinedSpace } from "../bindings"
import { createStore } from "../store"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"
import { newBotIdentity } from "../bots/bot-settings"
import { createRosterController } from "../bots/roster-controller"
import { initialChatState } from "../chat/chat-state"
import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"
import { createSpokenWords } from "../conversations/spoken-words"
import { hostOfflineOf } from "../host/host-offline"
import type { JoinedHostsState } from "../host/joined-hosts"
import { createFakeMissions } from "../missions/fake-missions"
import type { MissionEvent } from "../missions/mission-event-read"
import { aMission } from "../missions/mission-fixtures"
import {
	createJoinedSpacesController,
	openRowIdOf,
} from "../spaces/joined-spaces-controller"
import { createSpacesController } from "../spaces/spaces-controller"
import { useSpaceEntry } from "../spaces/use-space-entry"

const HOME = "personal"

const GARAGE: JoinedSpace = {
	id: "garage-host",
	hostUrl: "http://192.168.1.20:45367",
	remoteSpaceId: HOME,
	name: "Garage",
}

const GARAGE_ROW = "joined:garage-host"

const ALL_ON = {
	notifyOnQuestion: true,
	notifyOnPermission: true,
	notifyOnFinishedTurn: true,
	notifyWithSound: true,
}

const PREFERENCES = {
	colorScheme: "system",
	language: null,
	sidebarWidth: null,
	activityPanelOpen: false,
	firstRunDone: false,
	lastSpaceId: null,
	lastBotIdBySpace: {},
} as const

const chatRunningIn = (threads: Record<string, string>) => ({
	stateFor: (botId: string) => ({
		...initialChatState,
		conversationId: threads[botId] ?? null,
	}),
	subscribe: () => () => undefined,
})

const idleRuntimes = {
	heldFor: () => null,
	subscribe: () => () => undefined,
}

const aReader = () => {
	const reopened: string[] = []

	return {
		reopened,
		getState: () => ({ preferences: PREFERENCES }),
		setLastSpace: async (spaceId: string) => {
			reopened.push(spaceId)
		},
	}
}

const hostsFake = () => {
	const store = createStore<JoinedHostsState>({ active: null, connections: {} })
	return {
		getState: store.getState,
		connect: async () => undefined,
		activate: async (id: string | null) => {
			store.setState({ ...store.getState(), active: id })
		},
		forget: () => undefined,
	}
}

const joinedTransportFake = () => ({
	list: async () => [GARAGE],
	remove: async () => undefined,
	onChanged: async () => () => undefined,
	onRemoved: async () => () => undefined,
})

const offlineSwitch = (missions: ReturnType<typeof createFakeMissions>) => {
	let offlineHostId: string | null = null
	return {
		read: (event: MissionEvent) =>
			event.hostId !== null && event.hostId === offlineHostId
				? Promise.reject(hostOfflineOf(`joined host ${event.hostId}: down`))
				: missions.read(event),
		goOffline: (hostId: string) => {
			offlineHostId = hostId
		},
	}
}

const aWorld = async () => {
	const store = createFakeTranscriptStore()
	const elsewhere = await store.createSpace("Vocca")
	const neighbour = await store.createBot(newBotIdentity([]), HOME)
	const away = await store.createBot(newBotIdentity([]), elsewhere.id)
	const room = await store.createConversation({
		spaceId: elsewhere.id,
		sectionId: null,
		title: "Release",
		botIds: [away.id],
	})

	const threads = {
		[neighbour.id]: (await store.mainChat(neighbour.id, HOME)).id,
		[away.id]: (await store.mainChat(away.id, elsewhere.id)).id,
	}

	const { queryClient } = createQueryTestWrapper()
	const hosts = hostsFake()
	const spaces = createSpacesController(store, { queryClient, hosts })
	await spaces.load(null)
	const joinedSpaces = createJoinedSpacesController({
		queryClient,
		spaces,
		hosts,
		transport: joinedTransportFake(),
		reportFailure: () => undefined,
	})
	await queryClient.prefetchQuery(joinedSpaces.listQuery)
	const roster = createRosterController(store, { queryClient })
	await roster.load({
		spaces: [HOME, elsewhere.id].map((id) => ({ spaceRowId: id, spaceId: id })),
		spaceRowId: HOME,
		lastRowId: null,
	})

	const notifications = createFakeNotificationPort()
	const missions = createFakeMissions()
	const spokenWords = createSpokenWords()
	const reader = aReader()
	const offline = offlineSwitch(missions)
	const reportFailure = vi.fn()

	startNotificationSource({
		chat: chatRunningIn(threads),
		runtimes: idleRuntimes,
		roster,
		spaces,
		joinedSpaces,
		missions: { ...missions, read: offline.read },
		spokenWords,
		notifications,
		switches: () => ALL_ON,
		hasFocus: () => false,
		watchFocus: async () => () => undefined,
		raiseWindow: async () => undefined,
		playChime: () => undefined,
		reportFailure,
	})
	await Promise.resolve()

	renderHook(() => {
		const { selectedSpaceId } = useSyncExternalStore(
			spaces.subscribe,
			spaces.getState,
		)
		useSpaceEntry({
			roster,
			user: reader,
			selectedSpaceId,
			openRowId: selectedSpaceId,
		})
	})

	return {
		spaces,
		joinedSpaces,
		hosts,
		roster,
		missions,
		offline,
		reportFailure,
		notifications,
		spokenWords,
		reader,
		elsewhere,
		neighbour,
		away,
		room,
		threads,
	}
}

afterEach(() => {
	cleanup()
})

it("enters the space holding the companion the click carries and lands on that companion", async () => {
	const { spaces, roster, notifications, reader, elsewhere, away } =
		await aWorld()

	await act(async () => {
		notifications.activate({ kind: "bot", id: away.id })
	})

	expect(spaces.getState().selectedSpaceId).toBe(elsewhere.id)
	expect(roster.getState().selectedBotId).toBe(away.id)
	expect(reader.reopened).toContain(elsewhere.id)
})

it("enters the space holding the conversation the click carries and lands on it", async () => {
	const { spaces, roster, notifications, elsewhere, room } = await aWorld()

	await act(async () => {
		notifications.activate({ kind: "conversation", id: room.id })
	})

	expect(spaces.getState().selectedSpaceId).toBe(elsewhere.id)
	expect(roster.getState().selectedConversationId).toBe(room.id)
	expect(roster.getState().selectedBotId).toBeNull()
})

it("lands on a companion of the space already on screen without changing space", async () => {
	const { spaces, roster, notifications, neighbour } = await aWorld()

	await act(async () => {
		notifications.activate({ kind: "bot", id: neighbour.id })
	})

	expect(spaces.getState().selectedSpaceId).toBe(HOME)
	expect(roster.getState().selectedBotId).toBe(neighbour.id)
})

it("enters the space of the mission's companion and opens that mission thread", async () => {
	const { spaces, roster, notifications, missions, elsewhere, away, room } =
		await aWorld()
	const mission = aMission({
		id: "mission-9",
		botId: away.id,
		originConversationId: room.id,
	})
	missions.hold({ mission, events: [] })

	await act(async () => {
		notifications.activate({ kind: "mission", id: mission.id })
	})

	expect(spaces.getState().selectedSpaceId).toBe(elsewhere.id)
	expect(roster.getState().selectedBotId).toBe(away.id)
	expect(missions.opened).toEqual([
		{ missionId: mission.id, rowId: away.id, spaceId: elsewhere.id },
	])
})

it("opens a mission of the space already on screen without changing space", async () => {
	const { spaces, roster, notifications, missions, neighbour, threads } =
		await aWorld()
	const mission = aMission({
		id: "mission-10",
		botId: neighbour.id,
		originConversationId: threads[neighbour.id],
	})
	missions.hold({ mission, events: [] })

	await act(async () => {
		notifications.activate({ kind: "mission", id: mission.id })
	})

	expect(spaces.getState().selectedSpaceId).toBe(HOME)
	expect(roster.getState().selectedBotId).toBe(neighbour.id)
	expect(missions.opened).toHaveLength(1)
})

it("lands on the room a spoken word names, in the space holding it", async () => {
	const { spaces, roster, notifications, spokenWords, elsewhere, away, room } =
		await aWorld()

	spokenWords.announce({ conversationId: room.id, authorBotId: away.id })
	const [sent] = notifications.sent

	await act(async () => {
		notifications.activate(sent.target)
	})

	expect(sent.title).toBe("Release")
	expect(spaces.getState().selectedSpaceId).toBe(elsewhere.id)
	expect(roster.getState().selectedConversationId).toBe(room.id)
})

type World = Awaited<ReturnType<typeof aWorld>>

const openRowIn = ({ joinedSpaces, spaces }: World) =>
	openRowIdOf(joinedSpaces.getState(), spaces.getState().selectedSpaceId)

const hearMission = async (
	world: World,
	{ missionId, hostId }: { missionId: string; hostId: string | null },
) => {
	const mission = aMission({
		id: missionId,
		botId: hostId ? "garage-bot" : world.neighbour.id,
		originConversationId: hostId
			? "garage-thread"
			: world.threads[world.neighbour.id],
		spaceId: HOME,
		state: "waiting_human",
	})
	world.missions.hold({ mission, events: [] })
	await act(async () => {
		world.missions.change(
			{
				missionId,
				spaceId: HOME,
				state: "waiting_human",
				stateSeq: 2,
				isAgentRunning: false,
				lastActivityAt: null,
			},
			hostId,
		)
	})
}

const enterGarage = async (world: World) => {
	await act(async () => {
		world.joinedSpaces.selectSpace(GARAGE_ROW)
	})
	expect(openRowIn(world)).toBe(GARAGE_ROW)
}

const click = async (world: World, missionId: string) => {
	await act(async () => {
		world.notifications.activate({ kind: "mission", id: missionId })
	})
}

it("lands in the joined Space a mission was heard on, from the local Space of the same id", async () => {
	const world = await aWorld()
	await hearMission(world, { missionId: "garage-1", hostId: GARAGE.id })

	await click(world, "garage-1")

	expect(openRowIn(world)).toBe(GARAGE_ROW)
	expect(world.hosts.getState().active).toBe(GARAGE.id)
})

it("stays in the joined Space a mission was heard on when that Space is already open", async () => {
	const world = await aWorld()
	await hearMission(world, { missionId: "garage-2", hostId: GARAGE.id })
	await enterGarage(world)

	await click(world, "garage-2")

	expect(openRowIn(world)).toBe(GARAGE_ROW)
	expect(world.hosts.getState().active).toBe(GARAGE.id)
})

it("lands in the local Space a mission was heard on, from the joined Space of the same id", async () => {
	const world = await aWorld()
	await hearMission(world, { missionId: "home-1", hostId: null })
	await enterGarage(world)

	await click(world, "home-1")

	expect(openRowIn(world)).toBe(HOME)
	expect(world.hosts.getState().active).toBeNull()
})

it("stays in the local Space a mission was heard on and opens it there", async () => {
	const world = await aWorld()
	await hearMission(world, { missionId: "home-2", hostId: null })

	await click(world, "home-2")

	expect(openRowIn(world)).toBe(HOME)
	expect(world.hosts.getState().active).toBeNull()
	expect(world.missions.opened).toEqual([
		{ missionId: "home-2", rowId: world.neighbour.id, spaceId: HOME },
	])
})

it("lands in the joined Space without a failure card when its host went offline before the click", async () => {
	const informed = vi.spyOn(console, "info").mockImplementation(() => undefined)
	const world = await aWorld()
	await hearMission(world, { missionId: "garage-3", hostId: GARAGE.id })
	world.offline.goOffline(GARAGE.id)

	await click(world, "garage-3")

	expect(openRowIn(world)).toBe(GARAGE_ROW)
	expect(world.reportFailure).not.toHaveBeenCalled()
	expect(informed.mock.calls).toEqual([
		[
			`notifications: the host of the clicked mission is offline | mission: garage-3 | space: ${HOME} | side: ${GARAGE.id}`,
		],
	])
	informed.mockRestore()
})
