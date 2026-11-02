// @vitest-environment happy-dom

import { act, cleanup, render, screen } from "@testing-library/react"
import { createElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import "@workspace/ui/lib/i18n"

import { DRAG_GHOST_STATE_EVENT } from "./drag-ghost-state"
import { createDragGhostView } from "./drag-ghost-view"

import { DRAG_GHOST_TAB_EVENT, type DragGhostTab } from "../bindings"
import { DragGhost } from "@/components/drag-ghost"

const TAB: DragGhostTab = {
	tabId: "torn",
	href: "/?conversation=release",
	title: "Release notes for 2.4",
}

const OTHER_TAB: DragGhostTab = {
	tabId: "other",
	href: "/?conversation=roadmap",
	title: "Roadmap",
}

type Heard = (event: { payload: unknown }) => void

const mountGhost = async (answered: Promise<DragGhostTab | null>) => {
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
	await act(() => watching)
	const hear = (event: string, payload: unknown) =>
		act(() => heard.get(event)?.({ payload }))
	return {
		hearTab: (tab: DragGhostTab) => hear(DRAG_GHOST_TAB_EVENT, tab),
		hearState: (tabId: string, isNotAllowed: boolean) =>
			hear(DRAG_GHOST_STATE_EVENT, { tabId, isNotAllowed }),
	}
}

const thumbnailState = () =>
	document
		.querySelector("[data-slot=tab-drag-thumbnail]")
		?.getAttribute("data-state")

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

		expect(document.querySelector("[data-slot=tab-drag-thumbnail]")).toBeNull()
	})

	it("draws the tab the host answers on load as its title card", async () => {
		await mountGhost(Promise.resolve(TAB))

		expect(screen.getByText(TAB.title)).toBeTruthy()
		expect(thumbnailState()).toBe("allowed")
	})

	it("draws every tab it then hears, from that payload alone", async () => {
		const { hearTab } = await mountGhost(Promise.resolve(TAB))

		await hearTab(OTHER_TAB)

		expect(screen.getByText(OTHER_TAB.title)).toBeTruthy()
		expect(screen.queryByText(TAB.title)).toBeNull()
	})

	it("keeps the heard tab over a late host answer", async () => {
		let answer: (tab: DragGhostTab) => void = () => undefined
		const answered = new Promise<DragGhostTab | null>((resolve) => {
			answer = resolve
		})
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
		await vi.waitFor(() => expect(heard.has(DRAG_GHOST_TAB_EVENT)).toBe(true))
		await act(() => heard.get(DRAG_GHOST_TAB_EVENT)?.({ payload: OTHER_TAB }))
		answer(TAB)
		await act(() => watching)

		expect(screen.getByText(OTHER_TAB.title)).toBeTruthy()
		expect(screen.queryByText(TAB.title)).toBeNull()
	})

	it("draws a payload carrying a thumbnail rather than an empty page", async () => {
		const { hearTab } = await mountGhost(Promise.resolve(null))

		await hearTab({ ...TAB, thumbnail: "data:image/png;base64,iVBORw0KGgo=" })

		expect(screen.getByText(TAB.title)).toBeTruthy()
	})

	it("still listens and draws heard tabs when the host answer fails", async () => {
		const { hearTab } = await mountGhost(Promise.reject(new Error("gone")))

		await hearTab(TAB)

		expect(console.error).toHaveBeenCalled()
		expect(screen.getByText(TAB.title)).toBeTruthy()
	})

	it("shows the not-allowed state it hears for its tab, and clears it", async () => {
		const { hearState } = await mountGhost(Promise.resolve(TAB))

		await hearState(TAB.tabId, true)
		expect(thumbnailState()).toBe("not-allowed")

		await hearState(TAB.tabId, false)
		expect(thumbnailState()).toBe("allowed")
	})

	it("ignores a not-allowed state heard for another tab", async () => {
		const { hearState } = await mountGhost(Promise.resolve(TAB))

		await hearState(OTHER_TAB.tabId, true)

		expect(thumbnailState()).toBe("allowed")
	})

	it("keeps the not-allowed state when its tab is shown again, and drops it for a new tab", async () => {
		const { hearTab, hearState } = await mountGhost(Promise.resolve(TAB))

		await hearState(TAB.tabId, true)
		await hearTab(TAB)
		expect(thumbnailState()).toBe("not-allowed")

		await hearTab(OTHER_TAB)
		expect(thumbnailState()).toBe("allowed")
	})

	it("reads nothing from localStorage and listens to no storage event", async () => {
		const addListener = vi.spyOn(window, "addEventListener")
		const getItem = vi.spyOn(Storage.prototype, "getItem")

		await mountGhost(Promise.resolve(TAB))

		expect(addListener.mock.calls.map(([event]) => event)).not.toContain(
			"storage",
		)
		expect(getItem).not.toHaveBeenCalled()
	})

	it("draws the card at the ghost window size", async () => {
		await mountGhost(Promise.resolve(TAB))

		const card = document.querySelector<HTMLElement>(
			"[data-slot=tab-drag-thumbnail]",
		)
		expect(card?.style.width).toBe("600px")
		expect(card?.style.height).toBe("400px")
	})
})
