// @vitest-environment happy-dom

import { act, cleanup, render, screen } from "@testing-library/react"
import { createElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import "@workspace/ui/lib/i18n"

import { type DockTarget, DRAG_GHOST_STATE_EVENT } from "./drag-ghost-state"
import { createDragGhostView } from "./drag-ghost-view"

import { DRAG_GHOST_TAB_EVENT, type DragGhostTab } from "../bindings"
import { DragGhost } from "@/components/drag-ghost"

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

const deferred = <T>() => {
	let resolve: (value: T) => void = () => undefined
	const promise = new Promise<T>((settle) => {
		resolve = settle
	})
	return { promise, resolve }
}

type Heard = (event: { payload: unknown }) => void

const startGhost = async (answered: Promise<DragGhostTab | null>) => {
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
	render(createElement(DragGhost, { view }))
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

const mountGhost = async (answered: Promise<DragGhostTab | null>) => {
	const ghost = await startGhost(answered)
	await act(() => ghost.watching)
	return ghost
}

const chip = () =>
	document.querySelector<HTMLElement>("[data-slot=title-bar-tab-chip]")

const chipState = () => chip()?.getAttribute("data-state")

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
