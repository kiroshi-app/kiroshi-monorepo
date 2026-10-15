// @vitest-environment happy-dom

import { act, cleanup, render, waitFor } from "@testing-library/react"
import { createElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ListEndSlot } from "@workspace/ui/components/list-skeleton"

import {
	createRosterController,
	type RosterController,
} from "./roster-controller"
import { useRosterReads } from "./use-roster"

import { useControllerState } from "../use-controller"
import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"
import type { ConversationPage } from "../conversations/store-contract"
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

const crossingSentinels = new Set<IntersectionObserverCallback>()

class SentinelWatch {
	constructor(private readonly onCross: IntersectionObserverCallback) {}

	observe() {
		crossingSentinels.add(this.onCross)
	}

	disconnect() {
		crossingSentinels.delete(this.onCross)
	}
}

const scrollToListEnd = () =>
	act(() => {
		for (const onCross of crossingSentinels) {
			onCross(
				[{ isIntersecting: true } as IntersectionObserverEntry],
				{} as IntersectionObserver,
			)
		}
	})

const emitOnHost = (event: string, payload: unknown) =>
	act(async () => {
		host.handlers.get(event)?.({ payload }, null)
	})

const reconnectHost = (hostId: string) =>
	act(async () => {
		for (const onReconnected of host.reconnects) {
			onReconnected(hostId)
		}
	})

const sentinel = () => document.querySelector('[data-slot="list-end-sentinel"]')

const loadingMoreRow = () =>
	document.querySelector('[data-slot="list-end-skeleton"]')

type RosterEndProps = { controller: RosterController }

const RosterEnd = ({ controller }: RosterEndProps) =>
	createElement(ListEndSlot, {
		listEnd: useRosterReads(controller, useControllerState(controller)),
		row: null,
	})

const storeWithConversations = async (count: number) => {
	const store = createFakeTranscriptStore()
	for (let rank = 1; rank <= count; rank++) {
		await store.createConversation({
			spaceId: LOCAL.spaceId,
			sectionId: null,
			title: `Conversation ${rank}`,
			botIds: ["default"],
		})
	}
	return store
}

const mountRoster = async (store: TranscriptStore) => {
	const { queryClient, wrapper } = createQueryTestWrapper()
	const controller = createRosterController(store, { queryClient })
	render(createElement(RosterEnd, { controller }), { wrapper })
	await act(() =>
		controller.load({
			spaces: [LOCAL],
			spaceRowId: "personal",
			lastRowId: null,
		}),
	)
	return controller
}

const shownIds = (roster: RosterController) =>
	roster.getState().conversations.map(({ id }) => id)

const conversationIdsRanked = (first: number, last: number) =>
	Array.from(
		{ length: first - last + 1 },
		(_, index) => `conversation-${first - index}`,
	)

const pagedStore = async () => {
	const store = await storeWithConversations(35)
	const readPage = store.conversationPage
	const reads = vi.spyOn(store, "conversationPage")
	return { store, readPage, reads }
}

beforeEach(() => {
	crossingSentinels.clear()
	host.handlers.clear()
	host.reconnects.clear()
	vi.stubGlobal("IntersectionObserver", SentinelWatch)
})

afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
})

describe("the roster conversations read a page at a time", () => {
	it("reads 30 conversations with every bot of the space at first", async () => {
		const { store, reads } = await pagedStore()

		const roster = await mountRoster(store)

		expect(reads).toHaveBeenCalledOnce()
		expect(reads).toHaveBeenCalledWith(
			"personal",
			null,
			30,
			expect.any(AbortSignal),
		)
		expect(shownIds(roster)).toEqual(conversationIdsRanked(35, 6))
		expect(roster.getState().bots.map(({ id }) => id)).toEqual(["default"])
		expect(sentinel()).not.toBeNull()
	})

	it("appends the next 30 below the rows shown once the end of the list comes into view", async () => {
		const { store, reads } = await pagedStore()
		const roster = await mountRoster(store)

		await scrollToListEnd()

		await waitFor(() =>
			expect(shownIds(roster)).toEqual(conversationIdsRanked(35, 1)),
		)
		expect(reads).toHaveBeenLastCalledWith(
			"personal",
			"30",
			30,
			expect.any(AbortSignal),
		)
	})

	it("shows the loading row and asks once for a next page however often the end comes into view while it reads", async () => {
		const { store, readPage, reads } = await pagedStore()
		let answerNext: () => void = () => undefined
		reads.mockImplementation((spaceId, cursor, limit) =>
			cursor === null
				? readPage(spaceId, cursor, limit)
				: new Promise<ConversationPage>((resolve) => {
						answerNext = () => resolve(readPage(spaceId, cursor, limit))
					}),
		)
		const roster = await mountRoster(store)

		await scrollToListEnd()
		await scrollToListEnd()
		await scrollToListEnd()

		await waitFor(() => expect(loadingMoreRow()).not.toBeNull())
		expect(reads).toHaveBeenCalledTimes(2)
		await act(async () => answerNext())
		await waitFor(() => expect(shownIds(roster)).toHaveLength(35))
		expect(reads).toHaveBeenCalledTimes(2)
	})

	it("asks for nothing more and hides the end of the list once the last page answers", async () => {
		const { store, reads } = await pagedStore()
		const roster = await mountRoster(store)

		await scrollToListEnd()
		await waitFor(() => expect(shownIds(roster)).toHaveLength(35))
		await scrollToListEnd()

		expect(sentinel()).toBeNull()
		expect(loadingMoreRow()).toBeNull()
		expect(reads).toHaveBeenCalledTimes(2)
	})

	it("shows a conversation held by two pages once", async () => {
		const { store, readPage, reads } = await pagedStore()
		const head = await readPage("personal", null, 30)
		const lastOfHead = head.conversations[29]
		reads.mockImplementation(async (spaceId, cursor, limit) => {
			const page = await readPage(spaceId, cursor, limit)
			return cursor === null
				? page
				: { ...page, conversations: [lastOfHead, ...page.conversations] }
		})
		const roster = await mountRoster(store)

		await scrollToListEnd()

		await waitFor(() =>
			expect(shownIds(roster)).toEqual(conversationIdsRanked(35, 1)),
		)
	})
})

describe("a refresh of the roster pages scrolled through", () => {
	const scrolledRoster = async () => {
		const paged = await pagedStore()
		const roster = await mountRoster(paged.store)
		await scrollToListEnd()
		await waitFor(() => expect(shownIds(roster)).toHaveLength(35))
		paged.reads.mockClear()
		return { ...paged, roster }
	}

	it("shows a created conversation at the top of the pages scrolled through without reading any page", async () => {
		const { store, readPage, reads, roster } = await scrolledRoster()
		await store.createConversation({
			spaceId: LOCAL.spaceId,
			sectionId: null,
			title: "Conversation 36",
			botIds: ["default"],
		})
		const [created] = (await readPage("personal", null, 30)).conversations
		reads.mockClear()

		await emitOnHost("conversation://created", {
			spaceId: LOCAL.spaceId,
			conversation: created,
		})

		expect(shownIds(roster)).toEqual(conversationIdsRanked(36, 1))
		expect(reads).not.toHaveBeenCalled()
	})

	it("shows a conversation written to outside the first page at the top, once, without reading any page", async () => {
		const { readPage, reads, roster } = await scrolledRoster()
		const [written] = (await readPage("personal", "30", 30)).conversations
		reads.mockClear()

		await emitOnHost("conversation://updated", {
			spaceId: LOCAL.spaceId,
			conversation: { ...written, title: "Answered just now" },
		})

		expect(shownIds(roster)[0]).toBe(written.id)
		expect(shownIds(roster).filter((id) => id === written.id)).toHaveLength(1)
		expect(shownIds(roster)).toHaveLength(35)
		expect(reads).not.toHaveBeenCalled()
	})

	it("reads nothing of a local space when a joined host reconnects", async () => {
		const { reads, roster } = await scrolledRoster()

		await reconnectHost("garage")

		expect(reads).not.toHaveBeenCalled()
		expect(shownIds(roster)).toEqual(conversationIdsRanked(35, 1))
	})

	it("drops a deleted conversation from a page scrolled through", async () => {
		const { roster } = await scrolledRoster()

		await emitOnHost("conversation://deleted", {
			spaceId: LOCAL.spaceId,
			conversationId: "conversation-2",
		})

		expect(shownIds(roster)).not.toContain("conversation-2")
		expect(shownIds(roster)).toHaveLength(34)
	})
})
