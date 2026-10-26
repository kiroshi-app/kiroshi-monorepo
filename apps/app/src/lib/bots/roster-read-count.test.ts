// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { newBotIdentity } from "./bot-settings"
import {
	createRosterController,
	type RosterController,
} from "./roster-controller"
import { useRosterReads } from "./use-roster"

import { useControllerState } from "../use-controller"
import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"
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

afterEach(cleanup)

const LOCAL = { spaceRowId: "personal", spaceId: "personal" }

const COMMANDS: Record<string, string> = {
	conversationPage: "conversation_page",
	conversationSoloStates: "conversation_solo_states",
	loadPage: "conversation_message_page",
	mainChat: "conversation_main_chat",
}

type StoreCall = (...args: unknown[]) => unknown

type CountedStore = {
	store: TranscriptStore
	countOf: (command: string) => number
	resetCounts: () => void
}

const countedCallsOn = (store: TranscriptStore): CountedStore => {
	const counts = new Map<string, number>()
	const counted = Object.fromEntries(
		Object.entries(store).map(([name, member]) => [
			name,
			typeof member === "function"
				? (...args: unknown[]) => {
						const command = COMMANDS[name] ?? name
						counts.set(command, (counts.get(command) ?? 0) + 1)
						return (member as StoreCall)(...args)
					}
				: member,
		]),
	) as TranscriptStore
	return {
		store: counted,
		countOf: (command) => counts.get(command) ?? 0,
		resetCounts: () => counts.clear(),
	}
}

type RosterSize = { conversations: number; bots: number }

const storeOfSize = async ({ conversations, bots }: RosterSize) => {
	const store = createFakeTranscriptStore()
	for (let rank = 1; rank < bots; rank++) {
		await store.createBot(
			newBotIdentity(await store.bots(LOCAL.spaceId)),
			LOCAL.spaceId,
		)
	}
	for (let rank = 1; rank <= conversations; rank++) {
		await store.createConversation({
			spaceId: LOCAL.spaceId,
			sectionId: null,
			title: `Conversation ${rank}`,
			botIds: ["default"],
		})
	}
	return store
}

const mountRosterOver = async (store: TranscriptStore) => {
	const { queryClient, wrapper } = createQueryTestWrapper()
	const controller = createRosterController(store, { queryClient })
	renderHook(() => useRosterReads(controller, useControllerState(controller)), {
		wrapper,
	})
	await act(() =>
		controller.load({
			spaces: [LOCAL],
			spaceRowId: LOCAL.spaceRowId,
			lastRowId: null,
		}),
	)
	return controller
}

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve)))

const soloBotIdsOf = (roster: RosterController) =>
	Object.values(roster.getState().soloThreads).map(({ botId }) => botId)

it.each([
	{ conversations: 4, bots: 3 },
	{ conversations: 12, bots: 8 },
])(
	"reads a roster of $conversations conversations and $bots bots with one page read and no read per row",
	async (size) => {
		const counted = countedCallsOn(await storeOfSize(size))

		const roster = await mountRosterOver(counted.store)
		await settle()

		expect(counted.countOf("conversation_page")).toBe(1)
		expect(counted.countOf("conversation_solo_states")).toBe(1)
		expect(counted.countOf("conversation_message_page")).toBe(0)
		expect(counted.countOf("conversation_main_chat")).toBe(0)
		expect(roster.getState().bots).toHaveLength(size.bots)
		expect(roster.getState().conversations).toHaveLength(size.conversations)
		expect(soloBotIdsOf(roster)).toHaveLength(size.bots)
	},
)

it("resolves the solo threads of bots beyond the loaded pages with one solo states read and no main chat read", async () => {
	const counted = countedCallsOn(
		await storeOfSize({ conversations: 35, bots: 6 }),
	)

	const roster = await mountRosterOver(counted.store)
	await settle()
	const botIds = roster.getState().bots.map(({ id }) => id)

	expect(counted.countOf("conversation_page")).toBe(1)
	expect(counted.countOf("conversation_solo_states")).toBe(1)
	expect(counted.countOf("conversation_main_chat")).toBe(0)
	expect(soloBotIdsOf(roster).toSorted()).toEqual(botIds.toSorted())

	const opened = roster.getState().selectedBotId
	const next = roster.getState().bots.find(({ id }) => id !== opened)
	act(() => roster.select(next?.id ?? ""))
	await settle()

	expect(counted.countOf("conversation_solo_states")).toBe(1)
	expect(counted.countOf("conversation_main_chat")).toBe(0)
})

const withLatestFirst = (store: TranscriptStore) => {
	const latest = { id: null as string | null }
	const read = store.conversationPage
	store.conversationPage = async (...args) => {
		const page = await read(...args)
		const isLatest = ({ id }: { id: string }) => id === latest.id
		return {
			...page,
			conversations: [
				...page.conversations.filter(isLatest),
				...page.conversations.filter((row) => !isLatest(row)),
			],
		}
	}
	return latest
}

it("moves a conversation updated by a sent message to the top with no read per row", async () => {
	const base = await storeOfSize({ conversations: 12, bots: 8 })
	const latest = withLatestFirst(base)
	const counted = countedCallsOn(base)
	const roster = await mountRosterOver(counted.store)
	await settle()
	const oldest = roster.getState().conversations.at(-1)
	if (!oldest) throw new Error("the roster holds no conversation")
	latest.id = oldest.id
	counted.resetCounts()

	await act(async () => {
		host.handlers.get("conversation://updated")?.(
			{
				payload: { spaceId: LOCAL.spaceId, conversation: oldest },
			},
			null,
		)
	})
	await settle()

	expect(roster.getState().conversations[0]?.id).toBe(oldest.id)
	expect(counted.countOf("conversation_page")).toBeLessThanOrEqual(1)
	expect(counted.countOf("conversation_message_page")).toBe(0)
	expect(counted.countOf("conversation_main_chat")).toBe(0)
})
