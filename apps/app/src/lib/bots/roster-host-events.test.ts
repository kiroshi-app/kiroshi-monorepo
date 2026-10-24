// @vitest-environment happy-dom

import { isCancelledError } from "@tanstack/react-query"
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { newBotIdentity } from "./bot-settings"
import {
	createRosterController,
	type RosterController,
	type RosterSpace,
} from "./roster-controller"
import { useRosterReads } from "./use-roster"

import { useControllerState } from "../use-controller"
import { conversationQueryKeys } from "../conversations/conversation-query-keys"
import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"
import type { TranscriptStore } from "../conversations/store-port"
import { createQueryTestWrapper } from "../query/query-test-wrapper"

type HostHandler = (event: { payload: unknown }, hostId: string | null) => void

const host = vi.hoisted(() => ({
	handlers: new Map<string, HostHandler>(),
	reconnects: new Set<(hostId: string) => void>(),
}))

vi.mock("@/lib/host", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/host")>()),
	listen: async (event: string, handler: HostHandler) => {
		host.handlers.set(event, handler)
		return () => host.handlers.delete(event)
	},
	onHostReconnected: (onReconnected: (hostId: string) => void) => {
		host.reconnects.add(onReconnected)
		return () => host.reconnects.delete(onReconnected)
	},
}))

const LOCAL = { spaceRowId: "personal", spaceId: "personal" }

const SHED_HOST = "shed"

const emitOnHost = (
	event: string,
	payload: unknown,
	hostId: string | null = null,
) =>
	act(async () => {
		host.handlers.get(event)?.({ payload }, hostId)
	})

const reconnectHost = (hostId: string) =>
	act(async () => {
		for (const onReconnected of host.reconnects) {
			onReconnected(hostId)
		}
	})

const neverAnswered = () => new Promise<never>(() => undefined)

const nextTick = () => act(async () => undefined)

const seededStore = async () => {
	const store = createFakeTranscriptStore()
	const garage = await store.createSpace("Garage")
	const shed = await store.createSpace("Shed")
	const companion = await store.createBot(newBotIdentity([]), LOCAL.spaceId)
	for (const space of [LOCAL.spaceId, garage.id, shed.id]) {
		if (space !== LOCAL.spaceId) {
			await store.addBotToSpace(companion.id, space)
		}
		await store.createConversation({
			spaceId: space,
			sectionId: null,
			title: `Topic of ${space}`,
			botIds: [companion.id],
		})
	}
	return {
		store,
		companion,
		garage: { spaceRowId: garage.id, spaceId: garage.id },
		shed: { spaceRowId: `joined:${SHED_HOST}`, spaceId: shed.id },
	}
}

type Seeded = Awaited<ReturnType<typeof seededStore>>

const mountRoster = (store: TranscriptStore) => {
	const { queryClient, wrapper } = createQueryTestWrapper()
	const controller = createRosterController(store, { queryClient })
	renderHook(() => useRosterReads(controller, useControllerState(controller)), {
		wrapper,
	})
	return { controller, queryClient }
}

const loadedRoster = async () => {
	const seeded = await seededStore()
	const mounted = mountRoster(seeded.store)
	await act(() =>
		mounted.controller.load({
			spaces: [LOCAL, seeded.garage, seeded.shed],
			spaceRowId: LOCAL.spaceRowId,
			lastRowId: null,
		}),
	)
	const pageReads = vi.spyOn(seeded.store, "conversationPage")
	const threadReads = vi.spyOn(seeded.store, "mainChat")
	return { ...seeded, ...mounted, pageReads, threadReads }
}

const firstTopicIn = async (store: TranscriptStore, spaceId: string) => {
	const page = await store.conversationPage(spaceId, null, 30)
	const topic = page.conversations.find(({ soloBotId }) => soloBotId === null)
	if (!topic) {
		throw new Error(`no topic in ${spaceId}`)
	}
	return topic
}

const topicTitlesIn = (controller: RosterController, spaceRowId: string) =>
	controller
		.getState()
		.conversationRosters[spaceRowId].map(({ title }) => title)

const rosterKeyOf = ({ spaceRowId, spaceId }: Seeded["garage"]) =>
	conversationQueryKeys.roster(spaceRowId, spaceId)

beforeEach(() => {
	host.handlers.clear()
	host.reconnects.clear()
})

afterEach(() => {
	cleanup()
	vi.useRealTimers()
})

it("writes a conversation updated on the host into the roster of its space and reads nothing", async () => {
	const { store, garage, controller, queryClient, pageReads } =
		await loadedRoster()
	const topic = await firstTopicIn(store, garage.spaceId)
	pageReads.mockClear()

	await emitOnHost("conversation://updated", {
		spaceId: garage.spaceId,
		conversation: {
			...topic,
			title: "Renamed on the host",
			lastWord: { text: "Answered just now", at: 99, authorBotId: null },
		},
	})

	expect(topicTitlesIn(controller, garage.spaceRowId)).toEqual([
		"Renamed on the host",
	])
	expect(topicTitlesIn(controller, LOCAL.spaceRowId)).toEqual([
		`Topic of ${LOCAL.spaceId}`,
	])
	expect(controller.getState().conversationPreviews[topic.id]?.text).toBe(
		"Answered just now",
	)
	expect(pageReads).not.toHaveBeenCalled()
	expect(queryClient.isFetching()).toBe(0)
})

it("writes a conversation state changed on the host into its row and reads nothing", async () => {
	const { store, garage, controller, queryClient, pageReads, threadReads } =
		await loadedRoster()
	const topic = await firstTopicIn(store, garage.spaceId)
	const localTopic = await firstTopicIn(store, LOCAL.spaceId)
	expect(controller.getState().hostStates[topic.id]).toBe("idle")
	pageReads.mockClear()

	await emitOnHost("conversation://state-changed", {
		conversationId: topic.id,
		spaceId: garage.spaceId,
		state: "needs_you",
	})

	expect(controller.getState().hostStates[topic.id]).toBe("needs_you")
	expect(controller.getState().hostStates[localTopic.id]).toBe("idle")

	await emitOnHost("conversation://state-changed", {
		conversationId: topic.id,
		spaceId: garage.spaceId,
		state: "working",
	})

	expect(controller.getState().hostStates[topic.id]).toBe("working")
	expect(pageReads).not.toHaveBeenCalled()
	expect(threadReads).not.toHaveBeenCalled()
	expect(queryClient.isFetching()).toBe(0)
})

it("writes a conversation state changed on a joined host into the row of that host only", async () => {
	const { store, shed, controller } = await loadedRoster()
	const topic = await firstTopicIn(store, shed.spaceId)

	await emitOnHost(
		"conversation://state-changed",
		{ conversationId: topic.id, spaceId: shed.spaceId, state: "needs_you" },
		"another-host",
	)

	expect(controller.getState().hostStates[topic.id]).toBe("idle")

	await emitOnHost(
		"conversation://state-changed",
		{ conversationId: topic.id, spaceId: shed.spaceId, state: "needs_you" },
		SHED_HOST,
	)

	expect(controller.getState().hostStates[topic.id]).toBe("needs_you")
})

it("writes the icon and the colour of a conversation updated on the host into its roster", async () => {
	const { store, garage, controller } = await loadedRoster()
	const topic = await firstTopicIn(store, garage.spaceId)

	await emitOnHost("conversation://updated", {
		spaceId: garage.spaceId,
		conversation: { ...topic, icon: "Rocket", color: "cyan" },
	})

	expect(
		controller.getState().conversationRosters[garage.spaceRowId],
	).toMatchObject([{ icon: "Rocket", color: "cyan" }])
})

it("writes a conversation updated on a joined host into its roster while another space is shown and reads nothing", async () => {
	const { store, shed, controller, pageReads } = await loadedRoster()
	const topic = await firstTopicIn(store, shed.spaceId)
	pageReads.mockClear()

	await emitOnHost(
		"conversation://updated",
		{
			spaceId: shed.spaceId,
			conversation: { ...topic, title: "Renamed in the shed" },
		},
		SHED_HOST,
	)

	expect(controller.getState().spaceRowId).toBe(LOCAL.spaceRowId)
	expect(topicTitlesIn(controller, shed.spaceRowId)).toEqual([
		"Renamed in the shed",
	])
	expect(pageReads).not.toHaveBeenCalled()
})

it("writes a conversation only into the row of the host it came from", async () => {
	const { store, garage, shed, controller } = await loadedRoster()
	const garageTopic = await firstTopicIn(store, garage.spaceId)
	const shedTopic = await firstTopicIn(store, shed.spaceId)

	await emitOnHost(
		"conversation://updated",
		{
			spaceId: garage.spaceId,
			conversation: { ...garageTopic, title: "From the shed host" },
		},
		SHED_HOST,
	)
	await emitOnHost(
		"conversation://updated",
		{
			spaceId: shed.spaceId,
			conversation: { ...shedTopic, title: "From another joined host" },
		},
		"attic",
	)
	await emitOnHost("conversation://updated", {
		spaceId: shed.spaceId,
		conversation: { ...shedTopic, title: "From the local host" },
	})

	expect(topicTitlesIn(controller, garage.spaceRowId)).toEqual([
		`Topic of ${garage.spaceId}`,
	])
	expect(topicTitlesIn(controller, shed.spaceRowId)).toEqual([
		`Topic of ${shed.spaceId}`,
	])
})

it("adds a conversation created on the host to the roster of its space and reads nothing", async () => {
	const { store, garage, companion, controller, pageReads } =
		await loadedRoster()
	await store.createConversation({
		spaceId: garage.spaceId,
		sectionId: null,
		title: "Created on the host",
		botIds: [companion.id],
	})
	const created = await firstTopicIn(store, garage.spaceId)
	pageReads.mockClear()

	await emitOnHost("conversation://created", {
		spaceId: garage.spaceId,
		conversation: created,
	})

	expect(topicTitlesIn(controller, garage.spaceRowId)).toEqual([
		"Created on the host",
		`Topic of ${garage.spaceId}`,
	])
	expect(pageReads).not.toHaveBeenCalled()
})

it("rereads each space concerned once, after a quiet delay, for companion and deletion events", async () => {
	const { garage, companion, queryClient } = await loadedRoster()
	vi.useFakeTimers()
	const invalidations = vi.spyOn(queryClient, "invalidateQueries")

	await emitOnHost("companion://deleted", {
		id: companion.id,
		spaceId: garage.spaceId,
	})
	await emitOnHost("conversation://deleted", {
		spaceId: garage.spaceId,
		conversationId: "unknown",
	})
	await emitOnHost("companion://updated", { id: companion.id })
	expect(invalidations).not.toHaveBeenCalled()

	await act(() => vi.advanceTimersByTimeAsync(250))

	expect(invalidations.mock.calls.map(([filters]) => filters)).toEqual(
		expect.arrayContaining([
			{ queryKey: rosterKeyOf(garage), exact: true },
			{ queryKey: rosterKeyOf(LOCAL), exact: true },
		]),
	)
	expect(
		invalidations.mock.calls.filter(
			([filters]) =>
				JSON.stringify(filters?.queryKey) ===
				JSON.stringify(rosterKeyOf(garage)),
		),
	).toHaveLength(1)
})

it("rereads the roster of the reconnected joined host alone and marks its solo threads stale without reading them", async () => {
	const { shed, garage, companion, queryClient, pageReads, threadReads } =
		await loadedRoster()
	const shedThread = conversationQueryKeys.soloThread(
		shed.spaceRowId,
		shed.spaceId,
		companion.id,
	)
	const localThread = conversationQueryKeys.soloThread(
		LOCAL.spaceRowId,
		LOCAL.spaceId,
		companion.id,
	)
	queryClient.setQueryData(shedThread, "thread-in-shed")
	queryClient.setQueryData(localThread, "thread-at-home")

	await reconnectHost(SHED_HOST)

	await vi.waitFor(() => expect(pageReads).toHaveBeenCalledOnce())
	expect(pageReads.mock.calls[0][0]).toBe(shed.spaceId)
	expect(pageReads).not.toHaveBeenCalledWith(
		garage.spaceId,
		expect.anything(),
		expect.anything(),
		expect.anything(),
	)
	expect(queryClient.getQueryState(shedThread)?.isInvalidated).toBe(true)
	expect(queryClient.getQueryState(localThread)?.isInvalidated).toBe(false)
	expect(threadReads).not.toHaveBeenCalled()
})

it("aborts a roster read it cancels", async () => {
	const { store } = await seededStore()
	const signals: (AbortSignal | undefined)[] = []
	vi.spyOn(store, "conversationPage").mockImplementation(
		(_spaceId, _cursor, _limit, signal) => {
			signals.push(signal)
			return neverAnswered()
		},
	)
	const { controller, queryClient } = mountRoster(store)
	void controller.load({
		spaces: [LOCAL],
		spaceRowId: LOCAL.spaceRowId,
		lastRowId: null,
	})
	await vi.waitFor(() => expect(signals).toHaveLength(1))

	await act(() =>
		queryClient.cancelQueries({ queryKey: conversationQueryKeys.rosters() }),
	)

	expect(signals[0]?.aborted).toBe(true)
})

it("aborts a solo thread read it cancels", async () => {
	const { store, companion } = await seededStore()
	const signals: (AbortSignal | undefined)[] = []
	vi.spyOn(store, "mainChat").mockImplementation((_botId, _spaceId, signal) => {
		signals.push(signal)
		return neverAnswered()
	})
	const { controller, queryClient } = mountRoster(store)
	const thread = controller.soloThreadQuery({
		spaceId: LOCAL.spaceRowId,
		botId: companion.id,
	})
	const outcome = queryClient.fetchQuery(thread).then(
		() => null,
		(reason: unknown) => reason,
	)
	await vi.waitFor(() => expect(signals).toHaveLength(1))

	await act(() => queryClient.cancelQueries({ queryKey: thread.queryKey }))

	expect(signals[0]?.aborted).toBe(true)
	expect(isCancelledError(await outcome)).toBe(true)
})

it("leaves the roster state untouched by a cache event outside the roster keys", async () => {
	const { controller, queryClient } = await loadedRoster()
	const held = controller.getState()
	const listener = vi.fn()
	const stop = controller.subscribe(listener)

	queryClient.setQueryData(["bots", "model-catalogue"], [])
	await nextTick()

	expect(listener).not.toHaveBeenCalled()
	expect(controller.getState()).toBe(held)
	stop()
})

it("notifies its subscribers once for several roster cache events in one tick", async () => {
	const { store, garage, controller } = await loadedRoster()
	const topic = await firstTopicIn(store, garage.spaceId)
	const listener = vi.fn()
	const stop = controller.subscribe(listener)

	for (const title of ["First", "Second", "Third"]) {
		controller.holdPageRow(
			{ hostId: null, spaceId: garage.spaceId },
			{ ...topic, title },
		)
	}
	await nextTick()

	expect(listener).toHaveBeenCalledOnce()
	expect(topicTitlesIn(controller, garage.spaceRowId)).toEqual(["Third"])
	stop()
})

const switchTo = (
	controller: RosterController,
	spaces: RosterSpace[],
	space: RosterSpace,
) =>
	act(async () => {
		void controller.load({
			spaces,
			spaceRowId: space.spaceRowId,
			lastRowId: null,
		})
		controller.enter({ ...space, lastRowId: null })
	})

const createdWhileAway = async (
	{ store, companion }: Seeded,
	space: RosterSpace,
	hostId: string | null,
) => {
	await store.createConversation({
		spaceId: space.spaceId,
		sectionId: null,
		title: "Created while away",
		botIds: [companion.id],
	})
	await emitOnHost(
		"conversation://created",
		{
			spaceId: space.spaceId,
			conversation: await firstTopicIn(store, space.spaceId),
		},
		hostId,
	)
}

it("lists a conversation created in a local space while a joined space was active once the person comes back to it", async () => {
	const seeded = await seededStore()
	const { controller } = mountRoster(seeded.store)
	const localSpaces = [LOCAL, seeded.garage]
	await switchTo(controller, localSpaces, LOCAL)
	await switchTo(controller, [seeded.shed], seeded.shed)

	await createdWhileAway(seeded, seeded.garage, null)
	await switchTo(controller, localSpaces, seeded.garage)

	await vi.waitFor(() =>
		expect(topicTitlesIn(controller, seeded.garage.spaceRowId)).toEqual([
			"Created while away",
			`Topic of ${seeded.garage.spaceId}`,
		]),
	)
})

it("lists a conversation created in a joined space while a local space was active once the person comes back to it", async () => {
	const seeded = await seededStore()
	const { controller } = mountRoster(seeded.store)
	const localSpaces = [LOCAL, seeded.garage]
	await switchTo(controller, [seeded.shed], seeded.shed)
	await switchTo(controller, localSpaces, LOCAL)

	await createdWhileAway(seeded, seeded.shed, SHED_HOST)
	await switchTo(controller, [seeded.shed], seeded.shed)

	await vi.waitFor(() =>
		expect(topicTitlesIn(controller, seeded.shed.spaceRowId)).toEqual([
			"Created while away",
			`Topic of ${seeded.shed.spaceId}`,
		]),
	)
})

it("keeps the rows it holds for a space on screen while it rereads that space on entry", async () => {
	const seeded = await seededStore()
	const { controller } = mountRoster(seeded.store)
	await switchTo(controller, [seeded.shed], seeded.shed)
	await switchTo(controller, [LOCAL, seeded.garage], LOCAL)
	const pageReads = vi
		.spyOn(seeded.store, "conversationPage")
		.mockImplementation(neverAnswered)

	await switchTo(controller, [seeded.shed], seeded.shed)

	expect(pageReads).toHaveBeenCalledOnce()
	expect(controller.getState()).toMatchObject({
		hasLoaded: true,
		isRosterPending: false,
	})
	expect(topicTitlesIn(controller, seeded.shed.spaceRowId)).toEqual([
		`Topic of ${seeded.shed.spaceId}`,
	])
})

it("neither drops nor duplicates a row when the person switches spaces back and forth", async () => {
	const seeded = await seededStore()
	const { controller, queryClient } = mountRoster(seeded.store)
	const localSpaces = [LOCAL, seeded.garage]
	const spacesHeldWith = (space: RosterSpace) =>
		space === seeded.shed ? [seeded.shed] : localSpaces
	const visits = [LOCAL, seeded.shed, seeded.garage, seeded.shed, LOCAL]

	for (const space of visits) {
		await switchTo(controller, spacesHeldWith(space), space)
		await vi.waitFor(() => expect(queryClient.isFetching()).toBe(0))

		expect(topicTitlesIn(controller, space.spaceRowId)).toEqual([
			`Topic of ${space.spaceId}`,
		])
	}
})
