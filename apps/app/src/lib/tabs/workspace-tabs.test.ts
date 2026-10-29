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
import {
	createWorkspaceTabs,
	forgetWindowWhenClosed,
	reopenSecondaryWindows,
	shownTabsOf,
	type WorkspaceTabs,
} from "./workspace-tabs"

import type { FileMenuAction } from "../bindings"
import type { ObservedState } from "../conversations/store-contract"
import { validateThreadSearch } from "../navigation/thread-search"

const commandKey = vi.hoisted(() => ({ isUsed: true }))

const fileMenu = vi.hoisted(() => ({
	isCarried: false,
	choose: undefined as ((action: FileMenuAction) => void) | undefined,
	unwatch: vi.fn(),
}))

const windowHost = vi.hoisted(() => ({
	windowOpen: vi.fn(),
	closeWindow: vi.fn(),
	watchCloseRequest: vi.fn(),
	liveWindowLabels: vi.fn(),
	raiseReportedFailure: vi.fn(),
}))

vi.mock("../host", async (importOriginal) => ({
	...(await importOriginal<typeof import("../host")>()),
	usesCommandKey: () => commandKey.isUsed,
	carriesNativeMenu: () => fileMenu.isCarried,
	watchFileMenu: (act: (action: FileMenuAction) => void) => {
		fileMenu.choose = act
		return Promise.resolve(fileMenu.unwatch)
	},
	closeWindow: windowHost.closeWindow,
	watchCloseRequest: windowHost.watchCloseRequest,
	liveWindowLabels: windowHost.liveWindowLabels,
}))

vi.mock("../bindings", async (importOriginal) => {
	const bindings = await importOriginal<typeof import("../bindings")>()
	return {
		...bindings,
		commands: { ...bindings.commands, windowOpen: windowHost.windowOpen },
	}
})

vi.mock("../failure-report", async (importOriginal) => ({
	...(await importOriginal<typeof import("../failure-report")>()),
	raiseReportedFailure: windowHost.raiseReportedFailure,
}))

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

const showInNewTab = (tabs: WorkspaceTabs, href: string) => {
	tabs.openEmptyTab()
	tabs.history.push(href)
}

const idsOf = (tabs: WorkspaceTabs) => viewOf(tabs).tabs.map((tab) => tab.id)

const pressMod = (key: string) =>
	act(() => {
		fireEvent.keyDown(window, { key, metaKey: true })
	})

const press = (init: KeyboardEventInit) =>
	act(() => {
		fireEvent.keyDown(window, init)
	})

const REOPEN_ON_MAC = { key: "T", metaKey: true, shiftKey: true }

const CLOSE_OTHERS_ON_MAC = {
	key: "∑",
	code: "KeyW",
	metaKey: true,
	altKey: true,
}

const TOGGLE_PIN = { key: "P", ctrlKey: true, shiftKey: true }

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
	commandKey.isUsed = true
	fileMenu.isCarried = false
	fileMenu.choose = undefined
	fileMenu.unwatch.mockReset()
	cleanup()
	localStorage.clear()
	vi.restoreAllMocks()
	windowHost.windowOpen.mockReset()
	windowHost.closeWindow.mockReset()
	windowHost.watchCloseRequest.mockReset()
	windowHost.liveWindowLabels.mockReset()
	windowHost.raiseReportedFailure.mockReset()
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
		showInNewTab(tabs, threadOf("first"))
		showInNewTab(tabs, threadOf("last"))
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
		showInNewTab(tabs, threadOf("first"))
		showInNewTab(tabs, threadOf("second"))
		tabs.select(viewOf(tabs).tabs[1]?.id ?? "")

		pressMod("w")

		expect(shownHrefs(tabs)).toEqual(["/", threadOf("second")])
		expect(activeHref(tabs)).toBe(threadOf("second"))
	})

	it("keeps a pinned tab open on Mod+W", () => {
		const tabs = tabsOfSpace()
		showInNewTab(tabs, threadOf("kept"))
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

describe("a page another tab shows", () => {
	it("pushes onto the active tab and leaves the tab showing it untouched", () => {
		const tabs = tabsOfSpace()
		showInNewTab(tabs, threadOf("shown"))
		const before = viewOf(tabs).tabs
		tabs.select(before[0]?.id ?? "")

		tabs.history.push(threadOf("shown"))

		expect(viewOf(tabs).activeId).toBe(before[0]?.id)
		expect(viewOf(tabs).tabs[1]).toEqual(before[1])
		expect(shownHrefs(tabs)).toEqual([threadOf("shown"), threadOf("shown")])
	})

	it("stays on the active tab when it navigates to a page another tab shows", async () => {
		const tabs = tabsOfSpace()
		const router = routerOn(tabs)
		await router.load()
		await router.navigate({ to: USER_SETTINGS })
		pressMod("t")
		await router.load()
		const freshId = viewOf(tabs).activeId

		await router.navigate({ to: USER_SETTINGS })

		expect(viewOf(tabs).activeId).toBe(freshId)
		expect(shownHrefs(tabs)).toEqual([USER_SETTINGS, USER_SETTINGS])
	})

	it("opens a second tab on it in the background", () => {
		const tabs = tabsOfSpace()
		tabs.history.push(threadOf("shown"))
		const activeId = viewOf(tabs).activeId

		tabs.openInNewTab(threadOf("shown"))

		expect(shownHrefs(tabs)).toEqual([threadOf("shown"), threadOf("shown")])
		expect(viewOf(tabs).activeId).toBe(activeId)
	})
})

describe("open in new tab", () => {
	it("inserts the tab right after the active one and keeps the active one shown", () => {
		const tabs = tabsOfSpace()
		showInNewTab(tabs, threadOf("active"))
		showInNewTab(tabs, threadOf("last"))
		const [, activeId = ""] = idsOf(tabs)
		tabs.select(activeId)

		tabs.openInNewTab(companionOf("nova"))

		expect(shownHrefs(tabs)).toEqual([
			"/",
			threadOf("active"),
			companionOf("nova"),
			threadOf("last"),
		])
		expect(viewOf(tabs).activeId).toBe(activeId)
		expect(activeHref(tabs)).toBe(threadOf("active"))
	})
})

describe("a tab opened in another Space", () => {
	it("lands in tabs built from the empty list, leaving the open Space as it is", () => {
		const tabs = tabsOfSpace()
		showInNewTab(tabs, threadOf("home"))
		const before = viewOf(tabs)

		tabs.openInNewTab(threadOf("away"), OTHER_SPACE)

		expect(tabs.getState().spaceId).toBe(SPACE)
		expect(viewOf(tabs)).toEqual(before)
		expect(activeHref(tabs)).toBe(threadOf("home"))

		tabs.showSpace(OTHER_SPACE)
		expect(shownHrefs(tabs)).toEqual(["/", threadOf("away")])
		expect(activeHref(tabs)).toBe("/")
	})

	it("joins the tabs that Space already holds", () => {
		const tabs = tabsOfSpace()
		tabs.showSpace(OTHER_SPACE)
		showInNewTab(tabs, threadOf("held"))
		tabs.showSpace(SPACE)

		tabs.openInNewTab(threadOf("away"), OTHER_SPACE)
		tabs.showSpace(OTHER_SPACE)

		expect(shownHrefs(tabs)).toEqual(["/", threadOf("held"), threadOf("away")])
		expect(activeHref(tabs)).toBe(threadOf("held"))
	})

	it("joins the tabs that Space restores after a reload", () => {
		const before = tabsOfSpace(OTHER_SPACE)
		showInNewTab(before, threadOf("held"))
		const after = tabsOfSpace()

		after.openInNewTab(threadOf("away"), OTHER_SPACE)
		after.showSpace(OTHER_SPACE)

		expect(shownHrefs(after)).toEqual(["/", threadOf("held"), threadOf("away")])
		expect(activeHref(after)).toBe(threadOf("held"))
	})
})

describe("two tabs on one conversation", () => {
	type TwinTabs = {
		tabs: WorkspaceTabs
		firstId: string
		secondId: string
	}

	const twinTabs = (): TwinTabs => {
		const tabs = tabsOfSpace()
		tabs.history.push(threadOf("x"))
		showInNewTab(tabs, threadOf("y"))
		tabs.history.push(threadOf("x"))
		const [firstId = "", secondId = ""] = idsOf(tabs)
		return { tabs, firstId, secondId }
	}

	it("shows X in the active tab, keeps it active on open in new tab, and moves back and forward per tab", () => {
		const { tabs, firstId, secondId } = twinTabs()

		expect(shownHrefs(tabs)).toEqual([threadOf("x"), threadOf("x")])
		expect(viewOf(tabs).activeId).toBe(secondId)

		tabs.openInNewTab(threadOf("z"))
		expect(shownHrefs(tabs)).toEqual([
			threadOf("x"),
			threadOf("x"),
			threadOf("z"),
		])
		expect(viewOf(tabs).activeId).toBe(secondId)

		tabs.back()
		expect(activeHref(tabs)).toBe(threadOf("y"))
		tabs.forward()
		expect(activeHref(tabs)).toBe(threadOf("x"))

		tabs.select(firstId)
		tabs.back()
		expect(activeHref(tabs)).toBe("/")
		tabs.forward()
		expect(activeHref(tabs)).toBe(threadOf("x"))
		expect(viewOf(tabs).activeId).toBe(firstId)
	})

	it("flags both tabs when the conversation needs you", () => {
		const { tabs } = twinTabs()

		const view = viewOf(tabs, { x: NEEDS_YOU })

		expect(view.tabs.map((tab) => tab.needsYou)).toEqual([true, true])
	})

	it("closes one and leaves the other in place", () => {
		const { tabs, firstId, secondId } = twinTabs()

		tabs.close(secondId)

		expect(idsOf(tabs)).toEqual([firstId])
		expect(activeHref(tabs)).toBe(threadOf("x"))
		tabs.back()
		expect(activeHref(tabs)).toBe("/")
	})

	it("restores both after a reload", () => {
		twinTabs()
		cleanup()

		const after = tabsOfSpace()

		expect(shownHrefs(after)).toEqual([threadOf("x"), threadOf("x")])
		expect(viewOf(after).activeId).toBe(idsOf(after)[1])
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
		showInNewTab(tabs, threadOf("one"))
		showInNewTab(tabs, threadOf("two"))
		const [list, one, two] = viewOf(tabs).tabs.map((tab) => tab.id)
		tabs.pin(two ?? "")

		tabs.reorder([one ?? "", list ?? "", two ?? ""])

		expect(shownHrefs(tabs)).toEqual([threadOf("two"), threadOf("one"), "/"])
		tabs.unpin(two ?? "")
		expect(viewOf(tabs).tabs.every((tab) => !tab.isPinned)).toBe(true)
	})

	it("closes the others and keeps the pinned ones", () => {
		const tabs = tabsOfSpace()
		showInNewTab(tabs, threadOf("pinned"))
		tabs.pin(viewOf(tabs).activeId)
		showInNewTab(tabs, threadOf("closed"))
		showInNewTab(tabs, threadOf("kept"))

		tabs.closeOthers(viewOf(tabs).activeId)

		expect(shownHrefs(tabs)).toEqual([threadOf("pinned"), threadOf("kept")])
		expect(activeHref(tabs)).toBe(threadOf("kept"))
	})
})

describe("the tabs of a Space", () => {
	it("keeps the tabs of the Space left and shows the ones of the Space reached", () => {
		const tabs = tabsOfSpace()
		showInNewTab(tabs, threadOf("home"))

		tabs.showSpace(OTHER_SPACE)
		expect(shownHrefs(tabs)).toEqual(["/"])

		tabs.showSpace(SPACE)
		expect(shownHrefs(tabs)).toEqual(["/", threadOf("home")])
		expect(activeHref(tabs)).toBe(threadOf("home"))
	})

	it("restores the open tabs, their order, the pinned ones and the active one after a reload", () => {
		const before = tabsOfSpace()
		showInNewTab(before, threadOf("pinned"))
		before.pin(viewOf(before).activeId)
		showInNewTab(before, companionOf("nova"))
		showInNewTab(before, USER_SETTINGS)
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
		showInNewTab(before, threadOf("gone"))
		showInNewTab(before, "/settings/companion/vanished")
		showInNewTab(before, companionOf("nova"))
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
		showInNewTab(before, missionOf("present"))
		showInNewTab(before, missionOf("unknown"))
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
		showInNewTab(before, missionOf("elsewhere"))
		showInNewTab(before, missionOf("unreadable"))
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
		showInNewTab(tabs, threadOf("asking"))
		showInNewTab(tabs, threadOf("quiet"))
		showInNewTab(tabs, companionOf("nova"))

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
	showInNewTab(tabs, threadOf("other"))
	showInNewTab(tabs, threadOf("earlier"))
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
	[
		"closing the active unpinned tab",
		({ tabs, settingsId }) => tabs.closeUnpinned(settingsId),
	],
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
	["opening in a new tab", ({ tabs }) => tabs.openInNewTab(USER_SETTINGS)],
	["unpinning", ({ tabs, settingsId }) => tabs.unpin(settingsId)],
	["closing an inactive tab", ({ tabs, otherId }) => tabs.close(otherId)],
	[
		"closing an inactive unpinned tab",
		({ tabs, otherId }) => tabs.closeUnpinned(otherId),
	],
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

	it.each([
		["active", ({ settingsId }: ShownSettings) => settingsId],
		["inactive", ({ otherId }: ShownSettings) => otherId],
	])(
		"leaves an %s pinned tab open when asked to close an unpinned one",
		(_, idOf) => {
			const shown = tabsShowingSettings()
			shown.tabs.pin(idOf(shown))
			const guard = cancellingGuard()
			shown.tabs.guardLeave(guard)
			const before = shown.tabs.getState()

			shown.tabs.closeUnpinned(idOf(shown))

			expect(guard).not.toHaveBeenCalled()
			expect(shown.tabs.getState()).toEqual(before)
			expect(activeHref(shown.tabs)).toBe(USER_SETTINGS)
		},
	)

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

const tabsOn = (...hrefs: string[]) => {
	const tabs = tabsOfSpace()
	for (const href of hrefs) {
		showInNewTab(tabs, href)
	}
	return tabs
}

const idOfTabOn = (tabs: WorkspaceTabs, href: string) =>
	viewOf(tabs).tabs.find((tab) => tab.href === href)?.id ?? ""

describe("the strip drag", () => {
	it("restores the dragged order after a relaunch", () => {
		const before = tabsOn(threadOf("one"), threadOf("two"))
		const [list = "", one = "", two = ""] = idsOf(before)

		before.reorder([two, list, one])
		cleanup()

		expect(shownHrefs(tabsOfSpace())).toEqual([
			threadOf("two"),
			"/",
			threadOf("one"),
		])
	})
})

const stripOf = (tabs: WorkspaceTabs) => shownTabsOf(tabs.getState()).tabs

const tabWithId = (tabs: WorkspaceTabs, id: string) =>
	stripOf(tabs).find((tab) => tab.id === id)

const pinnedStripOn = (pinnedHrefs: string[], unpinnedHrefs: string[]) => {
	const tabs = tabsOn(...pinnedHrefs, ...unpinnedHrefs)
	const [, ...openedIds] = idsOf(tabs)
	for (const id of openedIds.slice(0, pinnedHrefs.length)) {
		tabs.pin(id)
	}
	tabs.close(idOfTabOn(tabs, "/"))
	return tabs
}

describe("a push from a pinned tab", () => {
	it("activates the tab showing that page and leaves every entry list as it is", () => {
		const tabs = pinnedStripOn([threadOf("pinned")], [threadOf("shown")])
		const [pinnedId = "", shownId = ""] = idsOf(tabs)
		tabs.select(pinnedId)
		const before = stripOf(tabs)

		tabs.history.push(threadOf("shown"))

		expect(viewOf(tabs).activeId).toBe(shownId)
		expect(stripOf(tabs)).toEqual(before)
		expect(activeHref(tabs)).toBe(threadOf("shown"))
	})

	it("picks the nearest tab after the active one showing that page", () => {
		const tabs = pinnedStripOn(
			[threadOf("target"), threadOf("pinned")],
			[threadOf("other"), threadOf("target")],
		)
		const [, pinnedId = "", , nearestId = ""] = idsOf(tabs)
		tabs.select(pinnedId)

		tabs.history.push(threadOf("target"))

		expect(viewOf(tabs).activeId).toBe(nearestId)
	})

	it("wraps to the start of the strip when no later tab shows that page", () => {
		const tabs = pinnedStripOn(
			[threadOf("target"), threadOf("pinned")],
			[threadOf("other")],
		)
		const [wrappedId = "", pinnedId = ""] = idsOf(tabs)
		tabs.select(pinnedId)

		tabs.history.push(threadOf("target"))

		expect(viewOf(tabs).activeId).toBe(wrappedId)
	})

	it("opens an unpinned tab right after the pinned ones when no tab shows that page", () => {
		const tabs = pinnedStripOn(
			[threadOf("pinned"), threadOf("second")],
			[threadOf("other")],
		)
		const [pinnedId = ""] = idsOf(tabs)
		tabs.select(pinnedId)
		const pinnedBefore = tabWithId(tabs, pinnedId)

		tabs.history.push(threadOf("new"))

		expect(shownHrefs(tabs)).toEqual([
			threadOf("pinned"),
			threadOf("second"),
			threadOf("new"),
			threadOf("other"),
		])
		const opened = stripOf(tabs)[2]
		expect(opened?.isPinned).toBe(false)
		expect(opened?.entries).toHaveLength(1)
		expect(viewOf(tabs).activeId).toBe(opened?.id)
		expect(tabWithId(tabs, pinnedId)).toEqual(pinnedBefore)
	})

	it("pushes into the pinned tab when the page stays the same", () => {
		const tabs = pinnedStripOn([USER_SETTINGS], [])
		const [pinnedId = ""] = idsOf(tabs)
		const settingsEntry = `${USER_SETTINGS}?entry=profile`
		const entryCount = tabWithId(tabs, pinnedId)?.entries.length ?? 0

		tabs.history.push(settingsEntry)

		expect(viewOf(tabs).activeId).toBe(pinnedId)
		expect(shownHrefs(tabs)).toEqual([settingsEntry])
		expect(tabWithId(tabs, pinnedId)?.entries).toHaveLength(entryCount + 1)
	})

	it("replaces, goes back and goes forward inside the pinned tab", () => {
		const tabs = tabsOfSpace()
		tabs.history.push(threadOf("first"))
		tabs.history.push(threadOf("second"))
		const [pinnedId = ""] = idsOf(tabs)
		tabs.pin(pinnedId)

		tabs.history.back()
		expect(activeHref(tabs)).toBe(threadOf("first"))
		tabs.history.forward()
		expect(activeHref(tabs)).toBe(threadOf("second"))
		tabs.history.replace(threadOf("replaced"))

		expect(activeHref(tabs)).toBe(threadOf("replaced"))
		expect(idsOf(tabs)).toEqual([pinnedId])
		expect(tabWithId(tabs, pinnedId)?.entries).toHaveLength(3)
	})

	it("pushes into an unpinned active tab even when a pinned tab shows that page", () => {
		const tabs = pinnedStripOn([threadOf("shown")], [threadOf("unpinned")])
		const [pinnedId = "", unpinnedId = ""] = idsOf(tabs)
		const pinnedBefore = tabWithId(tabs, pinnedId)
		const entryCount = tabWithId(tabs, unpinnedId)?.entries.length ?? 0

		tabs.history.push(threadOf("shown"))

		expect(viewOf(tabs).activeId).toBe(unpinnedId)
		expect(shownHrefs(tabs)).toEqual([threadOf("shown"), threadOf("shown")])
		expect(tabWithId(tabs, unpinnedId)?.entries).toHaveLength(entryCount + 1)
		expect(tabWithId(tabs, pinnedId)).toEqual(pinnedBefore)
	})

	it("renders the page of the tab it lands in", async () => {
		const tabs = tabsOfSpace()
		const router = routerOn(tabs)
		await router.load()
		const [pinnedId = ""] = idsOf(tabs)
		tabs.pin(pinnedId)

		await router.navigate({ to: USER_SETTINGS })

		expect(router.state.location.pathname).toBe(USER_SETTINGS)
		expect(shownHrefs(tabs)).toEqual(["/", USER_SETTINGS])
		expect(viewOf(tabs).activeId).not.toBe(pinnedId)
	})
})

describe("Duplicate tab", () => {
	it("inserts a tab on the same page right after it and keeps the active tab", () => {
		const tabs = tabsOn(threadOf("copied"), threadOf("shown"))
		const activeId = viewOf(tabs).activeId

		tabs.duplicate(idOfTabOn(tabs, threadOf("copied")))

		expect(shownHrefs(tabs)).toEqual([
			"/",
			threadOf("copied"),
			threadOf("copied"),
			threadOf("shown"),
		])
		expect(viewOf(tabs).activeId).toBe(activeId)
		expect(activeHref(tabs)).toBe(threadOf("shown"))
	})
})

describe("the closed tabs", () => {
	it("offers no reopen before a tab closes", () => {
		const tabs = tabsOn(threadOf("open"))

		tabs.reopenClosed()

		expect(viewOf(tabs).hasClosedTab).toBe(false)
		expect(shownHrefs(tabs)).toEqual(["/", threadOf("open")])
	})

	it("reopens the last closed tab at its position, active, with its history and pin", async () => {
		const tabs = tabsOn(threadOf("first"), threadOf("left"))
		const router = routerOn(tabs)
		await router.load()
		await router.navigate({ to: "/", search: { conversation: "right" } })
		tabs.pin(idOfTabOn(tabs, threadOf("right")))
		tabs.select(idOfTabOn(tabs, threadOf("first")))

		tabs.close(idOfTabOn(tabs, threadOf("right")))
		expect(viewOf(tabs).hasClosedTab).toBe(true)
		tabs.reopenClosed()

		expect(
			viewOf(tabs).tabs.map(({ href, isPinned }) => ({ href, isPinned })),
		).toEqual([
			{ href: threadOf("right"), isPinned: true },
			{ href: "/", isPinned: false },
			{ href: threadOf("first"), isPinned: false },
		])
		expect(activeHref(tabs)).toBe(threadOf("right"))
		expect(viewOf(tabs).hasClosedTab).toBe(false)
		tabs.back()
		expect(activeHref(tabs)).toBe(threadOf("left"))
	})

	it("closes the tab of the menu, not the active one, and reopens it in place", () => {
		const tabs = tabsOn(threadOf("closed"), threadOf("shown"))

		tabs.close(idOfTabOn(tabs, threadOf("closed")))
		expect(shownHrefs(tabs)).toEqual(["/", threadOf("shown")])
		expect(activeHref(tabs)).toBe(threadOf("shown"))
		tabs.reopenClosed()

		expect(shownHrefs(tabs)).toEqual([
			"/",
			threadOf("closed"),
			threadOf("shown"),
		])
		expect(activeHref(tabs)).toBe(threadOf("closed"))
	})

	it("restores the order of tabs closed together, one reopen at a time", () => {
		const tabs = tabsOn(threadOf("one"), threadOf("two"), threadOf("kept"))

		tabs.closeOthers(viewOf(tabs).activeId)
		tabs.reopenClosed()
		tabs.reopenClosed()
		tabs.reopenClosed()

		expect(shownHrefs(tabs)).toEqual([
			"/",
			threadOf("one"),
			threadOf("two"),
			threadOf("kept"),
		])
	})

	it("keeps the last ten closed tabs", () => {
		const rows = Array.from({ length: 11 }, (_, i) => threadOf(`row-${i}`))
		const tabs = tabsOn(...rows)
		for (const row of rows) {
			tabs.close(idOfTabOn(tabs, row))
		}

		for (const _ of rows) {
			tabs.reopenClosed()
		}

		expect(shownHrefs(tabs)).toEqual(["/", ...rows.slice(1)])
		expect(viewOf(tabs).hasClosedTab).toBe(false)
	})

	it("reopens from the stack of the current Space only", () => {
		const tabs = tabsOn(threadOf("home"))
		tabs.closeActive()

		tabs.showSpace(OTHER_SPACE)
		expect(viewOf(tabs).hasClosedTab).toBe(false)
		tabs.reopenClosed()
		expect(shownHrefs(tabs)).toEqual(["/"])

		tabs.showSpace(SPACE)
		tabs.reopenClosed()
		expect(activeHref(tabs)).toBe(threadOf("home"))
	})

	it("asks before reopening over a guarded page and keeps the tab closed when cancelled", () => {
		const shown = tabsShowingSettings()
		shown.tabs.close(shown.otherId)
		const guard = cancellingGuard()
		shown.tabs.guardLeave(guard)

		shown.tabs.reopenClosed()

		expect(guard).toHaveBeenCalledOnce()
		expect(activeHref(shown.tabs)).toBe(USER_SETTINGS)
		expect(viewOf(shown.tabs).hasClosedTab).toBe(true)
	})
})

describe("the tab menu keys", () => {
	it("reopens the last closed tab on Cmd+Shift+T", () => {
		const tabs = tabsOn(threadOf("closed"))
		pressMod("w")

		press(REOPEN_ON_MAC)

		expect(shownHrefs(tabs)).toEqual(["/", threadOf("closed")])
		expect(activeHref(tabs)).toBe(threadOf("closed"))
	})

	it("keeps only the active tab and the pinned ones on Cmd+Alt+W", () => {
		const tabs = tabsOn(threadOf("pinned"), threadOf("closed"))
		tabs.pin(idOfTabOn(tabs, threadOf("pinned")))
		showInNewTab(tabs, threadOf("active"))

		press(CLOSE_OTHERS_ON_MAC)

		expect(shownHrefs(tabs)).toEqual([threadOf("pinned"), threadOf("active")])
		expect(activeHref(tabs)).toBe(threadOf("active"))
	})

	it("toggles the pin of the active tab on Ctrl+Shift+P, not on Cmd+Shift+P", () => {
		const tabs = tabsOn(threadOf("active"))

		press({ key: "P", metaKey: true, shiftKey: true })
		expect(viewOf(tabs).tabs.some((tab) => tab.isPinned)).toBe(false)

		press(TOGGLE_PIN)
		expect(shownHrefs(tabs)).toEqual([threadOf("active"), "/"])
		expect(viewOf(tabs).tabs[0]?.isPinned).toBe(true)

		press(TOGGLE_PIN)
		expect(viewOf(tabs).tabs.every((tab) => !tab.isPinned)).toBe(true)
	})

	it("reads Ctrl in place of Cmd outside macOS", () => {
		commandKey.isUsed = false
		const tabs = tabsOn(threadOf("pinned"), threadOf("closed"))
		tabs.pin(idOfTabOn(tabs, threadOf("pinned")))

		press(REOPEN_ON_MAC)
		press({ key: "t", ctrlKey: true })
		press({ key: "w", ctrlKey: true, altKey: true, code: "KeyW" })
		expect(shownHrefs(tabs)).toEqual([threadOf("pinned"), "/"])

		press({ key: "T", ctrlKey: true, shiftKey: true })
		press(TOGGLE_PIN)
		expect(viewOf(tabs).tabs.map(({ isPinned }) => isPinned)).toEqual([
			true,
			true,
			false,
		])
	})
})

const SECONDARY = "window-1"

const tabsOfWindow = (label: string, initialHref: string, spaceId = SPACE) => {
	const tabs = createWorkspaceTabs(initialHref, label)
	tabs.showSpace(spaceId)
	return tabs
}

const opensWindows = () =>
	windowHost.windowOpen.mockResolvedValue({ status: "ok", data: null })

const closesWindows = () => windowHost.closeWindow.mockResolvedValue(undefined)

describe("Move to new window", () => {
	it("opens a window on the current page of the tab, then removes it from the strip", async () => {
		opensWindows()
		const tabs = tabsOn(threadOf("moved"), threadOf("kept"))

		await tabs.moveToNewWindow(idOfTabOn(tabs, threadOf("moved")))

		expect(windowHost.windowOpen).toHaveBeenCalledExactlyOnceWith(
			threadOf("moved"),
			null,
			null,
			null,
		)
		expect(shownHrefs(tabs)).toEqual(["/", threadOf("kept")])
		expect(windowHost.raiseReportedFailure).not.toHaveBeenCalled()
	})

	it("leaves without the leave prompt and keeps the moved tab off the closed tabs", async () => {
		opensWindows()
		const shown = tabsShowingSettings()
		const guard = cancellingGuard()
		shown.tabs.guardLeave(guard)

		await shown.tabs.moveToNewWindow(shown.settingsId)

		expect(guard).not.toHaveBeenCalled()
		expect(shownHrefs(shown.tabs)).not.toContain(USER_SETTINGS)
		expect(viewOf(shown.tabs).hasClosedTab).toBe(false)
	})

	it.each([
		[
			"refuses",
			() =>
				Promise.resolve({ status: "error", error: { kind: "unavailable" } }),
			"The tab stayed here (unavailable). Choose Move to new window from the tab’s menu to try again.",
		],
		[
			"fails",
			() => Promise.reject(new Error("window lost")),
			"The tab stayed here (window lost). Choose Move to new window from the tab’s menu to try again.",
		],
		[
			"fails with no reason",
			() => Promise.reject(),
			"The tab stayed here. Choose Move to new window from the tab’s menu to try again.",
		],
		[
			"fails with an empty reason",
			() => Promise.reject(new Error("")),
			"The tab stayed here. Choose Move to new window from the tab’s menu to try again.",
		],
	])(
		"keeps the tab and raises one notice when opening the window %s",
		async (_, opening, description) => {
			windowHost.windowOpen.mockImplementation(opening)
			const tabs = tabsOn(threadOf("stays"))

			await tabs.moveToNewWindow(idOfTabOn(tabs, threadOf("stays")))

			expect(shownHrefs(tabs)).toEqual(["/", threadOf("stays")])
			expect(windowHost.raiseReportedFailure).toHaveBeenCalledExactlyOnceWith(
				{ title: "Couldn’t open a new window", description },
				{ raisedIn: "workspace-tabs", command: "window_open" },
			)
		},
	)

	it("keeps the main window open on a new empty tab when its last tab moves", async () => {
		opensWindows()
		const tabs = createWorkspaceTabs(threadOf("last"))
		tabs.showSpace(SPACE)

		await tabs.moveToNewWindow(viewOf(tabs).activeId)

		expect(shownHrefs(tabs)).toEqual(["/"])
		expect(windowHost.closeWindow).not.toHaveBeenCalled()
	})

	it("closes a secondary window when its last tab moves", async () => {
		opensWindows()
		closesWindows()
		const tabs = tabsOfWindow(SECONDARY, threadOf("last"))

		await tabs.moveToNewWindow(viewOf(tabs).activeId)

		expect(windowHost.closeWindow).toHaveBeenCalledOnce()
	})
})

const RELEASE = { screenX: 640.4, screenY: 120.6 }

const tearOff = (tabs: WorkspaceTabs, href: string) =>
	tabs.tearOff({ tabId: idOfTabOn(tabs, href), ...RELEASE })

describe("Tear off", () => {
	it("opens a window on the page of the tab at the rounded release point, then removes it from the strip", async () => {
		opensWindows()
		const tabs = tabsOn(threadOf("torn"), threadOf("kept"))

		tearOff(tabs, threadOf("torn"))

		await vi.waitFor(() =>
			expect(shownHrefs(tabs)).toEqual(["/", threadOf("kept")]),
		)
		expect(windowHost.windowOpen).toHaveBeenCalledExactlyOnceWith(
			threadOf("torn"),
			{ x: 640, y: 121 },
			null,
			null,
		)
		expect(windowHost.raiseReportedFailure).not.toHaveBeenCalled()
	})

	it("answers true at once, keeping the tab while the window opens", () => {
		windowHost.windowOpen.mockReturnValue(new Promise(() => {}))
		const tabs = tabsOn(threadOf("torn"))

		expect(tearOff(tabs, threadOf("torn"))).toBe(true)
		expect(shownHrefs(tabs)).toEqual(["/", threadOf("torn")])
	})

	it("keeps the tab in its slot and raises the move notice with its reason when the window fails to open", async () => {
		windowHost.windowOpen.mockRejectedValue(new Error("window lost"))
		const tabs = tabsOn(threadOf("first"), threadOf("stays"), threadOf("last"))

		tearOff(tabs, threadOf("stays"))

		await vi.waitFor(() =>
			expect(windowHost.raiseReportedFailure).toHaveBeenCalledExactlyOnceWith(
				{
					title: "Couldn’t open a new window",
					description:
						"The tab stayed here (window lost). Choose Move to new window from the tab’s menu to try again.",
				},
				{ raisedIn: "workspace-tabs", command: "window_open" },
			),
		)
		expect(shownHrefs(tabs)).toEqual([
			"/",
			threadOf("first"),
			threadOf("stays"),
			threadOf("last"),
		])
	})

	it("opens no window for an id naming no tab of the shown space", () => {
		opensWindows()
		const tabs = tabsOn(threadOf("kept"))

		tabs.tearOff({ tabId: "absent", ...RELEASE })

		expect(windowHost.windowOpen).not.toHaveBeenCalled()
		expect(shownHrefs(tabs)).toEqual(["/", threadOf("kept")])
	})
})

const ORIGIN_SIZE = { width: 1200, height: 800 }

const moveTornOff = (tabs: WorkspaceTabs, href: string) =>
	tabs.moveTornOff({ tabId: idOfTabOn(tabs, href), ...RELEASE }, ORIGIN_SIZE)

const openedHref = () => String(windowHost.windowOpen.mock.calls[0]?.[0])

describe("a tab dropped past the strip", () => {
	it("opens one window at the rounded drop point with the origin size and Space, then removes the tab", async () => {
		opensWindows()
		const tabs = tabsOn(threadOf("torn"), threadOf("kept"))

		await moveTornOff(tabs, threadOf("torn"))

		expect(shownHrefs(tabs)).toEqual(["/", threadOf("kept")])
		expect(windowHost.windowOpen).toHaveBeenCalledExactlyOnceWith(
			expect.stringMatching(/^\/\?conversation=torn&carriedTab=/),
			{ x: 640, y: 121 },
			SPACE,
			ORIGIN_SIZE,
		)
		expect(windowHost.raiseReportedFailure).not.toHaveBeenCalled()
	})

	it("hands the new window the page of the tab with its back and forward history", async () => {
		opensWindows()
		const tabs = tabsOn(threadOf("first"))
		tabs.history.push(threadOf("second"))
		tabs.history.back()

		await moveTornOff(tabs, threadOf("first"))
		const opened = tabsOfWindow(SECONDARY, openedHref())

		expect(activeHref(opened)).toBe(threadOf("first"))
		expect(shownHrefs(opened)).toEqual([threadOf("first")])
		expect(viewOf(opened)).toMatchObject({
			canGoBack: true,
			canGoForward: true,
		})
		opened.forward()
		expect(activeHref(opened)).toBe(threadOf("second"))
	})

	it("keeps the tab in its slot, raises the move notice and carries nothing when the window fails to open", async () => {
		windowHost.windowOpen.mockRejectedValue(new Error("window lost"))
		const tabs = tabsOn(threadOf("first"), threadOf("stays"))

		await moveTornOff(tabs, threadOf("stays"))
		const opened = tabsOfWindow(SECONDARY, openedHref())

		expect(shownHrefs(tabs)).toEqual([
			"/",
			threadOf("first"),
			threadOf("stays"),
		])
		expect(windowHost.raiseReportedFailure).toHaveBeenCalledExactlyOnceWith(
			{
				title: "Couldn’t open a new window",
				description:
					"The tab stayed here (window lost). Choose Move to new window from the tab’s menu to try again.",
			},
			{ raisedIn: "workspace-tabs", command: "window_open" },
		)
		expect(shownHrefs(opened)).toEqual([threadOf("stays")])
		expect(viewOf(opened).canGoBack).toBe(false)
	})
})

describe("the windows", () => {
	it("shows the page a secondary window opened on as its single tab, ignoring its kept tabs", () => {
		const before = tabsOfWindow(SECONDARY, threadOf("earlier"))
		showInNewTab(before, threadOf("kept"))

		const after = tabsOfWindow(SECONDARY, threadOf("moved"))

		expect(shownHrefs(after)).toEqual([threadOf("moved")])
		expect(activeHref(after)).toBe(threadOf("moved"))
	})

	it("keeps the tabs and the active tab of each window apart", () => {
		const main = tabsOn(threadOf("main"))
		const secondary = tabsOfWindow(SECONDARY, threadOf("moved"))
		showInNewTab(secondary, threadOf("secondary"))
		secondary.openEmptyTab()
		secondary.select(idOfTabOn(secondary, threadOf("moved")))
		cleanup()

		const relaunched = tabsOfSpace()

		expect(shownHrefs(main)).toEqual(["/", threadOf("main")])
		expect(shownHrefs(relaunched)).toEqual(["/", threadOf("main")])
		expect(activeHref(relaunched)).toBe(threadOf("main"))
	})

	it("changes only the strip of the window where a tab key is pressed", () => {
		const main = createWorkspaceTabs()
		main.showSpace(SPACE)
		const secondary = tabsOfWindow(SECONDARY, threadOf("moved"))
		renderHook(() => useTabKeys(secondary))

		pressMod("t")

		expect(shownHrefs(main)).toEqual(["/"])
		expect(shownHrefs(secondary)).toEqual([threadOf("moved"), "/"])
	})

	it("restores the main window tabs kept before tabs were kept per window", () => {
		localStorage.setItem(
			`spaceTabs:${SPACE}`,
			JSON.stringify({
				tabs: [
					{ href: threadOf("before"), isPinned: false },
					{ href: USER_SETTINGS, isPinned: false },
				],
				activeIndex: 1,
			}),
		)

		const tabs = tabsOfSpace()

		expect(shownHrefs(tabs)).toEqual([threadOf("before"), USER_SETTINGS])
		expect(activeHref(tabs)).toBe(USER_SETTINGS)
	})

	it("discards at launch the kept tabs of every window not open at quit", () => {
		const unlistedKey = `windowTabs:window-9:${SPACE}`
		localStorage.setItem(
			unlistedKey,
			JSON.stringify({
				tabs: [{ href: threadOf("orphan"), isPinned: false }],
				activeIndex: 0,
			}),
		)

		tabsOfSpace()

		expect(localStorage.getItem(unlistedKey)).toBeNull()
	})

	it("flags Needs you from the tabs of its own window", () => {
		const main = tabsOn(threadOf("asking"))
		const secondary = tabsOfWindow(SECONDARY, threadOf("quiet"))
		const hostStates = { asking: NEEDS_YOU }

		expect(viewOf(main, hostStates).tabs.map((tab) => tab.needsYou)).toEqual([
			false,
			true,
		])
		expect(
			viewOf(secondary, hostStates).tabs.map((tab) => tab.needsYou),
		).toEqual([false])
	})

	it.each([
		["closing it", (tabs: WorkspaceTabs) => tabs.close(viewOf(tabs).activeId)],
		[
			"Cmd+W",
			(tabs: WorkspaceTabs) => {
				renderHook(() => useTabKeys(tabs))
				pressMod("w")
			},
		],
	])("closes a secondary window on %s its last tab", (_, gesture) => {
		closesWindows()
		const tabs = tabsOfWindow(SECONDARY, threadOf("last"))

		gesture(tabs)

		expect(windowHost.closeWindow).toHaveBeenCalledOnce()
	})

	it("keeps a secondary window open when a tab closes and others remain", () => {
		const tabs = tabsOfWindow(SECONDARY, threadOf("first"))
		showInNewTab(tabs, threadOf("second"))

		tabs.closeActive()

		expect(windowHost.closeWindow).not.toHaveBeenCalled()
		expect(shownHrefs(tabs)).toEqual([threadOf("first")])
	})
})

const reopenedHrefs = () =>
	windowHost.windowOpen.mock.calls.map(([href]) => href as string)

const startMain = async (liveLabels: string[]) => {
	windowHost.windowOpen.mockClear()
	windowHost.liveWindowLabels.mockResolvedValue(["main", ...liveLabels])
	await routerOn(tabsOfSpace()).load()
	await reopenSecondaryWindows()
	return reopenedHrefs()
}

const relaunch = () => {
	cleanup()
	return startMain([])
}

const reopenedAs = (label: string, href: string) => {
	const tabs = createWorkspaceTabs(href, label)
	tabs.showSpace(tabs.reopenedSpaceId ?? SPACE)
	return tabs
}

const keysOf = (label: string) =>
	Object.keys(localStorage).filter((key) => key.includes(label))

const requestClose = async (label: string) => {
	let closeRequested = () => {}
	windowHost.watchCloseRequest.mockImplementation((onCloseRequested) => {
		closeRequested = onCloseRequested
		return Promise.resolve(() => undefined)
	})
	await forgetWindowWhenClosed(label)
	closeRequested()
	await vi.waitFor(() => expect(windowHost.closeWindow).toHaveBeenCalled())
}

describe("the windows open at quit", () => {
	it("reopens one window per secondary window open at quit", async () => {
		opensWindows()
		tabsOfWindow(SECONDARY, threadOf("first"))
		tabsOfWindow("window-2", threadOf("second"))

		expect(await relaunch()).toEqual(
			expect.arrayContaining(["/?handover=window-1", "/?handover=window-2"]),
		)
		expect(windowHost.windowOpen).toHaveBeenCalledTimes(2)
	})

	it("reopens only the listed windows that are not alive", async () => {
		opensWindows()
		tabsOfWindow(SECONDARY, threadOf("alive"))
		tabsOfWindow("window-2", threadOf("gone"))

		expect(await startMain([SECONDARY])).toEqual(["/?handover=window-2"])
	})

	it("keeps the tabs of a window still alive when the main window starts again", async () => {
		opensWindows()
		const alive = tabsOfWindow(SECONDARY, threadOf("alive"), OTHER_SPACE)
		showInNewTab(alive, threadOf("second"))

		expect(await startMain([SECONDARY])).toEqual([])

		const [href = ""] = await relaunch()
		const after = reopenedAs("window-2", href)
		expect(shownHrefs(after)).toEqual([threadOf("alive"), threadOf("second")])
	})

	it("reopens a window on the space, tabs, active tab and history it showed", async () => {
		opensWindows()
		const before = tabsOfWindow(SECONDARY, threadOf("moved"), OTHER_SPACE)
		const beforeRouter = routerOn(before)
		await beforeRouter.load()
		await beforeRouter.navigate({ to: USER_SETTINGS })
		showInNewTab(before, threadOf("second"))
		const settingsTabId = idOfTabOn(before, USER_SETTINGS)
		act(() => before.select(settingsTabId))

		const [href = ""] = await relaunch()
		const after = reopenedAs("window-2", href)
		const afterRouter = routerOn(after)
		await afterRouter.load()

		expect(after.reopenedSpaceId).toBe(OTHER_SPACE)
		expect(shownHrefs(after)).toEqual([USER_SETTINGS, threadOf("second")])
		expect(afterRouter.state.location.pathname).toBe(USER_SETTINGS)
		afterRouter.history.back()
		expect(activeHref(after)).toBe(threadOf("moved"))
	})

	it("never shows the handover in the address of a tab", async () => {
		opensWindows()
		tabsOfWindow(SECONDARY, threadOf("moved"))
		const [href = ""] = await relaunch()

		const after = createWorkspaceTabs(href, "window-2")

		expect(activeHref(after)).toBe("/")
		after.showSpace(SPACE)
		expect(shownHrefs(after)).toEqual([threadOf("moved")])
	})

	it("takes over the kept tabs and the place of its predecessor", async () => {
		opensWindows()
		tabsOfWindow(SECONDARY, threadOf("moved"))
		const [href = ""] = await relaunch()
		reopenedAs("window-2", href)

		expect(keysOf(SECONDARY)).toEqual([])
		expect(await relaunch()).toEqual(["/?handover=window-2"])
	})

	it("forgets a window the person closes", async () => {
		opensWindows()
		closesWindows()
		const tabs = tabsOfWindow(SECONDARY, threadOf("first"))
		showInNewTab(tabs, threadOf("second"))

		await requestClose(SECONDARY)

		expect(keysOf(SECONDARY)).toEqual([])
		expect(await relaunch()).toEqual([])
	})

	it("closes the window once forgotten, and says so when it cannot", async () => {
		windowHost.closeWindow.mockRejectedValue(new Error("refused"))
		tabsOfWindow(SECONDARY, threadOf("first"))

		await requestClose(SECONDARY)

		await vi.waitFor(() =>
			expect(windowHost.raiseReportedFailure).toHaveBeenCalledExactlyOnceWith(
				{ title: "Couldn’t close Kiroshi." },
				{ raisedIn: "workspace-tabs", command: undefined },
			),
		)
	})

	it("forgets a window that fails to reopen and says so", async () => {
		windowHost.windowOpen.mockResolvedValue({
			status: "error",
			error: { kind: "unavailable" },
		})
		tabsOfWindow(SECONDARY, threadOf("lost"))

		await relaunch()

		expect(windowHost.raiseReportedFailure).toHaveBeenCalledExactlyOnceWith(
			{
				title: "Couldn’t reopen a window",
				description:
					"Its tabs were closed (unavailable). Open them again from the sidebar.",
			},
			{ raisedIn: "workspace-tabs", command: "window_open" },
		)
		expect(keysOf(SECONDARY)).toEqual([])
		expect(await relaunch()).toEqual([])
	})
})

const choose = (action: FileMenuAction) =>
	act(() => {
		if (!fileMenu.choose) {
			throw new Error("the File menu is not watched")
		}
		fileMenu.choose(action)
	})

const withFileMenu = () => {
	fileMenu.isCarried = true
}

describe("the File menu", () => {
	it("runs each tab action the matching chord runs", () => {
		withFileMenu()
		const tabs = tabsOn(threadOf("first"), threadOf("second"))

		choose("newTab")
		expect(shownHrefs(tabs)).toEqual([
			"/",
			threadOf("first"),
			threadOf("second"),
			"/",
		])

		choose("closeTab")
		expect(shownHrefs(tabs)).toEqual([
			"/",
			threadOf("first"),
			threadOf("second"),
		])

		choose("reopenClosedTab")
		expect(shownHrefs(tabs)).toEqual([
			"/",
			threadOf("first"),
			threadOf("second"),
			"/",
		])
	})

	it("leaves the menu chords to the menu, so one gesture runs one action", () => {
		withFileMenu()
		const tabs = tabsOn(threadOf("first"))

		pressMod("t")
		pressMod("w")
		press({ key: "t", metaKey: true, shiftKey: true })

		expect(shownHrefs(tabs)).toEqual(["/", threadOf("first")])
	})

	it("keeps the main window open when its last tab closes", () => {
		withFileMenu()
		closesWindows()
		const tabs = tabsOfSpace()

		choose("closeTab")

		expect(windowHost.closeWindow).not.toHaveBeenCalled()
		expect(shownHrefs(tabs)).toEqual(["/"])
	})

	it("opens a new window on one empty tab", async () => {
		withFileMenu()
		opensWindows()
		const tabs = tabsOn(threadOf("kept"))

		choose("newWindow")

		await vi.waitFor(() =>
			expect(windowHost.windowOpen).toHaveBeenCalledExactlyOnceWith(
				"/",
				null,
				null,
				null,
			),
		)
		expect(shownHrefs(tabs)).toEqual(["/", threadOf("kept")])
		expect(windowHost.raiseReportedFailure).not.toHaveBeenCalled()
	})

	it("raises the window failure when the new window does not open", async () => {
		withFileMenu()
		windowHost.windowOpen.mockResolvedValue({
			status: "error",
			error: { kind: "unavailable" },
		})
		tabsOfSpace()

		choose("newWindow")

		await vi.waitFor(() =>
			expect(windowHost.raiseReportedFailure).toHaveBeenCalledExactlyOnceWith(
				{ title: "Couldn’t open a new window" },
				{ raisedIn: "workspace-tabs", command: "window_open" },
			),
		)
	})

	it("stops listening when the window unmounts", async () => {
		withFileMenu()
		tabsOfSpace()

		cleanup()

		await vi.waitFor(() => expect(fileMenu.unwatch).toHaveBeenCalledOnce())
	})

	it("is not watched where no native menu is carried", () => {
		const tabs = tabsOfSpace()

		pressMod("t")

		expect(shownHrefs(tabs)).toEqual(["/", "/"])
		expect(fileMenu.choose).toBeUndefined()
	})
})
