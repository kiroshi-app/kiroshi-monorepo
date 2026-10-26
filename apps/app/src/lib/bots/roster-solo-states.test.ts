// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"

import { newBotIdentity } from "./bot-settings"
import {
	createRosterController,
	type RosterController,
	type RosterSpace,
} from "./roster-controller"
import { useRosterReads } from "./use-roster"

import { useControllerState } from "../use-controller"
import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"
import {
	botHostStatesIn,
	withNeedsYou,
	workingFromHost,
} from "../conversations/host-state-rows"
import type { ObservedState, SoloState } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"
import { createQueryTestWrapper } from "../query/query-test-wrapper"

type HostHandler = (event: { payload: unknown }, hostId: string | null) => void

const host = vi.hoisted(() => ({ handlers: new Map<string, HostHandler>() }))

vi.mock("@/lib/host", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/host")>()),
	listen: async (event: string, handler: HostHandler) => {
		host.handlers.set(event, handler)
		return () => host.handlers.delete(event)
	},
	onHostReconnected: () => () => undefined,
}))

vi.mock("@workspace/ui/components/notice-surface", async (importOriginal) => ({
	...(await importOriginal()),
	raiseFailureNotice: vi.fn(() => "notice-1"),
}))

afterEach(() => {
	cleanup()
	vi.mocked(raiseFailureNotice).mockClear()
})

const LOCAL = { spaceRowId: "personal", spaceId: "personal" }

const MEMBER_HOST = "shed"

const UNPAGED = "solo-unpaged"

const ASKING: ObservedState = {
	state: "needs_you",
	pendingPrompt: {
		promptId: "prompt-branch",
		kind: "question",
		text: "Which branch?",
	},
	workingBotIds: [],
}

const ANSWERED: ObservedState = {
	state: "idle",
	pendingPrompt: null,
	workingBotIds: [],
}

type Seat = { space: RosterSpace; hostId: string | null }

const withoutPagedSoloThreads = (store: TranscriptStore) => {
	const read = store.conversationPage
	vi.spyOn(store, "conversationPage").mockImplementation(async (...args) => {
		const page = await read(...args)
		const isTopic = ({ soloBotId }: { soloBotId: string | null }) =>
			soloBotId === null
		return {
			...page,
			pinned: page.pinned.filter(isTopic),
			conversations: page.conversations.filter(isTopic),
		}
	})
}

const seededStore = async (onMember: boolean) => {
	const store = createFakeTranscriptStore()
	const companion = await store.createBot(
		newBotIdentity(await store.bots(LOCAL.spaceId)),
		LOCAL.spaceId,
	)
	if (!onMember) {
		return { store, companion, seat: { space: LOCAL, hostId: null } }
	}
	const shed = await store.createSpace("Shed")
	await store.addBotToSpace("default", shed.id)
	await store.addBotToSpace(companion.id, shed.id)
	const seat: Seat = {
		space: { spaceRowId: `joined:${MEMBER_HOST}`, spaceId: shed.id },
		hostId: MEMBER_HOST,
	}
	return { store, companion, seat }
}

const loadedRoster = async (store: TranscriptStore, { space }: Seat) => {
	const { queryClient, wrapper } = createQueryTestWrapper()
	const controller = createRosterController(store, { queryClient })
	renderHook(() => useRosterReads(controller, useControllerState(controller)), {
		wrapper,
	})
	await act(() =>
		controller.load({
			spaces: [space],
			spaceRowId: space.spaceRowId,
			lastRowId: null,
		}),
	)
	await act(async () => {
		await vi.waitFor(() => expect(queryClient.isFetching()).toBe(0))
	})
	return controller
}

const companionRowIn = (
	controller: RosterController,
	{ spaceRowId }: RosterSpace,
	botId: string,
) => {
	const { hostStates, soloThreads } = controller.getState()
	const botStates = botHostStatesIn({
		hostStates,
		soloThreads,
		spaceId: spaceRowId,
	})
	return {
		...withNeedsYou([{ id: botId }], botStates)[0],
		isWorking: workingFromHost(botStates, {})[botId]?.isWorking ?? false,
	}
}

const soloStateOf = (
	botId: string,
	observed: ObservedState,
	conversationId = UNPAGED,
): SoloState => ({ botId, conversationId, ...observed })

const changeStateOnHost = (
	{ space, hostId }: Seat,
	observed: ObservedState,
	conversationId = UNPAGED,
) =>
	act(async () => {
		host.handlers.get("conversation://state-changed")?.(
			{ payload: { conversationId, spaceId: space.spaceId, ...observed } },
			hostId,
		)
	})

const NEEDS_YOU_ROW = {
	badge: "attention",
	pendingQuestion: "Which branch?",
	isWorking: false,
}

it.each([
	{ on: "the host", onMember: false },
	{ on: "a member computer", onMember: true },
])(
	"follows a companion without a paged solo thread from pending to answered to working with one solo states read on $on",
	async ({ onMember }) => {
		const { store, companion, seat } = await seededStore(onMember)
		withoutPagedSoloThreads(store)
		const soloStatesReads = vi
			.spyOn(store, "conversationSoloStates")
			.mockResolvedValue([soloStateOf(companion.id, ASKING)])
		const mainChatReads = vi.spyOn(store, "mainChat")

		const controller = await loadedRoster(store, seat)

		expect(soloStatesReads).toHaveBeenCalledTimes(1)
		expect(soloStatesReads).toHaveBeenCalledWith(
			seat.space.spaceId,
			expect.anything(),
		)
		expect(companionRowIn(controller, seat.space, companion.id)).toEqual({
			id: companion.id,
			...NEEDS_YOU_ROW,
		})

		await changeStateOnHost(seat, ANSWERED)

		expect(companionRowIn(controller, seat.space, companion.id)).toEqual({
			id: companion.id,
			isWorking: false,
		})

		await changeStateOnHost(seat, {
			state: "working",
			pendingPrompt: null,
			workingBotIds: [companion.id],
		})

		expect(companionRowIn(controller, seat.space, companion.id)).toEqual({
			id: companion.id,
			isWorking: true,
		})
		expect(soloStatesReads).toHaveBeenCalledTimes(1)
		expect(mainChatReads).not.toHaveBeenCalledWith(
			companion.id,
			expect.anything(),
			expect.anything(),
		)
	},
)

it("shows a companion working from the solo states read alone", async () => {
	const { store, companion, seat } = await seededStore(false)
	withoutPagedSoloThreads(store)
	vi.spyOn(store, "conversationSoloStates").mockResolvedValue([
		soloStateOf(companion.id, {
			state: "working",
			pendingPrompt: null,
			workingBotIds: [companion.id],
		}),
	])

	const controller = await loadedRoster(store, seat)

	expect(companionRowIn(controller, seat.space, companion.id)).toEqual({
		id: companion.id,
		isWorking: true,
	})
})

it("takes the state of a paged solo thread over its solo states entry", async () => {
	const { store, companion, seat } = await seededStore(false)
	const [paged] = (await store.conversationSoloStates(LOCAL.spaceId)).filter(
		({ botId }) => botId === companion.id,
	)
	vi.spyOn(store, "conversationSoloStates").mockResolvedValue([
		soloStateOf(companion.id, ASKING, paged?.conversationId),
	])

	const controller = await loadedRoster(store, seat)

	expect(companionRowIn(controller, seat.space, companion.id)).toEqual({
		id: companion.id,
		isWorking: false,
	})
})

it("keeps a plain row and creates no conversation for a companion the solo states read leaves out", async () => {
	const { store, companion, seat } = await seededStore(false)
	withoutPagedSoloThreads(store)
	vi.spyOn(store, "conversationSoloStates").mockResolvedValue([])
	const mainChatReads = vi.spyOn(store, "mainChat")
	const creations = vi.spyOn(store, "createConversation")

	const controller = await loadedRoster(store, seat)

	expect(companionRowIn(controller, seat.space, companion.id)).toEqual({
		id: companion.id,
		isWorking: false,
	})
	expect(mainChatReads).not.toHaveBeenCalledWith(
		companion.id,
		expect.anything(),
		expect.anything(),
	)
	expect(creations).not.toHaveBeenCalled()
})

it("rereads the solo states once for state changes naming a conversation the roster does not know", async () => {
	const { store, companion, seat } = await seededStore(false)
	withoutPagedSoloThreads(store)
	const soloStatesReads = vi
		.spyOn(store, "conversationSoloStates")
		.mockResolvedValueOnce([])
		.mockResolvedValue([soloStateOf(companion.id, ASKING)])
	const controller = await loadedRoster(store, seat)
	const pageReads = vi.mocked(store.conversationPage)
	pageReads.mockClear()

	await changeStateOnHost(seat, ASKING)
	await changeStateOnHost(seat, ASKING)
	await act(async () => {
		await vi.waitFor(() => expect(soloStatesReads).toHaveBeenCalledTimes(2))
	})

	expect(companionRowIn(controller, seat.space, companion.id)).toEqual({
		id: companion.id,
		...NEEDS_YOU_ROW,
	})
	expect(soloStatesReads).toHaveBeenCalledTimes(2)
	expect(pageReads).not.toHaveBeenCalled()
})

it("raises the roster notice and keeps the rows it shows when a solo states reread fails", async () => {
	const { store, companion, seat } = await seededStore(false)
	withoutPagedSoloThreads(store)
	const soloStatesReads = vi
		.spyOn(store, "conversationSoloStates")
		.mockResolvedValueOnce([soloStateOf(companion.id, ASKING)])
		.mockRejectedValue(new Error("no record"))
	const controller = await loadedRoster(store, seat)

	await changeStateOnHost(seat, ANSWERED, "solo-unknown")

	await act(async () => {
		await vi.waitFor(() =>
			expect(raiseFailureNotice).toHaveBeenCalledWith(
				expect.objectContaining({
					title: "Couldn’t load the latest messages. Restart Kiroshi to retry.",
				}),
			),
		)
	})
	expect(soloStatesReads).toHaveBeenCalledTimes(2)
	expect(companionRowIn(controller, seat.space, companion.id)).toEqual({
		id: companion.id,
		...NEEDS_YOU_ROW,
	})
	expect(controller.getState().bots.map(({ id }) => id)).toContain(companion.id)
})
