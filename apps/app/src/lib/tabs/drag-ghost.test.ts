// @vitest-environment happy-dom

import { act, cleanup, render, screen } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import "@workspace/ui/lib/i18n"

import { type DockTarget, DRAG_GHOST_STATE_EVENT } from "./drag-ghost-state"
import { createDragGhostView } from "./drag-ghost-view"
import { type TabFaceSources, tabFaceOf } from "./tab-faces"
import type { GhostIconReader } from "./use-ghost-icon"

import { DRAG_GHOST_TAB_EVENT, type DragGhostTab } from "../bindings"
import { DragGhost } from "@/components/drag-ghost"
import { toBotRows } from "../conversations/roster-conversations"
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

const LIST_TAB: DragGhostTab = {
	tabId: "list",
	href: "/",
	title: "New tab",
}

const ADA = {
	id: "ada",
	name: "Ada Lovelace",
	avatarBlot: null,
	avatarImagePath: null,
} as unknown as Bot

const RELEASE = {
	id: "release",
	spaceId: SPACE,
	title: "Release notes",
	icon: "Rocket",
	color: null,
	participants: [],
} as unknown as Conversation

const ORIGIN_STRIP_SOURCES: TabFaceSources = {
	bots: toBotRows([ADA]),
	conversations: [{ id: "release", name: "Release notes", icon: "Rocket" }],
	missionTitles: {},
}

const NO_SOURCES: TabFaceSources = {
	bots: [],
	conversations: [],
	missionTitles: {},
}

const readerAnswering = (): GhostIconReader => ({
	bots: vi.fn().mockResolvedValue([ADA]),
	conversations: vi.fn().mockResolvedValue([RELEASE]),
})

const failingReader = (): GhostIconReader => ({
	bots: vi.fn().mockRejectedValue(new Error("store lost")),
	conversations: vi.fn().mockRejectedValue(new Error("store lost")),
})

const deferred = <T>() => {
	let resolve: (value: T) => void = () => undefined
	const promise = new Promise<T>((settle) => {
		resolve = settle
	})
	return { promise, resolve }
}

type Heard = (event: { payload: unknown }) => void

const startGhost = async (
	answered: Promise<DragGhostTab | null>,
	reader: GhostIconReader = readerAnswering(),
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
	reader?: GhostIconReader,
) => {
	const ghost = await startGhost(answered, reader)
	await act(() => ghost.watching)
	return ghost
}

const chip = () =>
	document.querySelector<HTMLElement>("[data-slot=title-bar-tab-chip]")

const chipState = () => chip()?.getAttribute("data-state")

const withoutReactIds = (markup: string | undefined) =>
	markup?.replace(/_r_\w+?_/g, "_r_")

const chipIcon = () => withoutReactIds(chip()?.firstElementChild?.innerHTML)

const markupOf = (icon: ReactNode) =>
	withoutReactIds(
		render(icon, { container: document.createElement("span") }).container
			.innerHTML,
	)

const stripIconOf = (tab: DragGhostTab) =>
	markupOf(tabFaceOf(tab.href, ORIGIN_STRIP_SOURCES).icon)

const genericIconOf = (tab: DragGhostTab) =>
	markupOf(tabFaceOf(tab.href, NO_SOURCES).icon)

const draggedInSpace = async (tab: DragGhostTab, reader: GhostIconReader) => {
	const ghost = await mountGhost(Promise.resolve(null), reader)
	await ghost.hearState(tab.tabId, "outside")
	await ghost.hearTab(tab)
	return ghost
}

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
})

describe("the drag ghost page", () => {
	it("draws nothing while the host holds no tab and none is heard", async () => {
		await mountGhost(Promise.resolve(null))

		expect(chip()).toBeNull()
	})

	it("draws the lifted chip alone of the tab the host answers on load, with no thumbnail", async () => {
		await mountGhost(Promise.resolve(CONVERSATION_TAB))

		expect(chip()?.getAttribute("data-placement")).toBe("alone")
		expect(screen.getByText(CONVERSATION_TAB.title)).toBeTruthy()
		expect(document.querySelector("[data-slot=tab-drag-thumbnail]")).toBeNull()
	})

	it("draws an agent tab with the avatar the origin strip draws, read from the bots of its Space", async () => {
		const reader = readerAnswering()

		await draggedInSpace(BOT_TAB, reader)

		await vi.waitFor(() => expect(chipIcon()).toBe(stripIconOf(BOT_TAB)))
		expect(chipIcon()).not.toBe(genericIconOf(BOT_TAB))
		expect(reader.bots).toHaveBeenCalledExactlyOnceWith(SPACE)
		expect(reader.conversations).not.toHaveBeenCalled()
	})

	it("draws a conversation tab with the glyph the origin strip draws, read from the conversations of its Space", async () => {
		const reader = readerAnswering()

		await draggedInSpace(CONVERSATION_TAB, reader)

		await vi.waitFor(() =>
			expect(chipIcon()).toBe(stripIconOf(CONVERSATION_TAB)),
		)
		expect(chipIcon()).not.toBe(genericIconOf(CONVERSATION_TAB))
		expect(reader.conversations).toHaveBeenCalledExactlyOnceWith(SPACE)
		expect(reader.bots).not.toHaveBeenCalled()
	})

	it("draws a list page tab with the icon the origin strip draws, reading nothing", async () => {
		const reader = readerAnswering()

		await draggedInSpace(LIST_TAB, reader)

		expect(chipIcon()).toBe(stripIconOf(LIST_TAB))
		expect(reader.bots).not.toHaveBeenCalled()
		expect(reader.conversations).not.toHaveBeenCalled()
	})

	it("keeps the generic icon and the title when the lists fail to load", async () => {
		const reader = failingReader()

		await draggedInSpace(BOT_TAB, reader)
		await vi.waitFor(() => expect(reader.bots).toHaveBeenCalled())
		await act(async () => undefined)

		expect(chipIcon()).toBe(genericIconOf(BOT_TAB))
		expect(screen.getByText(BOT_TAB.title)).toBeTruthy()
	})

	it("reads the lists again when the same tab is shown for a new drag", async () => {
		const reader = readerAnswering()
		const { hearTab } = await draggedInSpace(BOT_TAB, reader)
		await vi.waitFor(() => expect(reader.bots).toHaveBeenCalledOnce())

		await hearTab(BOT_TAB)

		await vi.waitFor(() => expect(reader.bots).toHaveBeenCalledTimes(2))
	})

	it("drops the previous tab for the next one", async () => {
		const { hearTab } = await mountGhost(Promise.resolve(CONVERSATION_TAB))

		await hearTab(BOT_TAB)

		expect(screen.getByText(BOT_TAB.title)).toBeTruthy()
		expect(screen.queryByText(CONVERSATION_TAB.title)).toBeNull()
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

	it("still listens and draws heard tabs when the host answer fails", async () => {
		const { hearTab } = await mountGhost(Promise.reject(new Error("gone")))

		await hearTab(CONVERSATION_TAB)

		expect(console.error).toHaveBeenCalled()
		expect(screen.getByText(CONVERSATION_TAB.title)).toBeTruthy()
	})

	it("draws nothing over a window of the same Space, and the chip again once the pointer leaves", async () => {
		const { hearState } = await mountGhost(Promise.resolve(CONVERSATION_TAB))

		await hearState(CONVERSATION_TAB.tabId, "sameSpace")
		expect(chip()).toBeNull()

		await hearState(CONVERSATION_TAB.tabId, "outside")
		expect(screen.getByText(CONVERSATION_TAB.title)).toBeTruthy()
	})

	it("draws the chip not allowed over a window of another Space, and clears it", async () => {
		const { hearState } = await mountGhost(Promise.resolve(CONVERSATION_TAB))

		await hearState(CONVERSATION_TAB.tabId, "otherSpace")
		expect(chipState()).toBe("not-allowed")

		await hearState(CONVERSATION_TAB.tabId, "outside")
		expect(chipState()).toBe("allowed")
	})

	it("ignores a state heard for another tab", async () => {
		const { hearState } = await mountGhost(Promise.resolve(CONVERSATION_TAB))

		await hearState(BOT_TAB.tabId, "sameSpace")

		expect(chipState()).toBe("allowed")
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
})
