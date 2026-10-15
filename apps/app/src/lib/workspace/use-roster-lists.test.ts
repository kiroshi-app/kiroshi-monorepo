// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import "@workspace/ui/lib/i18n"

import { useRosterLists } from "./use-roster-lists"

import { mountRoster } from "../bots/mounted-roster"
import type { RosterController } from "../bots/roster-controller"
import {
	type ConversationController,
	createConversationController,
} from "../conversations/conversation-controller"
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

type RosterListsWiring = {
	roster: RosterController
	held: ConversationController
}

const rosterListsOn = ({ roster, held }: RosterListsWiring) =>
	({
		core: {
			chat: { controller: { subscribe: () => () => undefined } },
			conversationRuntimes: {
				subscribe: held.subscribe,
				heldFor: () => held,
			},
			roster: { controller: roster, state: { isRosterPending: false } },
		},
		drivers: { badges: {}, conversationBadges: {} },
		rosterLines: { lines: [], now: 0, rosters: {}, working: {} },
		rosterView: {
			bots: [],
			missions: [],
			rosteredSpaceId: SPACE,
			soloThreads: {},
		},
		waitingMissionCount: 0,
	}) as unknown as Parameters<typeof useRosterLists>[0]

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
		const roster = mountRoster(store)
		await roster.load({
			spaces: [{ spaceRowId: SPACE, spaceId: SPACE }],
			spaceRowId: SPACE,
			lastRowId: null,
		})

		const { result } = renderHook(
			() => useRosterLists(rosterListsOn({ roster, held })),
			{ wrapper: createQueryTestWrapper().wrapper },
		)

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
})
