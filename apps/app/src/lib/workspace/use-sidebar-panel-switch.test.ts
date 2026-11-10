// @vitest-environment happy-dom

import { invoke } from "@tauri-apps/api/core"
import { act, cleanup, renderHook } from "@testing-library/react"
import { useSyncExternalStore } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useSidebarPanelSwitch } from "./use-sidebar-panel-switch"

import { createStore } from "../store"
import type { RosterController } from "../bots/roster-controller"
import { createOpenedMissionController } from "../missions/opened-mission-controller"
import { activeTabOf, currentHrefOf } from "../tabs/tabs-model"
import { useTabThreadSync } from "../tabs/use-tab-thread-sync"
import { createWorkspaceTabs, shownTabsOf } from "../tabs/workspace-tabs"
import type { UserPreferences } from "../user/preferences-contract"
import { useUser } from "../user/use-user"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))

const navigation = vi.hoisted(() => ({ push: (_href: string) => {} }))

vi.mock("@tanstack/react-router", async (importOriginal) => {
	const router = await importOriginal<typeof import("@tanstack/react-router")>()
	return {
		...router,
		useNavigate:
			() =>
			({ search }: { search: Record<string, unknown> }) =>
				navigation.push(`/${router.defaultStringifySearch(search)}`),
	}
})

const hostInvoke = vi.mocked(invoke)

const STORED: UserPreferences = {
	displayName: "",
	profilePicturePath: null,
	colorScheme: "system",
	language: null,
	notifyOnQuestion: true,
	notifyOnPermission: true,
	notifyOnFinishedTurn: true,
	notifyWithSound: true,
	sidebarWidth: null,
	sidebarTab: "conversations",
	openOn: "newConversation",
	activityPanelOpen: false,
	firstRunDone: true,
	lastSpaceId: null,
	lastBotIdBySpace: {},
}

type Selection = {
	selectedBotId: string | null
	selectedConversationId: string | null
}

const aRoster = (spaceRowId: string, selection: Selection) => {
	const store = createStore({ spaceRowId, ...selection })
	return {
		...store,
		select: (id: string) =>
			store.setState({
				...store.getState(),
				selectedBotId: id,
				selectedConversationId: null,
			}),
		selectConversation: (id: string) =>
			store.setState({
				...store.getState(),
				selectedBotId: null,
				selectedConversationId: id,
			}),
	}
}

const MISSION_ROW = "b-mission"

const ON_C1: Selection = { selectedBotId: null, selectedConversationId: "c-1" }

type Mount = {
	stored?: UserPreferences["sidebarTab"]
}

const answerPreferences = (stored: UserPreferences["sidebarTab"]) =>
	hostInvoke.mockImplementation((_, args) =>
		Promise.resolve(
			(args as { preferences?: UserPreferences } | undefined)?.preferences ?? {
				...STORED,
				sidebarTab: stored,
			},
		),
	)

const mountSwitch = async ({ stored = "conversations" }: Mount = {}) => {
	answerPreferences(stored)
	const tabs = createWorkspaceTabs()
	const roster = aRoster("s-1", ON_C1)
	const openedMission = createOpenedMissionController(roster)
	const mounted = renderHook(() => {
		const user = useUser()
		const sidebarTab = useSidebarPanelSwitch({ core: { user }, tabs })
		return { user, sidebarTab }
	})
	await act(() => mounted.result.current.user.controller.load())

	const switchTo = (panel: "conversations" | "missions") =>
		act(() => mounted.result.current.sidebarTab.openSidebarTab(panel))
	const selectedRow = () =>
		roster.getState().selectedBotId ?? roster.getState().selectedConversationId
	const shownMissionId = () => openedMission.getState()?.missionId ?? null

	return {
		...mounted,
		openedMission,
		switchTo,
		selectedRow,
		shownMissionId,
	}
}

beforeEach(() => {
	hostInvoke.mockReset()
	localStorage.clear()
})

afterEach(cleanup)

describe("switching to the Missions tab", () => {
	it("opens no mission and keeps the row shown", async () => {
		const shown = await mountSwitch()

		shown.switchTo("missions")

		expect(shown.result.current.sidebarTab.openTab).toBe("missions")
		expect(shown.shownMissionId()).toBeNull()
		expect(shown.selectedRow()).toBe("c-1")
	})

	it("keeps the mission already open", async () => {
		const shown = await mountSwitch()
		act(() =>
			shown.openedMission.open({
				missionId: "m-7",
				rowId: "c-1",
				spaceId: "s-1",
			}),
		)

		shown.switchTo("missions")

		expect(shown.shownMissionId()).toBe("m-7")
	})
})

describe("starting on the Missions tab", () => {
	it("opens no mission", async () => {
		const shown = await mountSwitch({ stored: "missions" })

		expect(shown.result.current.sidebarTab.openTab).toBe("missions")
		expect(shown.shownMissionId()).toBeNull()
		expect(shown.selectedRow()).toBe("c-1")
	})
})

describe("switching to the Conversations tab", () => {
	it("keeps the mission shown and its row", async () => {
		const shown = await mountSwitch({ stored: "missions" })
		act(() =>
			shown.openedMission.open({
				missionId: "m-7",
				rowId: "c-1",
				spaceId: "s-1",
			}),
		)

		shown.switchTo("conversations")

		expect(shown.result.current.sidebarTab.openTab).toBe("conversations")
		expect(shown.shownMissionId()).toBe("m-7")
		expect(shown.selectedRow()).toBe("c-1")
	})
})

describe("a mission opened from a thread card", () => {
	it("keeps the tab and the selection", async () => {
		const shown = await mountSwitch()

		act(() =>
			shown.openedMission.open({
				missionId: "m-7",
				rowId: "c-1",
				spaceId: "s-1",
			}),
		)

		expect(shown.result.current.sidebarTab.openTab).toBe("conversations")
		expect(shown.selectedRow()).toBe("c-1")
	})
})

const C1_HREF = "/?conversation=c-1"

const COMPANION_HREF = "/?bot=b-1"

const MISSION_HREF = `/?bot=${MISSION_ROW}&mission=m-7`

const threadRosterOf = (roster: ReturnType<typeof aRoster>) =>
	({
		...roster,
		getState: () => ({ ...roster.getState(), bots: [], conversations: [] }),
		showList: () =>
			roster.setState({
				...roster.getState(),
				selectedBotId: null,
				selectedConversationId: null,
			}),
	}) as unknown as RosterController

const mountTabbedSwitch = async () => {
	answerPreferences("conversations")
	const tabs = createWorkspaceTabs(C1_HREF)
	navigation.push = (href) => tabs.history.push(href)
	const roster = aRoster("s-1", ON_C1)
	const threadRoster = threadRosterOf(roster)
	const openedMission = createOpenedMissionController(roster)
	const mounted = renderHook(() => {
		const user = useUser()
		const selected = useSyncExternalStore(roster.subscribe, roster.getState)
		useTabThreadSync({
			tabs,
			roster: threadRoster,
			selected,
			openedMission,
			openSpaceId: "s-1",
			isOpenSpaceRostered: true,
		})
		const sidebarTab = useSidebarPanelSwitch({
			core: { user },
			tabs,
		})
		return { user, sidebarTab }
	})
	await act(() => mounted.result.current.user.controller.load())

	const tabIds = () => shownTabsOf(tabs.getState()).tabs.map(({ id }) => id)
	const openTabOn = (href: string) => {
		act(() => tabs.openInNewTab(href))
		return tabIds().at(-1) ?? ""
	}
	const activate = (id: string) => act(() => tabs.select(id))
	const shownHref = () =>
		currentHrefOf(activeTabOf(shownTabsOf(tabs.getState())))

	return {
		...mounted,
		tabs,
		tabIds,
		openTabOn,
		activate,
		pickRow: (id: string) => act(() => roster.select(id)),
		shownHref,
		openTab: () => mounted.result.current.sidebarTab.openTab,
		selectedRow: () =>
			roster.getState().selectedBotId ??
			roster.getState().selectedConversationId,
		shownMissionId: () => openedMission.getState()?.missionId ?? null,
		switchTo: (panel: "conversations" | "missions") =>
			act(() => mounted.result.current.sidebarTab.openSidebarTab(panel)),
	}
}

describe("activating a title bar tab", () => {
	it("puts the sidebar on Missions and shows the mission of a mission tab", async () => {
		const shown = await mountTabbedSwitch()
		const missionTab = shown.openTabOn(MISSION_HREF)

		shown.activate(missionTab)

		expect(shown.openTab()).toBe("missions")
		expect(shown.shownMissionId()).toBe("m-7")
		expect(shown.selectedRow()).toBe(MISSION_ROW)
	})

	it("puts the sidebar on Conversations and shows the thread of a companion tab", async () => {
		const shown = await mountTabbedSwitch()
		shown.switchTo("missions")

		shown.activate(shown.openTabOn(COMPANION_HREF))

		expect(shown.openTab()).toBe("conversations")
		expect(shown.shownMissionId()).toBeNull()
		expect(shown.selectedRow()).toBe("b-1")
	})

	it("follows the conversation tab shown once the active mission tab closes", async () => {
		const shown = await mountTabbedSwitch()
		shown.switchTo("missions")
		shown.openTabOn(C1_HREF)

		act(() => shown.tabs.closeActive())

		expect(shown.openTab()).toBe("conversations")
		expect(shown.shownMissionId()).toBeNull()
		expect(shown.selectedRow()).toBe("c-1")
	})

	it("puts the sidebar on Conversations and shows the thread of a conversation tab", async () => {
		const shown = await mountTabbedSwitch()
		const [conversationTab = ""] = shown.tabIds()
		shown.activate(shown.openTabOn(MISSION_HREF))

		shown.activate(conversationTab)

		expect(shown.openTab()).toBe("conversations")
		expect(shown.shownHref()).toBe(C1_HREF)
		expect(shown.shownMissionId()).toBeNull()
		expect(shown.selectedRow()).toBe("c-1")
	})

	it("keeps the panel picked when the tab holds no thread", async () => {
		const shown = await mountTabbedSwitch()
		shown.switchTo("missions")

		shown.activate(shown.openTabOn("/"))

		expect(shown.openTab()).toBe("missions")
	})
})

describe("opening Missions from its switch on a thread tab", () => {
	it("keeps the href and the thread of a conversation tab", async () => {
		const shown = await mountTabbedSwitch()

		shown.switchTo("missions")

		expect(shown.openTab()).toBe("missions")
		expect(shown.shownHref()).toBe(C1_HREF)
		expect(shown.shownMissionId()).toBeNull()
		expect(shown.selectedRow()).toBe("c-1")
	})

	it("keeps the href and the mission of a mission tab when Conversations opens", async () => {
		const shown = await mountTabbedSwitch()
		shown.activate(shown.openTabOn(MISSION_HREF))

		shown.switchTo("conversations")

		expect(shown.openTab()).toBe("conversations")
		expect(shown.shownHref()).toBe(MISSION_HREF)
		expect(shown.shownMissionId()).toBe("m-7")
		expect(shown.selectedRow()).toBe(MISSION_ROW)
	})

	it("keeps the href and the thread of a companion tab", async () => {
		const shown = await mountTabbedSwitch()
		shown.activate(shown.openTabOn(COMPANION_HREF))

		shown.switchTo("missions")

		expect(shown.openTab()).toBe("missions")
		expect(shown.shownHref()).toBe(COMPANION_HREF)
		expect(shown.shownMissionId()).toBeNull()
		expect(shown.selectedRow()).toBe("b-1")
	})

	it("keeps the sidebar on Missions when the shown tab is written a conversation", async () => {
		const shown = await mountTabbedSwitch()
		shown.switchTo("missions")

		act(() => shown.tabs.history.push(C1_HREF))

		expect(shown.openTab()).toBe("missions")
	})
})

const stripOf = (tabs: ReturnType<typeof createWorkspaceTabs>) =>
	shownTabsOf(tabs.getState())

describe("a sidebar row picked while a pinned tab is active", () => {
	it("opens it in a new tab, selects its row and leaves the pinned tab on its page", async () => {
		const shown = await mountTabbedSwitch()
		const [pinnedId = ""] = shown.tabIds()
		act(() => shown.tabs.pin(pinnedId))
		const pinnedBefore = stripOf(shown.tabs).tabs[0]

		shown.pickRow("b-1")

		const { tabs, activeId } = stripOf(shown.tabs)
		expect(tabs.map(currentHrefOf)).toEqual([C1_HREF, COMPANION_HREF])
		expect(tabs[0]).toEqual(pinnedBefore)
		expect(tabs[1]?.entries).toHaveLength(1)
		expect(activeId).toBe(tabs[1]?.id)
		expect(shown.selectedRow()).toBe("b-1")
	})

	it("activates the tab already showing it and selects its row", async () => {
		const shown = await mountTabbedSwitch()
		const [pinnedId = ""] = shown.tabIds()
		act(() => shown.tabs.pin(pinnedId))
		const companionTab = shown.openTabOn(COMPANION_HREF)
		const before = stripOf(shown.tabs).tabs

		shown.pickRow("b-1")

		expect(stripOf(shown.tabs).tabs).toEqual(before)
		expect(stripOf(shown.tabs).activeId).toBe(companionTab)
		expect(shown.selectedRow()).toBe("b-1")
	})
})
