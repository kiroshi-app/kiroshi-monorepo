// @vitest-environment happy-dom

import {
	createRootRoute,
	createRoute,
	createRouter,
} from "@tanstack/react-router"
import { act, cleanup, fireEvent, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useTabKeys } from "./use-tab-keys"
import { useTabsFollowingSpace } from "./use-tab-thread-sync"
import { useWorkspaceTabs } from "./use-workspace-tabs"
import { createWorkspaceTabs, type WorkspaceTabs } from "./workspace-tabs"

import type { ObservedState } from "../conversations/store-contract"
import { validateThreadSearch } from "../navigation/thread-search"

const SPACE = "space-home"

const OTHER_SPACE = "space-away"

const USER_SETTINGS = "/settings/user"

const routerOn = (tabs: WorkspaceTabs) => {
	const root = createRootRoute()
	const list = createRoute({
		getParentRoute: () => root,
		path: "/",
		validateSearch: validateThreadSearch,
	})
	const userSettings = createRoute({
		getParentRoute: () => root,
		path: USER_SETTINGS,
	})
	return createRouter({
		routeTree: root.addChildren([list, userSettings]),
		history: tabs.history,
	})
}

const tabsOfSpace = (spaceId = SPACE) => {
	const tabs = createWorkspaceTabs()
	tabs.showSpace(spaceId)
	renderHook(() => useTabKeys(tabs))
	return tabs
}

const shownHrefs = (tabs: WorkspaceTabs) =>
	viewOf(tabs).tabs.map((tab) => tab.href)

const viewOf = (tabs: WorkspaceTabs, hostStates = {}, soloThreads = {}) =>
	renderHook(() =>
		useWorkspaceTabs({ tabs, hostStates, soloThreads, spaceId: SPACE }),
	).result.current

const activeHref = (tabs: WorkspaceTabs) => tabs.history.location.href

const pressMod = (key: string) =>
	act(() => {
		fireEvent.keyDown(window, { key, metaKey: true })
	})

const threadOf = (row: string) => `/?conversation=${row}`

const companionOf = (row: string) => `/?bot=${row}`

const missionOf = (missionId: string) => `/?bot=nova&mission=${missionId}`

const UNKNOWN = { kind: "unknownMission", id: "unknown" }

const OF_ANOTHER_SPACE = {
	kind: "missionOfAnotherSpace",
	id: "elsewhere",
	spaceId: OTHER_SPACE,
}

const UNAVAILABLE = { kind: "unavailable", failure: "storage locked" }

const missionReadOf = (missionId: string, failures: Record<string, unknown>) =>
	missionId in failures
		? Promise.reject(failures[missionId])
		: Promise.resolve({ id: missionId })

const NEEDS_YOU: ObservedState = {
	state: "needs_you",
	pendingPrompt: null,
	workingBotIds: [],
}

afterEach(() => {
	cleanup()
	localStorage.clear()
	vi.restoreAllMocks()
})

describe("a Space without stored tabs", () => {
	it("holds one active tab on the empty list", () => {
		const tabs = tabsOfSpace()

		const view = viewOf(tabs)

		expect(view.tabs).toHaveLength(1)
		expect(view.activeId).toBe(view.tabs[0]?.id)
		expect(activeHref(tabs)).toBe("/")
	})
})

describe("the tab keys", () => {
	it("opens an empty-list tab right after the active one on Mod+T", () => {
		const tabs = tabsOfSpace()
		tabs.openInNewTab(threadOf("first"))
		tabs.openInNewTab(threadOf("last"))
		tabs.select(viewOf(tabs).tabs[1]?.id ?? "")

		pressMod("t")

		expect(shownHrefs(tabs)).toEqual([
			"/",
			threadOf("first"),
			"/",
			threadOf("last"),
		])
		expect(viewOf(tabs).activeId).toBe(viewOf(tabs).tabs[2]?.id)
	})

	it("closes the active tab on Mod+W and activates its neighbour", () => {
		const tabs = tabsOfSpace()
		tabs.openInNewTab(threadOf("first"))
		tabs.openInNewTab(threadOf("second"))
		tabs.select(viewOf(tabs).tabs[1]?.id ?? "")

		pressMod("w")

		expect(shownHrefs(tabs)).toEqual(["/", threadOf("second")])
		expect(activeHref(tabs)).toBe(threadOf("second"))
	})

	it("keeps a pinned tab open on Mod+W", () => {
		const tabs = tabsOfSpace()
		tabs.openInNewTab(threadOf("kept"))
		tabs.pin(viewOf(tabs).activeId)

		pressMod("w")

		expect(shownHrefs(tabs)).toEqual([threadOf("kept"), "/"])
		expect(activeHref(tabs)).toBe(threadOf("kept"))
	})

	it("opens an empty-list tab in place of the last tab closed", () => {
		const tabs = tabsOfSpace()
		tabs.history.push(threadOf("only"))
		const closedId = viewOf(tabs).activeId

		pressMod("w")

		const view = viewOf(tabs)
		expect(shownHrefs(tabs)).toEqual(["/"])
		expect(view.activeId).not.toBe(closedId)
	})

	it("leaves Mod+1 to Mod+9 to the Space switching", () => {
		const tabs = tabsOfSpace()
		const before = viewOf(tabs)
		const event = new KeyboardEvent("keydown", {
			key: "1",
			metaKey: true,
			cancelable: true,
		})

		act(() => {
			window.dispatchEvent(event)
		})

		expect(event.defaultPrevented).toBe(false)
		expect(viewOf(tabs)).toEqual(before)
	})
})

describe("a tab opened in the background", () => {
	it("lands right after the active tab and keeps the active tab shown", () => {
		const tabs = tabsOfSpace()
		tabs.openInNewTab(threadOf("first"))
		tabs.openInNewTab(threadOf("last"))
		tabs.select(viewOf(tabs).tabs[1]?.id ?? "")

		tabs.openInBackgroundTab(threadOf("behind"))

		expect(shownHrefs(tabs)).toEqual([
			"/",
			threadOf("first"),
			threadOf("behind"),
			threadOf("last"),
		])
		expect(activeHref(tabs)).toBe(threadOf("first"))
	})

	it("leaves the tabs as they are when a tab already shows the page", () => {
		const tabs = tabsOfSpace()
		tabs.openInNewTab(threadOf("shown"))
		tabs.openInNewTab(companionOf("other"))
		const before = viewOf(tabs)

		tabs.openInBackgroundTab(threadOf("shown"))

		expect(viewOf(tabs)).toEqual(before)
	})
})

describe("a page already shown", () => {
	it("selects the tab showing it instead of opening a second one", () => {
		const tabs = tabsOfSpace()
		tabs.openInNewTab(threadOf("shown"))
		const shownId = viewOf(tabs).activeId
		tabs.openInNewTab(companionOf("other"))

		tabs.openInNewTab(threadOf("shown"))

		expect(viewOf(tabs).tabs).toHaveLength(3)
		expect(viewOf(tabs).activeId).toBe(shownId)
	})

	it("selects the tab showing it when the active tab navigates there", async () => {
		const tabs = tabsOfSpace()
		const router = routerOn(tabs)
		await router.load()
		await router.navigate({ to: USER_SETTINGS })
		const settingsId = viewOf(tabs).activeId
		pressMod("t")
		await router.load()

		await router.navigate({ to: USER_SETTINGS })

		expect(viewOf(tabs).tabs).toHaveLength(2)
		expect(viewOf(tabs).activeId).toBe(settingsId)
	})
})

describe("the history of a tab", () => {
	it("moves Back and Forward inside the active tab only", async () => {
		const tabs = tabsOfSpace()
		const router = routerOn(tabs)
		await router.load()
		await router.navigate({ to: USER_SETTINGS })
		const firstId = viewOf(tabs).activeId
		pressMod("t")
		await router.navigate({ to: "/", search: { bot: "nova" } })

		router.history.back()
		expect(activeHref(tabs)).toBe("/")
		expect(router.history.canGoBack()).toBe(false)
		router.history.back()
		expect(activeHref(tabs)).toBe("/")

		act(() => tabs.select(firstId))
		await router.load()
		expect(router.state.location.pathname).toBe(USER_SETTINGS)
		router.history.back()
		expect(activeHref(tabs)).toBe("/")
		router.history.forward()
		expect(activeHref(tabs)).toBe(USER_SETTINGS)
		router.history.forward()
		expect(activeHref(tabs)).toBe(USER_SETTINGS)
	})
})

describe("the tab actions", () => {
	it("orders pinned tabs before unpinned ones whatever the reorder", () => {
		const tabs = tabsOfSpace()
		tabs.openInNewTab(threadOf("one"))
		tabs.openInNewTab(threadOf("two"))
		const [list, one, two] = viewOf(tabs).tabs.map((tab) => tab.id)
		tabs.pin(two ?? "")

		tabs.reorder([one ?? "", list ?? "", two ?? ""])

		expect(shownHrefs(tabs)).toEqual([threadOf("two"), threadOf("one"), "/"])
		tabs.unpin(two ?? "")
		expect(viewOf(tabs).tabs.every((tab) => !tab.isPinned)).toBe(true)
	})

	it("closes the others and keeps the pinned ones", () => {
		const tabs = tabsOfSpace()
		tabs.openInNewTab(threadOf("pinned"))
		tabs.pin(viewOf(tabs).activeId)
		tabs.openInNewTab(threadOf("closed"))
		tabs.openInNewTab(threadOf("kept"))

		tabs.closeOthers(viewOf(tabs).activeId)

		expect(shownHrefs(tabs)).toEqual([threadOf("pinned"), threadOf("kept")])
		expect(activeHref(tabs)).toBe(threadOf("kept"))
	})
})

describe("the tabs of a Space", () => {
	it("keeps the tabs of the Space left and shows the ones of the Space reached", () => {
		const tabs = tabsOfSpace()
		tabs.openInNewTab(threadOf("home"))

		tabs.showSpace(OTHER_SPACE)
		expect(shownHrefs(tabs)).toEqual(["/"])

		tabs.showSpace(SPACE)
		expect(shownHrefs(tabs)).toEqual(["/", threadOf("home")])
		expect(activeHref(tabs)).toBe(threadOf("home"))
	})

	it("restores the open tabs, their order, the pinned ones and the active one after a reload", () => {
		const before = tabsOfSpace()
		before.openInNewTab(threadOf("pinned"))
		before.pin(viewOf(before).activeId)
		before.openInNewTab(companionOf("nova"))
		before.openInNewTab(USER_SETTINGS)
		before.select(viewOf(before).tabs[1]?.id ?? "")
		cleanup()

		const after = tabsOfSpace()

		expect(
			viewOf(after).tabs.map(({ href, isPinned }) => ({ href, isPinned })),
		).toEqual([
			{ href: threadOf("pinned"), isPinned: true },
			{ href: companionOf("nova"), isPinned: false },
			{ href: USER_SETTINGS, isPinned: false },
			{ href: "/", isPinned: false },
		])
		expect(activeHref(after)).toBe(companionOf("nova"))
	})

	it("drops a restored tab whose conversation, companion or settings target is absent", async () => {
		const before = tabsOfSpace()
		before.openInNewTab(threadOf("gone"))
		before.openInNewTab("/settings/companion/vanished")
		before.openInNewTab(companionOf("nova"))
		cleanup()
		const after = tabsOfSpace()

		await after.dropAbsentRestored(SPACE, {
			isRowPresent: (id) => id === "nova",
			readMission: async () => ({}),
		})

		expect(shownHrefs(after)).toEqual(["/", companionOf("nova")])
	})

	it("drops a restored mission tab whose mission is unknown and activates its neighbour", async () => {
		const before = tabsOfSpace()
		before.openInNewTab(missionOf("present"))
		before.openInNewTab(missionOf("unknown"))
		cleanup()
		const after = tabsOfSpace()

		await after.dropAbsentRestored(SPACE, {
			isRowPresent: () => true,
			readMission: (missionId) =>
				missionReadOf(missionId, { unknown: UNKNOWN }),
		})

		expect(shownHrefs(after)).toEqual(["/", missionOf("present")])
		expect(activeHref(after)).toBe(missionOf("present"))
	})

	it("drops a mission of another Space and keeps the one its side could not read", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
		const before = tabsOfSpace()
		before.openInNewTab(missionOf("elsewhere"))
		before.openInNewTab(missionOf("unreadable"))
		cleanup()
		const after = tabsOfSpace()

		await after.dropAbsentRestored(SPACE, {
			isRowPresent: () => true,
			readMission: (missionId) =>
				missionReadOf(missionId, {
					elsewhere: OF_ANOTHER_SPACE,
					unreadable: UNAVAILABLE,
				}),
		})

		expect(shownHrefs(after)).toEqual(["/", missionOf("unreadable")])
		expect(warn).toHaveBeenCalledOnce()
	})
})

describe("the Needs you flag", () => {
	it("flags the tabs showing a conversation or companion whose row needs you", () => {
		const tabs = tabsOfSpace()
		tabs.openInNewTab(threadOf("asking"))
		tabs.openInNewTab(threadOf("quiet"))
		tabs.openInNewTab(companionOf("nova"))

		const view = viewOf(
			tabs,
			{ asking: NEEDS_YOU, "nova-solo": NEEDS_YOU },
			{ "nova-solo": { spaceId: SPACE, botId: "nova" } },
		)

		expect(
			Object.fromEntries(view.tabs.map((tab) => [tab.href, tab.needsYou])),
		).toEqual({
			"/": false,
			[threadOf("asking")]: true,
			[threadOf("quiet")]: false,
			[companionOf("nova")]: true,
		})
	})
})

type ShownSettings = {
	tabs: WorkspaceTabs
	settingsId: string
	otherId: string
}

const tabsShowingSettings = (): ShownSettings => {
	const tabs = tabsOfSpace()
	tabs.openInNewTab(threadOf("other"))
	tabs.openInNewTab(threadOf("earlier"))
	tabs.history.push(USER_SETTINGS)
	const [, otherId = "", settingsId = ""] = viewOf(tabs).tabs.map(
		(tab) => tab.id,
	)
	return { tabs, settingsId, otherId }
}

const cancellingGuard = () => vi.fn<(leave: () => void) => void>()

const proceedingGuard = () =>
	vi.fn<(leave: () => void) => void>((leave) => leave())

type Gesture = (shown: ShownSettings) => void

const LEAVING_GESTURES: [string, Gesture][] = [
	["closing the active tab", ({ tabs, settingsId }) => tabs.close(settingsId)],
	["closeActive", ({ tabs }) => tabs.closeActive()],
	[
		"Close other tabs from an inactive tab",
		({ tabs, otherId }) => tabs.closeOthers(otherId),
	],
	["selecting another tab", ({ tabs, otherId }) => tabs.select(otherId)],
	["opening a new tab", ({ tabs }) => tabs.openEmptyTab()],
	["going back", ({ tabs }) => tabs.back()],
	["switching Space", ({ tabs }) => tabs.showSpace(OTHER_SPACE)],
]

const STAYING_GESTURES: [string, Gesture][] = [
	["pinning", ({ tabs, settingsId }) => tabs.pin(settingsId)],
	["unpinning", ({ tabs, settingsId }) => tabs.unpin(settingsId)],
	["closing an inactive tab", ({ tabs, otherId }) => tabs.close(otherId)],
	[
		"Close other tabs on the active tab",
		({ tabs, settingsId }) => tabs.closeOthers(settingsId),
	],
]

describe("the leave guard", () => {
	it.each(LEAVING_GESTURES)(
		"holds %s while the guard cancels",
		(_, gesture) => {
			const shown = tabsShowingSettings()
			const guard = cancellingGuard()
			shown.tabs.guardLeave(guard)
			const before = shown.tabs.getState()

			gesture(shown)

			expect(guard).toHaveBeenCalledOnce()
			expect(shown.tabs.getState()).toBe(before)
			expect(activeHref(shown.tabs)).toBe(USER_SETTINGS)
		},
	)

	it.each(LEAVING_GESTURES)(
		"completes %s once the guard proceeds",
		(_, gesture) => {
			const shown = tabsShowingSettings()
			const guard = proceedingGuard()
			shown.tabs.guardLeave(guard)

			gesture(shown)

			expect(guard).toHaveBeenCalledOnce()
			expect(activeHref(shown.tabs)).not.toBe(USER_SETTINGS)
		},
	)

	it.each(STAYING_GESTURES)("acts on %s without asking", (_, gesture) => {
		const shown = tabsShowingSettings()
		const guard = cancellingGuard()
		shown.tabs.guardLeave(guard)
		const before = shown.tabs.getState()

		gesture(shown)

		expect(guard).not.toHaveBeenCalled()
		expect(shown.tabs.getState()).not.toBe(before)
		expect(activeHref(shown.tabs)).toBe(USER_SETTINGS)
	})

	it("acts at once once the guard is released", () => {
		const shown = tabsShowingSettings()
		const guard = cancellingGuard()
		const release = shown.tabs.guardLeave(guard)

		release()
		shown.tabs.closeActive()

		expect(guard).not.toHaveBeenCalled()
		expect(activeHref(shown.tabs)).not.toBe(USER_SETTINGS)
	})

	it("follows the open Space without asking, even under a cancelling guard", () => {
		const shown = tabsShowingSettings()
		const guard = cancellingGuard()
		shown.tabs.guardLeave(guard)

		renderHook(() => useTabsFollowingSpace(shown.tabs, OTHER_SPACE))

		expect(guard).not.toHaveBeenCalled()
		expect(shown.tabs.getState().spaceId).toBe(OTHER_SPACE)
		expect(activeHref(shown.tabs)).toBe("/")
	})

	it("does not ask again for a gesture already asked", () => {
		const shown = tabsShowingSettings()
		const guard = cancellingGuard()
		shown.tabs.guardLeave(guard)

		shown.tabs.leaveAsked(() => shown.tabs.select(shown.otherId))

		expect(guard).not.toHaveBeenCalled()
		expect(activeHref(shown.tabs)).toBe(threadOf("other"))
	})
})
