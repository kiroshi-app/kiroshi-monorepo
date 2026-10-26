// @vitest-environment happy-dom

import { listen } from "@tauri-apps/api/event"
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createFakeTranscriptStore } from "./fake-transcript-store"
import type { TranscriptStore } from "./store-port"
import {
	COMPANION_ARRIVED_EVENT,
	type CompanionArrival,
} from "./transcript-contract"
import { useCompanionArrivals } from "./use-companion-arrivals"

import { newBotIdentity } from "../bots/bot-settings"
import { mountRoster } from "../bots/mounted-roster"
import type { RosterController } from "../bots/roster-controller"

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }))

const hostListen = vi.mocked(listen)

type Announce = (event: { payload: unknown }) => void

let announce: Announce | null = null

let unsubscribe = vi.fn()

afterEach(cleanup)

beforeEach(() => {
	announce = null
	unsubscribe = vi.fn()
	Reflect.set(window, "__TAURI_INTERNALS__", {})
	hostListen.mockReset()
	hostListen.mockImplementation((_event, handler) => {
		announce = handler as Announce
		return Promise.resolve(unsubscribe)
	})
})

const arrivalOf = (
	conversationId: string,
	botId: string,
): CompanionArrival => ({
	id: "arrival-1",
	conversationId,
	botId,
	invitedByBotId: "bot-1",
	lastMessageSeq: 3,
	createdAt: 9,
})

type AwayConversation = {
	store: TranscriptStore
	controller: RosterController
	spaceId: string
	conversationId: string
	invitedBotId: string
}

const anAwayConversation = async (): Promise<AwayConversation> => {
	const store = createFakeTranscriptStore()
	const away = await store.createSpace("Away")
	const host = await store.createBot(newBotIdentity([]), away.id)
	const invited = await store.createBot(newBotIdentity([host]), away.id)
	const conversation = await store.createConversation({
		spaceId: away.id,
		sectionId: null,
		title: "Away thread",
		botIds: [host.id],
	})
	const controller = mountRoster(store)
	await controller.load({
		spaces: ["personal", away.id].map((id) => ({
			spaceRowId: id,
			spaceId: id,
		})),
		spaceRowId: "personal",
		lastRowId: null,
	})
	return {
		store,
		controller,
		spaceId: away.id,
		conversationId: conversation.id,
		invitedBotId: invited.id,
	}
}

const listening = async (controller: RosterController) => {
	const rendered = renderHook(() =>
		useCompanionArrivals(() => {
			void controller.reload()
		}),
	)
	await act(async () => undefined)
	return rendered
}

const announcing = async (arrival: CompanionArrival) => {
	if (!announce) {
		throw new Error(`nothing listens to ${COMPANION_ARRIVED_EVENT}`)
	}
	const settle = announce
	await act(async () => {
		settle({ payload: arrival })
		await new Promise((resolve) => setTimeout(resolve, 0))
	})
}

const participantsOf = ({
	controller,
	spaceId,
	conversationId,
}: AwayConversation) =>
	(controller.getState().conversationRosters[spaceId] ?? [])
		.find((conversation) => conversation.id === conversationId)
		?.participants.map((participant) => participant.botId) ?? []

const firstBotOf = (controller: RosterController) => {
	const bot = controller.getState().bots[0]
	if (!bot) {
		throw new Error("the roster holds no companion")
	}
	return bot.id
}

describe("useCompanionArrivals", () => {
	it("carries the invited companion in the conversation roster of another space", async () => {
		const away = await anAwayConversation()
		const { store, controller, conversationId, invitedBotId } = away
		await listening(controller)
		await store.addConversationParticipant(conversationId, invitedBotId)

		await announcing(arrivalOf(conversationId, invitedBotId))

		expect(participantsOf(away)).toContain(invitedBotId)
	})

	it("leaves the selected row as it was", async () => {
		const away = await anAwayConversation()
		const { store, controller, conversationId, invitedBotId } = away
		const selectedBotId = firstBotOf(controller)
		controller.select(selectedBotId)
		await listening(controller)
		await store.addConversationParticipant(conversationId, invitedBotId)

		await announcing(arrivalOf(conversationId, invitedBotId))

		expect(controller.getState().selectedBotId).toBe(selectedBotId)
	})

	it("re-reads the roster once when the same arrival is announced twice", async () => {
		const away = await anAwayConversation()
		const { store, controller, spaceId, conversationId, invitedBotId } = away
		await listening(controller)
		const reading = vi.spyOn(store, "conversationPage")

		const arrival = arrivalOf(conversationId, invitedBotId)
		await announcing(arrival)
		await announcing(arrival)

		expect(reading.mock.calls.filter(([id]) => id === spaceId)).toHaveLength(1)
	})

	it("marks the roster as failed and holds the known conversations when the re-read fails", async () => {
		const away = await anAwayConversation()
		const { store, controller, conversationId, invitedBotId } = away
		const known = participantsOf(away)
		await listening(controller)
		vi.spyOn(store, "conversationPage").mockRejectedValue(
			new Error("no record"),
		)

		await announcing(arrivalOf(conversationId, invitedBotId))

		expect(controller.getState().hasFailedToLoad).toBe(true)
		expect(participantsOf(away)).toEqual(known)
	})

	it("drops the listener when the screen goes away", async () => {
		const { controller } = await anAwayConversation()
		const { unmount } = await listening(controller)

		unmount()
		await act(async () => undefined)

		expect(unsubscribe).toHaveBeenCalledTimes(1)
	})

	it("reports a listener that could not be armed instead of failing silently", async () => {
		const reported = vi.spyOn(console, "error").mockImplementation(() => {})
		hostListen.mockRejectedValue(new Error("no window"))
		const { controller } = await anAwayConversation()

		await listening(controller)

		expect(reported).toHaveBeenCalledWith(
			"conversations: companion arrivals could not be listened to",
			expect.any(Error),
		)
		reported.mockRestore()
	})
})
