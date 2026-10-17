// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react"
import { useEffect, useSyncExternalStore } from "react"
import { afterEach, expect, it, vi } from "vitest"

import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"

import { createFakeNotificationPort } from "./fake-notification-port"
import { startNotificationSource } from "./notification-source"

import type { JoinedSpace } from "../bindings"
import { failureReporterIn } from "../failure-report"
import { createStore } from "../store"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"
import { newBotIdentity } from "../bots/bot-settings"
import { createRosterController } from "../bots/roster-controller"
import { initialChatState } from "../chat/chat-state"
import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"
import { createSpokenWords } from "../conversations/spoken-words"
import { fakeHostModule, takeFakeHostDown } from "../host/fake-joined-hosts"
import { hostOfflineOf } from "../host/host-offline"
import type { JoinedHostsState } from "../host/joined-hosts"
import { createFakeMissions } from "../missions/fake-missions"
import type { MissionEvent } from "../missions/mission-event-read"
import { aMission } from "../missions/mission-fixtures"
import {
	createJoinedSpacesController,
	openRowIdOf,
	rosterSpacesOf,
} from "../spaces/joined-spaces-controller"
import { createSpacesController } from "../spaces/spaces-controller"
import { useSpaceEntry } from "../spaces/use-space-entry"

vi.mock("@workspace/ui/components/notice-surface", async (importOriginal) => ({
	...(await importOriginal()),
	raiseFailureNotice: vi.fn(async () => "notice-1"),
}))

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
		subscribe: store.subscribe,
		connect: async () => undefined,
		activate: async (id: string | null) => {
			store.setState({ ...store.getState(), active: id })
		},
		forget: () => undefined,
	}
}

const joinedTransportFake = (listed: JoinedSpace[]) => ({
	list: async () => listed,
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

type WorldHosts =
	| ReturnType<typeof hostsFake>
	| typeof fakeHostModule.joinedHosts

type WorldOptions = {
	hosts?: WorldHosts
	listed?: JoinedSpace[]
}

const aWorld = async ({
	hosts = hostsFake(),
	listed = [GARAGE],
}: WorldOptions = {}) => {
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
	const spaces = createSpacesController(store, { queryClient, hosts })
	await spaces.load(null)
	const joinedSpaces = createJoinedSpacesController({
		queryClient,
		spaces,
		hosts,
		transport: joinedTransportFake(listed),
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
		reportFailure: failureReporterIn("notification-source"),
	})
	await Promise.resolve()

	renderHook(() => {
		const { selectedSpaceId } = useSyncExternalStore(
			spaces.subscribe,
			spaces.getState,
		)
		const { active } = useSyncExternalStore(hosts.subscribe, hosts.getState)
		const joined = useSyncExternalStore(
			joinedSpaces.subscribe,
			joinedSpaces.getState,
		)
		const openRowId = openRowIdOf(joined, selectedSpaceId)
		useEffect(() => {
			void roster.load({
				spaces: rosterSpacesOf(
					spaces.getState().spaces,
					joinedSpaces.getState().joinedSpaces,
					active,
				),
				spaceRowId: openRowIdOf(
					joinedSpaces.getState(),
					spaces.getState().selectedSpaceId,
				),
				lastRowId: null,
			})
		}, [active])
		useSpaceEntry({ roster, user: reader, selectedSpaceId, openRowId })
	})

	return {
		spaces,
		joinedSpaces,
		hosts,
		roster,
		missions,
		offline,
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
	vi.useRealTimers()
	vi.restoreAllMocks()
	vi.mocked(raiseFailureNotice).mockClear()
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

const UNHELD_THREAD = "garage-thread"

const openRowIn = ({ joinedSpaces, spaces }: World) =>
	openRowIdOf(joinedSpaces.getState(), spaces.getState().selectedSpaceId)

type Heard = {
	missionId: string
	hostId: string | null
	originConversationId?: string
}

const hearMission = async (
	world: World,
	{ missionId, hostId, originConversationId }: Heard,
) => {
	const mission = aMission({
		id: missionId,
		botId: world.neighbour.id,
		originConversationId:
			originConversationId ?? world.threads[world.neighbour.id],
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

const rosterSideOfThread = (world: World) =>
	world.roster.spaceOfConversation(world.threads[world.neighbour.id])

const enterGarage = async (world: World) => {
	await act(async () => {
		world.joinedSpaces.selectSpace(GARAGE_ROW)
	})
	await vi.waitFor(() => expect(rosterSideOfThread(world)).toBe(GARAGE_ROW))
}

const click = async (world: World, missionId: string) => {
	await act(async () => {
		world.notifications.activate({ kind: "mission", id: missionId })
	})
}

const silenceConsole = () =>
	vi.spyOn(console, "info").mockImplementation(() => undefined)

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)))

it("switches to the joined Space a mission was heard on, then opens it once the roster holds its thread", async () => {
	const world = await aWorld()
	await hearMission(world, { missionId: "garage-1", hostId: GARAGE.id })

	await click(world, "garage-1")

	expect(openRowIn(world)).toBe(GARAGE_ROW)
	expect(world.hosts.getState().active).toBe(GARAGE.id)
	await vi.waitFor(() =>
		expect(world.missions.opened).toEqual([
			{ missionId: "garage-1", rowId: world.neighbour.id, spaceId: GARAGE_ROW },
		]),
	)
	expect(world.roster.getState().selectedBotId).toBe(world.neighbour.id)
})

it("opens a mission heard on the joined Space already open without switching", async () => {
	const world = await aWorld()
	await hearMission(world, { missionId: "garage-2", hostId: GARAGE.id })
	await enterGarage(world)

	await click(world, "garage-2")

	expect(openRowIn(world)).toBe(GARAGE_ROW)
	expect(world.hosts.getState().active).toBe(GARAGE.id)
	expect(world.missions.opened).toEqual([
		{ missionId: "garage-2", rowId: world.neighbour.id, spaceId: GARAGE_ROW },
	])
})

it("switches to the local Space a mission was heard on, from the joined Space of the same id, then opens it", async () => {
	const world = await aWorld()
	await hearMission(world, { missionId: "home-1", hostId: null })
	await enterGarage(world)

	await click(world, "home-1")

	expect(openRowIn(world)).toBe(HOME)
	expect(world.hosts.getState().active).toBeNull()
	await vi.waitFor(() =>
		expect(world.missions.opened).toEqual([
			{ missionId: "home-1", rowId: world.neighbour.id, spaceId: HOME },
		]),
	)
})

it("opens a mission heard on the local Space already open without switching", async () => {
	const world = await aWorld()
	await hearMission(world, { missionId: "home-2", hostId: null })

	await click(world, "home-2")

	expect(openRowIn(world)).toBe(HOME)
	expect(world.hosts.getState().active).toBeNull()
	expect(world.missions.opened).toEqual([
		{ missionId: "home-2", rowId: world.neighbour.id, spaceId: HOME },
	])
})

it("stays on the switched Space with one console line and no card when the roster never holds the thread", async () => {
	const informed = silenceConsole()
	const world = await aWorld()
	await hearMission(world, {
		missionId: "garage-3",
		hostId: GARAGE.id,
		originConversationId: UNHELD_THREAD,
	})
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })

	await click(world, "garage-3")
	await act(async () => {
		vi.advanceTimersByTime(4999)
	})
	expect(informed).not.toHaveBeenCalled()
	await act(async () => {
		vi.advanceTimersByTime(1)
	})

	expect(openRowIn(world)).toBe(GARAGE_ROW)
	expect(world.missions.opened).toEqual([])
	expect(informed.mock.calls).toEqual([
		[
			`notifications: the roster never held the clicked mission | mission: garage-3 | space: ${HOME} | side: ${GARAGE.id}`,
		],
	])
	expect(raiseFailureNotice).not.toHaveBeenCalled()
})

it("drops a mission landing still reading when a later click lands", async () => {
	const world = await aWorld()
	await hearMission(world, { missionId: "garage-4", hostId: GARAGE.id })
	world.missions.stallDetail()

	await act(async () => {
		world.notifications.activate({ kind: "mission", id: "garage-4" })
		world.notifications.activate({ kind: "bot", id: world.away.id })
	})
	await act(async () => {
		world.missions.releaseDetail()
	})
	await settle()

	expect(openRowIn(world)).toBe(world.elsewhere.id)
	expect(world.hosts.getState().active).toBeNull()
	expect(world.missions.opened).toEqual([])
})

it("drops a mission landing still waiting on the roster when a later click lands", async () => {
	const informed = silenceConsole()
	const world = await aWorld()
	await hearMission(world, {
		missionId: "garage-5",
		hostId: GARAGE.id,
		originConversationId: UNHELD_THREAD,
	})
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })

	await click(world, "garage-5")
	await act(async () => {
		world.notifications.activate({ kind: "conversation", id: world.room.id })
	})
	await act(async () => {
		vi.advanceTimersByTime(5000)
	})

	expect(world.missions.opened).toEqual([])
	expect(informed).not.toHaveBeenCalled()
})

it("switches to the joined Space without a failure card when its host went offline before the click", async () => {
	const informed = silenceConsole()
	const world = await aWorld()
	await hearMission(world, { missionId: "garage-6", hostId: GARAGE.id })
	world.offline.goOffline(GARAGE.id)

	await click(world, "garage-6")

	expect(openRowIn(world)).toBe(GARAGE_ROW)
	expect(raiseFailureNotice).not.toHaveBeenCalled()
	expect(informed.mock.calls).toEqual([
		[
			`notifications: the host of the clicked mission is offline | mission: garage-6 | space: ${HOME} | side: ${GARAGE.id}`,
		],
	])
})

it.each([
	{
		shared: "a shared Space it named",
		remoteSpaceId: HOME,
		landsOn: "joined:down-named",
	},
	{ shared: "no shared Space named yet", remoteSpaceId: null, landsOn: HOME },
])(
	"raises no card through the real joined spaces controller when a down host shares $shared",
	async ({ remoteSpaceId, landsOn }) => {
		const informed = silenceConsole()
		const hostId = landsOn === HOME ? "down-unnamed" : "down-named"
		takeFakeHostDown(hostId)
		const world = await aWorld({
			hosts: fakeHostModule.joinedHosts,
			listed: [{ ...GARAGE, id: hostId, remoteSpaceId }],
		})
		await hearMission(world, { missionId: `mission-of-${hostId}`, hostId })
		world.offline.goOffline(hostId)

		await click(world, `mission-of-${hostId}`)
		await settle()
		await settle()

		expect(raiseFailureNotice).not.toHaveBeenCalled()
		expect(fakeHostModule.joinedHosts.getState().active).toBeNull()
		expect(fakeHostModule.joinedHosts.getState().connections[hostId]).toEqual({
			status: "refused",
			failure: expect.any(String),
		})
		expect(openRowIn(world)).toBe(landsOn)
		expect(informed).toHaveBeenCalledTimes(1)
	},
)
