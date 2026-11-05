// @vitest-environment happy-dom

import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@workspace/ui/lib/i18n"

import { createConversationTabOpening } from "./conversation-tab-opening"
import { createOnThisComputerBus } from "./on-this-computer-test-bus"
import { pageOf } from "./tab-pages"
import { activeTabOf, currentHrefOf, type SpaceTabs } from "./tabs-model"
import { useConversationTabOpening } from "./use-conversation-tab-opening"
import {
	createWorkspaceTabs,
	shownTabsOf,
	type WorkspaceTabs,
} from "./workspace-tabs"

const host = vi.hoisted(() => ({
	revealWindow: vi.fn(),
	liveWindowLabels: vi.fn(),
	emitOnThisComputer: vi.fn(),
	listenOnThisComputer: vi.fn(),
	raiseReportedFailure: vi.fn(),
}))

vi.mock("../host", async (importOriginal) => ({
	...(await importOriginal<typeof import("../host")>()),
	isDesktopHost: () => true,
	revealWindow: host.revealWindow,
	liveWindowLabels: host.liveWindowLabels,
	emitOnThisComputer: host.emitOnThisComputer,
	listenOnThisComputer: host.listenOnThisComputer,
}))

vi.mock("../failure-report", async (importOriginal) => ({
	...(await importOriginal<typeof import("../failure-report")>()),
	raiseReportedFailure: host.raiseReportedFailure,
}))

const MAIN = "main"

const SECONDARY = "window-1"

const HOME = "home"

const VOCCA = "vocca"

const ROOM_HREF = "/?conversation=room"

const OTHER_HREF = "/?conversation=other"

const openInPlace = vi.fn()

const ROOM = { conversationId: "room", openInPlace }

beforeEach(() => {
	const bus = createOnThisComputerBus()
	host.emitOnThisComputer.mockImplementation(bus.emit)
	host.listenOnThisComputer.mockImplementation(bus.listen)
	host.revealWindow.mockResolvedValue(undefined)
	host.liveWindowLabels.mockResolvedValue([MAIN, SECONDARY])
})

afterEach(() => {
	cleanup()
	localStorage.clear()
	vi.clearAllMocks()
	vi.useRealTimers()
})

const hrefsOf = (space: SpaceTabs) => space.tabs.map(currentHrefOf)

const activeHrefOf = (space: SpaceTabs) => currentHrefOf(activeTabOf(space))

const shown = (tabs: WorkspaceTabs) => shownTabsOf(tabs.getState())

const windowOn = (label: string, spaceId: string, hrefs: string[]) => {
	const tabs = createWorkspaceTabs(undefined, label)
	tabs.showSpace(spaceId)
	const [first, ...rest] = hrefs
	if (first !== undefined) {
		tabs.history.push(first)
	}
	for (const href of rest) {
		tabs.openInNewTab(href)
	}
	return tabs
}

const openingOf = (tabs: WorkspaceTabs) => {
	const selectSpace = vi.fn((spaceId: string) => tabs.showSpace(spaceId))
	return {
		opening: createConversationTabOpening({ tabs, selectSpace }),
		selectSpace,
	}
}

describe("opening a conversation a tab of this window shows", () => {
	it("activates that tab of the shown Space and opens no new tab", async () => {
		const tabs = windowOn(MAIN, HOME, [OTHER_HREF, ROOM_HREF])
		const { opening, selectSpace } = openingOf(tabs)

		await opening.open(ROOM)

		expect(hrefsOf(shown(tabs))).toEqual([OTHER_HREF, ROOM_HREF])
		expect(activeHrefOf(shown(tabs))).toBe(ROOM_HREF)
		expect(selectSpace).not.toHaveBeenCalled()
		expect(openInPlace).not.toHaveBeenCalled()
	})

	it("switches to the Space holding that tab and activates it", async () => {
		const tabs = windowOn(MAIN, VOCCA, [ROOM_HREF, OTHER_HREF])
		tabs.select(shown(tabs).tabs[1]?.id ?? "")
		tabs.showSpace(HOME)
		const { opening, selectSpace } = openingOf(tabs)

		await opening.open(ROOM)

		expect(selectSpace).toHaveBeenCalledExactlyOnceWith(VOCCA)
		expect(tabs.getState().spaceId).toBe(VOCCA)
		expect(hrefsOf(shown(tabs))).toEqual([ROOM_HREF, OTHER_HREF])
		expect(activeHrefOf(shown(tabs))).toBe(ROOM_HREF)
		expect(openInPlace).not.toHaveBeenCalled()
	})

	it("opens the mission it carries in the tab already showing the conversation", async () => {
		const tabs = windowOn(MAIN, HOME, [ROOM_HREF])
		const { opening } = openingOf(tabs)

		await opening.open({ ...ROOM, mission: "m-1" })

		expect(shown(tabs).tabs).toHaveLength(1)
		expect(pageOf(activeHrefOf(shown(tabs))).thread).toEqual({
			conversation: "room",
			mission: "m-1",
		})
	})
})

describe("opening a conversation a tab of another window shows", () => {
	const twoWindows = () => {
		const here = windowOn(MAIN, HOME, [OTHER_HREF])
		const there = windowOn(SECONDARY, VOCCA, [ROOM_HREF, OTHER_HREF])
		return { here, there }
	}

	it("brings that window forward on that Space and tab, and leaves this tab alone", async () => {
		const { here, there } = twoWindows()
		there.showSpace(HOME)
		const answering = openingOf(there)
		const stopAnswering = await answering.opening.answerReveals()

		await openingOf(here).opening.open(ROOM)

		expect(host.revealWindow).toHaveBeenCalledWith({ withFocus: true })
		expect(answering.selectSpace).toHaveBeenCalledExactlyOnceWith(VOCCA)
		expect(activeHrefOf(shown(there))).toBe(ROOM_HREF)
		expect(hrefsOf(shown(there))).toEqual([ROOM_HREF, OTHER_HREF])
		expect(hrefsOf(shown(here))).toEqual([OTHER_HREF])
		expect(openInPlace).not.toHaveBeenCalled()
		expect(host.raiseReportedFailure).not.toHaveBeenCalled()
		stopAnswering()
	})

	it("raises a failure notice and leaves this tab alone when that window cannot come forward", async () => {
		const { here, there } = twoWindows()
		host.revealWindow.mockRejectedValue(new Error("window hidden"))
		const stopAnswering = await openingOf(there).opening.answerReveals()
		vi.spyOn(console, "error").mockImplementation(() => undefined)

		await openingOf(here).opening.open(ROOM)

		expect(host.raiseReportedFailure).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({
				title: i18n.t("common:titleBar.revealTabFailed.title"),
			}),
			{ raisedIn: "conversation-tab-opening" },
		)
		expect(hrefsOf(shown(here))).toEqual([OTHER_HREF])
		expect(openInPlace).not.toHaveBeenCalled()
		stopAnswering()
	})

	it("raises a failure notice when that window never answers", async () => {
		const { here } = twoWindows()
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })

		const opened = openingOf(here).opening.open(ROOM)
		await vi.advanceTimersByTimeAsync(2000)
		await opened

		expect(host.raiseReportedFailure).toHaveBeenCalledOnce()
		expect(hrefsOf(shown(here))).toEqual([OTHER_HREF])
		expect(openInPlace).not.toHaveBeenCalled()
	})

	it("opens in place when that window is no longer open", async () => {
		const { here } = twoWindows()
		host.liveWindowLabels.mockResolvedValue([MAIN])

		await openingOf(here).opening.open(ROOM)

		expect(openInPlace).toHaveBeenCalledOnce()
		expect(host.raiseReportedFailure).not.toHaveBeenCalled()
	})
})

describe("opening a conversation no tab shows", () => {
	it("opens it in place", async () => {
		const tabs = windowOn(MAIN, HOME, [OTHER_HREF])
		const { opening, selectSpace } = openingOf(tabs)

		await opening.open(ROOM)

		expect(openInPlace).toHaveBeenCalledOnce()
		expect(selectSpace).not.toHaveBeenCalled()
		expect(hrefsOf(shown(tabs))).toEqual([OTHER_HREF])
	})

	it("opens it in a new active tab of the Space asked for", () => {
		const tabs = windowOn(MAIN, HOME, [OTHER_HREF])
		const { opening, selectSpace } = openingOf(tabs)

		opening.openInNewTab("room", VOCCA)

		expect(selectSpace).toHaveBeenCalledExactlyOnceWith(VOCCA)
		expect(tabs.getState().spaceId).toBe(VOCCA)
		expect(hrefsOf(shown(tabs))).toEqual(["/", ROOM_HREF])
		expect(activeHrefOf(shown(tabs))).toBe(ROOM_HREF)
	})
})

describe("a new-tab click", () => {
	it("opens a background tab even when a tab already shows the conversation", () => {
		const tabs = windowOn(MAIN, HOME, [OTHER_HREF, ROOM_HREF])
		tabs.select(shown(tabs).tabs[0]?.id ?? "")

		tabs.openInNewTab(ROOM_HREF)

		expect(hrefsOf(shown(tabs))).toEqual([OTHER_HREF, ROOM_HREF, ROOM_HREF])
		expect(activeHrefOf(shown(tabs))).toBe(OTHER_HREF)
	})
})

describe("the conversation opening hook", () => {
	it("answers reveal asks while mounted, across re-renders, and stops once unmounted", async () => {
		const here = windowOn(MAIN, HOME, [OTHER_HREF])
		const there = windowOn(SECONDARY, VOCCA, [ROOM_HREF])
		const joinedSpaces = { selectSpace: vi.fn() }
		const mounted = renderHook(() =>
			useConversationTabOpening(there, joinedSpaces),
		)
		const firstOpening = mounted.result.current
		mounted.rerender()
		await Promise.resolve()

		await openingOf(here).opening.open(ROOM)

		expect(mounted.result.current).toBe(firstOpening)
		expect(host.revealWindow).toHaveBeenCalledOnce()

		mounted.unmount()
		await Promise.resolve()
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
		const opened = openingOf(here).opening.open(ROOM)
		await vi.advanceTimersByTimeAsync(2000)
		await opened

		expect(host.revealWindow).toHaveBeenCalledOnce()
		expect(host.raiseReportedFailure).toHaveBeenCalledOnce()
	})
})
