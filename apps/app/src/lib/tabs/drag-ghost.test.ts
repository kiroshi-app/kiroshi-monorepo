// @vitest-environment happy-dom

import { act, cleanup, render, screen } from "@testing-library/react"
import { createElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import "@workspace/ui/lib/i18n"

import { type DockTarget, DRAG_GHOST_STATE_EVENT } from "./drag-ghost-state"
import { createDragGhostView } from "./drag-ghost-view"
import type { GhostCardReader } from "./use-ghost-card"

import {
	DRAG_GHOST_TAB_EVENT,
	type DragGhostTab,
	type TranscriptMessage,
	type TranscriptPage,
} from "../bindings"
import { DragGhost } from "@/components/drag-ghost"
import type { Bot, Conversation } from "../conversations/store-contract"
import { createQueryTestWrapper } from "../query/query-test-wrapper"

const SPACE = "space-home"

const CONVERSATION_TAB: DragGhostTab = {
	tabId: "torn",
	href: "/?conversation=release",
	title: "Release notes for 2.4",
}

const BOT_TAB: DragGhostTab = {
	tabId: "solo",
	href: "/?bot=ada",
	title: "Ada",
}

const MISSION_TAB: DragGhostTab = {
	tabId: "mission",
	href: "/?bot=ada&mission=launch",
	title: "Launch checklist",
}

const participantOf = (
	botId: string,
	name: string,
	leftAt: number | null,
): Conversation["participants"][number] => ({
	botId,
	role: "assistant",
	joinedAt: 0,
	leftAt,
	name,
	avatarBlot: null,
	avatarImagePath: null,
	isDeleted: false,
})

const RELEASE: Conversation = {
	id: "release",
	spaceId: SPACE,
	sectionId: null,
	pinPosition: null,
	title: "Release notes",
	instructions: "",
	icon: null,
	color: null,
	createdAt: 0,
	updatedAt: 0,
	participants: [
		participantOf("gone", "Grace", 1),
		participantOf("ada", "Ada", null),
	],
}

const ADA = {
	id: "ada",
	name: "Ada Lovelace",
	avatarBlot: null,
	avatarImagePath: null,
} as unknown as Bot

const messageOf = (
	id: string,
	role: TranscriptMessage["role"],
	content: string,
	completion: TranscriptMessage["completion"] = "complete",
): TranscriptMessage => ({
	id,
	conversationId: "release",
	turnId: id,
	seq: 0,
	role,
	content,
	completion,
	createdAt: 0,
	authorBotId: role === "assistant" ? "ada" : null,
	authorAccountId: null,
	authorName: null,
	repliedToMessageId: null,
	runtimeSessionId: null,
})

const transcriptOf = (
	conversationId: string,
	messages: TranscriptMessage[],
): TranscriptPage => ({
	conversationId,
	hasMore: false,
	arrivals: [],
	messages,
})

const RELEASE_PAGE = transcriptOf("release", [
	messageOf("older", "user", "An older question"),
	messageOf("ask", "user", "Can you draft the release notes?"),
	messageOf("reply", "assistant", "Here's a first pass."),
	messageOf("typing", "assistant", "Still writ", "streaming"),
])

const SOLO_PAGE = transcriptOf("solo-thread", [
	messageOf("hello", "user", "Morning, Ada"),
])

const deferred = <T>() => {
	let resolve: (value: T) => void = () => undefined
	const promise = new Promise<T>((settle) => {
		resolve = settle
	})
	return { promise, resolve }
}

const readerAnswering = (
	pages: Record<string, () => Promise<TranscriptPage>>,
) => ({
	bots: vi.fn().mockResolvedValue([ADA]),
	spaces: vi.fn().mockResolvedValue([{ id: SPACE }]),
	conversations: vi.fn().mockResolvedValue([RELEASE]),
	conversationSoloStates: vi
		.fn()
		.mockResolvedValue([{ botId: "ada", conversationId: "solo-thread" }]),
	loadPage: vi.fn(
		(conversationId: string) =>
			pages[conversationId]?.() ?? Promise.reject(new Error("no page")),
	),
})

type Heard = (event: { payload: unknown }) => void

const startGhost = async (
	answered: Promise<DragGhostTab | null>,
	reader: GhostCardReader = readerAnswering({}),
) => {
	const heard = new Map<string, Heard>()
	const listen = vi.fn((event: string, handler: Heard) => {
		heard.set(event, handler)
		return Promise.resolve(() => undefined)
	})
	const view = createDragGhostView(
		listen as unknown as Parameters<typeof createDragGhostView>[0],
		() => answered,
	)
	const watching = view.watch()
	render(createElement(DragGhost, { view, reader }), {
		wrapper: createQueryTestWrapper().wrapper,
	})
	await vi.waitFor(() => expect(heard.size).toBe(2))
	const hear = (event: string, payload: unknown) =>
		act(() => heard.get(event)?.({ payload }))
	return {
		watching,
		hearTab: (tab: DragGhostTab) => hear(DRAG_GHOST_TAB_EVENT, tab),
		hearState: (tabId: string, target: DockTarget) =>
			hear(DRAG_GHOST_STATE_EVENT, { tabId, spaceId: SPACE, target }),
	}
}

const mountGhost = async (
	answered: Promise<DragGhostTab | null>,
	reader?: GhostCardReader,
) => {
	const ghost = await startGhost(answered, reader)
	await act(() => ghost.watching)
	return ghost
}

const thumbnail = () =>
	document.querySelector<HTMLElement>("[data-slot=tab-drag-thumbnail]")

const thumbnailState = () => thumbnail()?.getAttribute("data-state")

const releaseReader = () =>
	readerAnswering({ release: () => Promise.resolve(RELEASE_PAGE) })

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => undefined)
	window.innerWidth = 600
	window.innerHeight = 400
})

afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
})

describe("the drag ghost page", () => {
	it("draws nothing while the host holds no tab and none is heard", async () => {
		await mountGhost(Promise.resolve(null))

		expect(thumbnail()).toBeNull()
	})

	it("draws the tab the host answers on load with its agent, its face and its last two settled messages", async () => {
		const reader = releaseReader()

		await mountGhost(Promise.resolve(CONVERSATION_TAB), reader)

		expect(screen.getByText(CONVERSATION_TAB.title)).toBeTruthy()
		expect(
			await screen.findByText("Can you draft the release notes?"),
		).toBeTruthy()
		expect(screen.getByText("Here's a first pass.")).toBeTruthy()
		expect(screen.getByText("Ada")).toBeTruthy()
		expect(screen.getByText("Message Ada")).toBeTruthy()
		expect(screen.queryByText("An older question")).toBeNull()
		expect(screen.queryByText("Still writ")).toBeNull()
		expect(reader.loadPage).toHaveBeenCalledExactlyOnceWith("release", null)
	})

	it("draws the title card while the sources load, then fills it in", async () => {
		const page = deferred<TranscriptPage>()
		const reader = readerAnswering({ release: () => page.promise })

		await mountGhost(Promise.resolve(CONVERSATION_TAB), reader)

		expect(screen.getByText(CONVERSATION_TAB.title)).toBeTruthy()
		expect(screen.queryByText("Here's a first pass.")).toBeNull()
		await act(async () => page.resolve(RELEASE_PAGE))
		expect(await screen.findByText("Here's a first pass.")).toBeTruthy()
	})

	it("keeps the title card when the sources fail", async () => {
		const reader = readerAnswering({
			release: () => Promise.reject(new Error("store lost")),
		})
		reader.conversations.mockRejectedValue(new Error("store lost"))

		await mountGhost(Promise.resolve(CONVERSATION_TAB), reader)
		await vi.waitFor(() => expect(reader.loadPage).toHaveBeenCalled())
		await act(async () => undefined)

		expect(screen.getByText(CONVERSATION_TAB.title)).toBeTruthy()
		expect(screen.getByText("Message")).toBeTruthy()
		expect(screen.queryByText("Here's a first pass.")).toBeNull()
	})

	it("reads the solo thread of an agent tab in the Space the origin names", async () => {
		const reader = readerAnswering({
			"solo-thread": () => Promise.resolve(SOLO_PAGE),
		})
		const { hearTab, hearState } = await mountGhost(
			Promise.resolve(null),
			reader,
		)

		await hearState(BOT_TAB.tabId, "outside")
		await hearTab(BOT_TAB)

		expect(await screen.findByText("Morning, Ada")).toBeTruthy()
		expect(screen.getByText("Ada Lovelace")).toBeTruthy()
		expect(reader.bots).toHaveBeenCalledWith(SPACE)
		expect(reader.conversationSoloStates).toHaveBeenCalledExactlyOnceWith(SPACE)
	})

	it("reads no messages for a mission tab", async () => {
		const reader = readerAnswering({})
		const { hearTab } = await mountGhost(Promise.resolve(null), reader)

		await hearTab(MISSION_TAB)

		expect(await screen.findByText("Ada Lovelace")).toBeTruthy()
		expect(screen.getByText(MISSION_TAB.title)).toBeTruthy()
		expect(reader.loadPage).not.toHaveBeenCalled()
	})

	it("drops the previous tab for the next one, with no late answer from the old tab landing on it", async () => {
		const oldPage = deferred<TranscriptPage>()
		const reader = readerAnswering({
			release: () => oldPage.promise,
			"solo-thread": () => Promise.resolve(SOLO_PAGE),
		})
		const { hearTab, hearState } = await mountGhost(
			Promise.resolve(CONVERSATION_TAB),
			reader,
		)
		await vi.waitFor(() => expect(reader.loadPage).toHaveBeenCalledOnce())

		await hearState(BOT_TAB.tabId, "outside")
		await hearTab(BOT_TAB)
		await act(async () => oldPage.resolve(RELEASE_PAGE))

		expect(await screen.findByText("Morning, Ada")).toBeTruthy()
		expect(screen.getByText(BOT_TAB.title)).toBeTruthy()
		expect(screen.queryByText(CONVERSATION_TAB.title)).toBeNull()
		expect(screen.queryByText("Here's a first pass.")).toBeNull()
	})

	it("reads the messages again when the same tab is shown for a new drag", async () => {
		const reader = releaseReader()
		const { hearTab } = await mountGhost(
			Promise.resolve(CONVERSATION_TAB),
			reader,
		)
		await screen.findByText("Here's a first pass.")

		await hearTab(CONVERSATION_TAB)

		await vi.waitFor(() => expect(reader.loadPage).toHaveBeenCalledTimes(2))
		expect(screen.getByText("Here's a first pass.")).toBeTruthy()
	})

	it("keeps the heard tab over a late host answer", async () => {
		const answered = deferred<DragGhostTab | null>()
		const { hearTab, watching } = await startGhost(answered.promise)

		await hearTab(BOT_TAB)
		answered.resolve(CONVERSATION_TAB)
		await act(() => watching)

		expect(screen.getByText(BOT_TAB.title)).toBeTruthy()
		expect(screen.queryByText(CONVERSATION_TAB.title)).toBeNull()
	})

	it("draws a payload carrying a thumbnail rather than an empty page", async () => {
		const { hearTab } = await mountGhost(Promise.resolve(null))

		await hearTab({
			...CONVERSATION_TAB,
			thumbnail: "data:image/png;base64,iVBORw0KGgo=",
		})

		expect(screen.getByText(CONVERSATION_TAB.title)).toBeTruthy()
	})

	it("still listens and draws heard tabs when the host answer fails", async () => {
		const { hearTab } = await mountGhost(Promise.reject(new Error("gone")))

		await hearTab(CONVERSATION_TAB)

		expect(console.error).toHaveBeenCalled()
		expect(screen.getByText(CONVERSATION_TAB.title)).toBeTruthy()
	})

	it("draws nothing over a window of the same Space, and the card again once the pointer leaves", async () => {
		const { hearState } = await mountGhost(
			Promise.resolve(CONVERSATION_TAB),
			releaseReader(),
		)
		await screen.findByText("Here's a first pass.")

		await hearState(CONVERSATION_TAB.tabId, "sameSpace")
		expect(thumbnail()).toBeNull()

		await hearState(CONVERSATION_TAB.tabId, "outside")
		expect(screen.getByText("Here's a first pass.")).toBeTruthy()
	})

	it("shows the not-allowed state over a window of another Space, and clears it", async () => {
		const { hearState } = await mountGhost(Promise.resolve(CONVERSATION_TAB))

		await hearState(CONVERSATION_TAB.tabId, "otherSpace")
		expect(thumbnailState()).toBe("not-allowed")

		await hearState(CONVERSATION_TAB.tabId, "outside")
		expect(thumbnailState()).toBe("allowed")
	})

	it("ignores a state heard for another tab", async () => {
		const { hearState } = await mountGhost(Promise.resolve(CONVERSATION_TAB))

		await hearState(BOT_TAB.tabId, "sameSpace")

		expect(thumbnailState()).toBe("allowed")
	})

	it("reads nothing from localStorage and listens to no storage event", async () => {
		const addListener = vi.spyOn(window, "addEventListener")
		const getItem = vi.spyOn(Storage.prototype, "getItem")

		await mountGhost(Promise.resolve(CONVERSATION_TAB))

		expect(addListener.mock.calls.map(([event]) => event)).not.toContain(
			"storage",
		)
		expect(getItem).not.toHaveBeenCalled()
	})

	it("draws the card at the ghost window size", async () => {
		await mountGhost(Promise.resolve(CONVERSATION_TAB))

		expect(thumbnail()?.style.width).toBe("600px")
		expect(thumbnail()?.style.height).toBe("400px")
	})
})
