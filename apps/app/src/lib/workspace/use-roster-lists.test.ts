// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import "@workspace/ui/lib/i18n"

import { useRosterLists } from "./use-roster-lists"

import { mountRoster } from "../bots/mounted-roster"
import type { RosterController } from "../bots/roster-controller"
import { rosterLinesIn } from "../bots/roster-line"
import {
	type ChatController,
	createChatController,
} from "../chat/chat-controller"
import { createConversationController } from "../conversations/conversation-controller"
import type { ConversationRuntimes } from "../conversations/conversation-runtimes"
import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"
import { createScriptedDriver } from "../conversations/scripted-driver"
import type { TranscriptStore } from "../conversations/store-port"
import { createQueryTestWrapper } from "../query/query-test-wrapper"

vi.mock("@tauri-apps/api/event", () => ({
	listen: vi.fn(async () => () => undefined),
}))

afterEach(cleanup)

const SPACE = "personal"

const BOT = "default"

type Said = {
	conversationId: string
	content: string
	authorBotId: string | null
	createdAt: number
}

const saidIn = async (store: TranscriptStore, said: Said) => {
	const turnId = `turn-${said.createdAt}`
	await store.startTurn({
		id: turnId,
		conversationId: said.conversationId,
		startedAt: said.createdAt,
	})
	await store.appendUserMessage({
		id: `said-${said.createdAt}`,
		turnId,
		repliedToMessageId: null,
		...said,
	})
}

type HeldChat = Pick<ChatController, "subscribe" | "stateFor">

type HeldConversations = Pick<ConversationRuntimes, "subscribe" | "heldFor">

const NO_HELD_CHAT: HeldChat = {
	subscribe: () => () => undefined,
	stateFor: () => {
		throw new Error("no chat is held")
	},
}

const NO_HELD_CONVERSATIONS: HeldConversations = {
	subscribe: () => () => undefined,
	heldFor: () => null,
}

type RosterListsWiring = {
	roster: RosterController
	chat?: HeldChat
	conversationRuntimes?: HeldConversations
}

const rosterListsOn = ({
	roster,
	chat = NO_HELD_CHAT,
	conversationRuntimes = NO_HELD_CONVERSATIONS,
}: RosterListsWiring) => {
	const { bots, rosters, soloThreads } = roster.getState()
	return {
		core: {
			chat: { controller: chat },
			conversationRuntimes,
			roster: { controller: roster, state: { isRosterPending: false } },
		},
		drivers: { badges: {}, conversationBadges: {} },
		rosterLines: {
			lines: rosterLinesIn(rosters),
			now: 0,
			rosters,
			working: {},
		},
		rosterView: { bots, missions: [], rosteredSpaceId: SPACE, soloThreads },
		waitingMissionCount: 0,
	} as unknown as Parameters<typeof useRosterLists>[0]
}

const loadedRoster = async (store: TranscriptStore) => {
	const roster = mountRoster(store)
	await roster.load({
		spaces: [{ spaceRowId: SPACE, spaceId: SPACE }],
		spaceRowId: SPACE,
		lastRowId: null,
	})
	return roster
}

const renderRosterLists = (wiring: RosterListsWiring) =>
	renderHook(() => useRosterLists(rosterListsOn(wiring)), {
		wrapper: createQueryTestWrapper().wrapper,
	}).result

describe("useRosterLists", () => {
	it("shows the stored last word on a row whose held controller settled on an older one", async () => {
		const store = createFakeTranscriptStore()
		const conversation = await store.createConversation({
			spaceId: SPACE,
			sectionId: null,
			title: "Walls",
			botIds: [BOT],
		})
		await saidIn(store, {
			conversationId: conversation.id,
			content: "Older word",
			authorBotId: null,
			createdAt: 1,
		})
		const held = createConversationController(createScriptedDriver(), store)
		await act(() => held.open(conversation))
		await saidIn(store, {
			conversationId: conversation.id,
			content: "Newer word",
			authorBotId: BOT,
			createdAt: 2,
		})
		const roster = await loadedRoster(store)

		const result = renderRosterLists({
			roster,
			conversationRuntimes: { subscribe: held.subscribe, heldFor: () => held },
		})

		const speaker = conversation.participants.find(
			(participant) => participant.botId === BOT,
		)
		const row = result.current.rosterConversations.find(
			({ id }) => id === conversation.id,
		)
		expect(held.getState().messages.map(({ content }) => content)).toEqual([
			"Older word",
		])
		expect(row).toMatchObject({
			lastMessage: "Newer word",
			lastSpeaker: speaker?.name,
			lastActivityAt: 2,
		})
	})

	it.each([
		{ openBotIds: [BOT], status: "working" },
		{ openBotIds: null, status: "idle" },
	])(
		"shows the row $status when its stored open turn names $openBotIds",
		async ({ openBotIds, status }) => {
			const store = createFakeTranscriptStore()
			const conversation = await store.createConversation({
				spaceId: SPACE,
				sectionId: null,
				title: "Walls",
				botIds: [BOT],
			})
			const roster = await loadedRoster(store)
			act(() =>
				roster.holdPageRow(
					{ hostId: null, spaceId: SPACE },
					{
						...conversation,
						lastActivityAt: 0,
						lastWord: null,
						soloBotId: null,
						activeTurn: openBotIds && { startedAt: 1, botIds: openBotIds },
					},
				),
			)

			const result = renderRosterLists({ roster })

			const row = result.current.rosterConversations.find(
				({ id }) => id === conversation.id,
			)
			expect(row?.status).toBe(status)
			expect(
				row?.participants.map((participant) => participant.status),
			).toEqual([status])
		},
	)

	it("shows the stored last word on a companion row whose held solo thread settled on an older one", async () => {
		const store = createFakeTranscriptStore()
		const soloThread = await store.mainChat(BOT, null)
		await saidIn(store, {
			conversationId: soloThread.id,
			content: "Older word",
			authorBotId: null,
			createdAt: 1,
		})
		const chat = createChatController(createScriptedDriver(), store)
		await act(() => chat.open(BOT, null))
		await saidIn(store, {
			conversationId: soloThread.id,
			content: "Newer word",
			authorBotId: null,
			createdAt: 2,
		})
		const roster = await loadedRoster(store)

		const result = renderRosterLists({ roster, chat })

		const row = result.current.rosterBots.find(({ id }) => id === BOT)
		expect(chat.stateFor(BOT).messages.map(({ content }) => content)).toEqual([
			"Older word",
		])
		expect(row).toMatchObject({ lastMessage: "Newer word", lastActivityAt: 2 })
	})
})
