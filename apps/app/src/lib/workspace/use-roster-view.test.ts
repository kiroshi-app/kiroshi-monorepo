// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useRosterView } from "./use-roster-view"
import { useSpaceLoading } from "./use-space-loading"

import type { JoinedSpace } from "@/lib/bindings"
import { createRosterController } from "@/lib/bots/roster-controller"
import { createFakeTranscriptStore } from "@/lib/conversations/fake-transcript-store"
import type { TranscriptStore } from "@/lib/conversations/store-port"
import type { HostSocket } from "@/lib/host/http"
import { useMissions } from "@/lib/missions/use-missions"
import {
	createJoinedSpacesController,
	openRowIdOf,
} from "@/lib/spaces/joined-spaces-controller"
import { createSpacesController } from "@/lib/spaces/spaces-controller"
import { useControllerState } from "@/lib/use-controller"

type RelayedCall = {
	command: string
	params?: unknown[]
	[key: string]: unknown
}

type Answer = (call: RelayedCall) => Promise<unknown>

const HOST_URL = "http://192.168.1.22:45367"

const wire = vi.hoisted(() => ({
	localCalls: [] as RelayedCall[],
	hostCalls: [] as RelayedCall[],
	answerLocal: (async () => null) as Answer,
	answerHost: (async () => null) as Answer,
}))

vi.mock("@/lib/host", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/host")>()
	const { createJoinedHosts } = await import("@/lib/host/joined-hosts")
	const joinedHosts = createJoinedHosts({
		local: {
			invoke: (async (command: string, args?: object) => {
				const call = { command, ...args }
				wire.localCalls.push(call)
				return wire.answerLocal(call)
			}) as never,
			listen: async () => () => undefined,
			fileSrc: (path) => path,
		},
		join: async (id) => ({
			status: "ok",
			data: {
				id,
				hostUrl: HOST_URL,
				token: "guest",
				remoteSpaceId: "personal",
				name: "Personal",
			},
		}),
		fetch: async (url, init) => {
			const command = decodeURIComponent(String(url).split("/").pop() ?? "")
			const call = { command, ...JSON.parse(String(init?.body)) }
			wire.hostCalls.push(call)
			return new Response(JSON.stringify(await wire.answerHost(call)), {
				headers: { "content-type": "application/json" },
			})
		},
		openSocket: (): HostSocket => ({
			onopen: null,
			onmessage: null,
			onclose: null,
			close: () => undefined,
		}),
		reportFailure: () => undefined,
		reportHostDown: () => "notice",
		endHostDown: () => undefined,
	})
	return {
		...actual,
		joinedHosts,
		invoke: joinedHosts.invoke,
		listen: joinedHosts.listen,
		listenToActiveHost: joinedHosts.listenToActiveHost,
		activeJoinedSpaceId: joinedHosts.activeSpaceId,
		onHostReconnected: joinedHosts.onReconnected,
	}
})

const { joinedHosts } = await import("@/lib/host")

const HOST_PERSONAL: JoinedSpace = {
	id: "joined-personal",
	hostUrl: HOST_URL,
	remoteSpaceId: "personal",
	name: "Personal",
}

const HOST_PERSONAL_ROW = "joined:joined-personal"

const LOCAL_OPEN_ROOM = "conversation-3"

const HOST_OPEN_ROOM = "conversation-4"

const ROOM_DRAFT = {
	spaceId: "personal",
	sectionId: null,
	title: "Launch",
	botIds: ["default"],
}

const NO_MISSIONS = { open: [], done: [] }

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

const storeWithRooms = async (count: number) => {
	const store = createFakeTranscriptStore()
	for (let room = 0; room < count; room += 1) {
		await store.createConversation(ROOM_DRAFT)
	}
	return store
}

const answeredBy =
	(store: TranscriptStore): Answer =>
	async ({ command, params }) => {
		if (!params) {
			return NO_MISSIONS
		}
		const method = store[command as keyof TranscriptStore] as (
			...params: unknown[]
		) => Promise<unknown>
		return method(...params)
	}

const transportOf = (listed: JoinedSpace[]) => ({
	list: vi.fn(async () => listed),
	add: vi.fn(),
	remove: vi.fn(async () => undefined),
	onChanged: vi.fn(async () => () => undefined),
	onRemoved: vi.fn(async () => () => undefined),
})

const relayed = new Proxy({} as TranscriptStore, {
	get:
		(_, command: string) =>
		(...params: unknown[]) =>
			joinedHosts.invoke(command, { params }),
})

const conversationIdsSentTo = (calls: RelayedCall[]) =>
	calls.flatMap((call) =>
		typeof call.conversationId === "string" ? [call.conversationId] : [],
	)

const localConversationOpen = async () => {
	const localStore = await storeWithRooms(3)
	const hostStore = await storeWithRooms(4)
	wire.localCalls.length = 0
	wire.hostCalls.length = 0
	wire.answerLocal = answeredBy(localStore)
	wire.answerHost = answeredBy(hostStore)
	const spaces = createSpacesController(localStore)
	const joined = createJoinedSpacesController({
		spaces,
		hosts: joinedHosts,
		transport: transportOf([HOST_PERSONAL]),
	})
	joined.watch()
	await settle()
	const roster = createRosterController(relayed)
	const user = {
		getState: () => ({
			preferences: {
				lastSpaceId: "personal",
				lastBotIdBySpace: {
					personal: LOCAL_OPEN_ROOM,
					[HOST_PERSONAL_ROW]: HOST_OPEN_ROOM,
				},
			},
		}),
		setLastSpace: vi.fn(async () => undefined),
	}
	const view = renderHook(() => {
		const spacesState = useControllerState(spaces)
		const joinedState = useControllerState(joined)
		const hostsState = useControllerState(joinedHosts)
		const rosterState = useControllerState(roster)
		const { selectedSpaceId } = spacesState
		const openRowId = openRowIdOf(joinedState, selectedSpaceId)
		const core = {
			joinedSpaces: {
				state: joinedState,
				controller: joined,
				hosts: hostsState,
			},
			roster: { state: rosterState, controller: roster },
			spaces: { state: spacesState, controller: spaces },
			user: { controller: user },
		} as never
		useSpaceLoading({ core, scopes: { selectedSpaceId, openRowId } } as never)
		const rosterView = useRosterView({
			core,
			drivers: { missionMarks: [], waitingMissionIds: new Set() } as never,
			openRowId,
		})
		useMissions(rosterView.selectedConversation?.id ?? null)
		return rosterView
	})
	await waitFor(() =>
		expect(view.result.current.selectedConversation?.id).toBe(LOCAL_OPEN_ROOM),
	)
	const switchTo = async (rowId: string) => {
		await act(async () => {
			joined.selectSpace(rowId)
			for (let frame = 0; frame < 4; frame += 1) {
				await settle()
			}
		})
	}
	return { switchTo }
}

afterEach(async () => {
	cleanup()
	await joinedHosts.activate(null)
})

describe("switching from a local Space with a conversation open to a joined Space", () => {
	it("reads the open conversation's missions from the local host before the switch", async () => {
		await localConversationOpen()

		expect(conversationIdsSentTo(wire.localCalls)).toContain(LOCAL_OPEN_ROOM)
	})

	it("sends the host no per-conversation read for the local conversation", async () => {
		const { switchTo } = await localConversationOpen()

		await switchTo(HOST_PERSONAL_ROW)

		const sentToHost = conversationIdsSentTo(wire.hostCalls)
		expect(sentToHost).toContain(HOST_OPEN_ROOM)
		expect(sentToHost).not.toContain(LOCAL_OPEN_ROOM)
	})

	it("sends the local host no host conversation id on the way back", async () => {
		const { switchTo } = await localConversationOpen()
		await switchTo(HOST_PERSONAL_ROW)
		wire.localCalls.length = 0

		await switchTo("personal")

		expect(conversationIdsSentTo(wire.localCalls)).not.toContain(HOST_OPEN_ROOM)
	})
})
