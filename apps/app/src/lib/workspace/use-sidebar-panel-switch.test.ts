// @vitest-environment happy-dom

import { invoke } from "@tauri-apps/api/core"
import { act, cleanup, renderHook } from "@testing-library/react"
import { useSyncExternalStore } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type {
	AppSidebarBot,
	AppSidebarConversation,
} from "@workspace/ui/components/app-sidebar"

import {
	type SidebarRosters,
	useSidebarPanelSwitch,
} from "./use-sidebar-panel-switch"

import { createStore } from "../store"
import type { RosterController } from "../bots/roster-controller"
import { createOpenedMissionController } from "../missions/opened-mission-controller"
import { createShownMemory } from "../sidebar/shown-memory"
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
		enter: (next: string, landing: Selection) =>
			store.setState({ spaceRowId: next, ...landing }),
	}
}

const aBot = (id: string, row: Partial<AppSidebarBot> = {}): AppSidebarBot => ({
	id,
	name: id,
	...row,
})

const aRoom = (
	id: string,
	row: Partial<AppSidebarConversation> = {},
): AppSidebarConversation => ({ id, name: id, participants: [], ...row })

const MISSION_ROW = "b-mission"

const ROSTERS: SidebarRosters = {
	botsBySpaceId: {
		"s-1": [aBot("b-1", { lastActivityAt: 1 }), aBot(MISSION_ROW)],
		"s-2": [aBot("b-3"), aBot("b-4")],
	},
	conversationsBySpaceId: { "s-1": [aRoom("c-1", { lastActivityAt: 5 })] },
	sectionsBySpaceId: {},
	collapsedSectionIds: [],
}

const ON_C1: Selection = { selectedBotId: null, selectedConversationId: "c-1" }

type Mount = {
	stored?: UserPreferences["sidebarTab"]
	sidebarRosters?: SidebarRosters
	loadedSpaceId?: string | null
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

const mountSwitch = async ({
	stored = "conversations",
	sidebarRosters = ROSTERS,
	loadedSpaceId = "s-1",
}: Mount = {}) => {
	answerPreferences(stored)
	const tabs = createWorkspaceTabs()
	const roster = aRoster("s-1", ON_C1)
	const openedMission = createOpenedMissionController(roster)
	const shownMemory = createShownMemory({ roster, openedMission })
	const showLastMission = vi.fn(() => {
		const { spaceRowId } = roster.getState()
		const missionId =
			shownMemory.lastMissionIn(spaceRowId) ?? `first-of-${spaceRowId}`
		openedMission.open({ missionId, rowId: MISSION_ROW })
		roster.select(MISSION_ROW)
	})
	const mounted = renderHook(
		(props: {
			loadedSpaceId: string | null
			sidebarRosters: SidebarRosters
		}) => {
			const user = useUser()
			const sidebarTab = useSidebarPanelSwitch({
				core: {
					openedMission,
					roster: { controller: roster },
					shownMemory,
					user,
				},
				sidebarMissions: {
					loadedSpaceId: props.loadedSpaceId,
					showLastMission,
				},
				tabs,
			})
			return { user, sidebarTab, sidebarRosters: props.sidebarRosters }
		},
		{ initialProps: { loadedSpaceId, sidebarRosters } },
	)
	await act(() => mounted.result.current.user.controller.load())
	roster.enter("s-1", ON_C1)

	const switchTo = (panel: "conversations" | "missions") =>
		act(() =>
			mounted.result.current.sidebarTab.openSidebarTab(
				panel,
				mounted.result.current.sidebarRosters,
			),
		)
	const selectedRow = () =>
		roster.getState().selectedBotId ?? roster.getState().selectedConversationId
	const shownMissionId = () => openedMission.getState()?.missionId ?? null

	return {
		...mounted,
		roster,
		openedMission,
		shownMemory,
		showLastMission,
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
	it("opens the mission the missions list reopens", async () => {
		const shown = await mountSwitch()

		shown.switchTo("missions")

		expect(shown.result.current.sidebarTab.openTab).toBe("missions")
		expect(shown.shownMissionId()).toBe("first-of-s-1")
	})

	it("reopens the last mission shown after a round trip through Conversations", async () => {
		const shown = await mountSwitch()
		act(() => shown.openedMission.open({ missionId: "m-7", rowId: "c-1" }))
		shown.switchTo("conversations")

		shown.switchTo("missions")

		expect(shown.shownMissionId()).toBe("m-7")
	})

	it("waits for the list of the space before opening a mission", async () => {
		const shown = await mountSwitch({ loadedSpaceId: null })

		shown.switchTo("missions")
		expect(shown.shownMissionId()).toBeNull()

		shown.rerender({ loadedSpaceId: "s-1", sidebarRosters: ROSTERS })

		expect(shown.shownMissionId()).toBe("first-of-s-1")
	})
})

describe("starting on the Missions tab", () => {
	it("opens the first mission once the list of the space has loaded", async () => {
		const shown = await mountSwitch({ stored: "missions", loadedSpaceId: null })
		expect(shown.result.current.sidebarTab.openTab).toBe("missions")
		expect(shown.shownMissionId()).toBeNull()

		shown.rerender({ loadedSpaceId: "s-1", sidebarRosters: ROSTERS })

		expect(shown.shownMissionId()).toBe("first-of-s-1")
		expect(shown.showLastMission).toHaveBeenCalledTimes(1)
	})

	it("opens it once, however often the screen renders", async () => {
		const shown = await mountSwitch({ stored: "missions" })

		shown.rerender({ loadedSpaceId: "s-1", sidebarRosters: ROSTERS })
		shown.rerender({ loadedSpaceId: "s-1", sidebarRosters: ROSTERS })

		expect(shown.showLastMission).toHaveBeenCalledTimes(1)
	})
})

describe("changing space on the Missions tab", () => {
	it("opens the last mission shown in the new space once its list has loaded", async () => {
		const shown = await mountSwitch({ stored: "missions" })
		act(() =>
			shown.openedMission.open({
				missionId: "m-9",
				rowId: "b-3",
				spaceId: "s-2",
			}),
		)
		act(() => shown.openedMission.leave())
		act(() =>
			shown.roster.enter("s-2", {
				selectedBotId: "b-3",
				selectedConversationId: null,
			}),
		)
		expect(shown.shownMissionId()).toBeNull()

		shown.rerender({ loadedSpaceId: "s-2", sidebarRosters: ROSTERS })

		expect(shown.shownMissionId()).toBe("m-9")
	})

	it("opens the first mission of a space never shown", async () => {
		const shown = await mountSwitch({ stored: "missions" })
		act(() =>
			shown.roster.enter("s-2", {
				selectedBotId: "b-3",
				selectedConversationId: null,
			}),
		)

		shown.rerender({ loadedSpaceId: "s-2", sidebarRosters: ROSTERS })

		expect(shown.shownMissionId()).toBe("first-of-s-2")
	})

	it("keeps a mission of the new space opened from elsewhere", async () => {
		const shown = await mountSwitch({ stored: "missions" })
		act(() => {
			shown.roster.enter("s-2", {
				selectedBotId: "b-3",
				selectedConversationId: null,
			})
			shown.openedMission.open({
				missionId: "m-9",
				rowId: "b-3",
				spaceId: "s-2",
			})
		})

		shown.rerender({ loadedSpaceId: "s-2", sidebarRosters: ROSTERS })

		expect(shown.shownMissionId()).toBe("m-9")
		expect(shown.showLastMission).toHaveBeenCalledTimes(1)
	})
})

describe("switching to the Conversations tab", () => {
	it("closes the mission and shows the last conversation shown", async () => {
		const shown = await mountSwitch()
		shown.switchTo("missions")

		shown.switchTo("conversations")

		expect(shown.result.current.sidebarTab.openTab).toBe("conversations")
		expect(shown.shownMissionId()).toBeNull()
		expect(shown.selectedRow()).toBe("c-1")
	})

	it("shows the most recent row when the last conversation shown is gone", async () => {
		const shown = await mountSwitch()
		shown.switchTo("missions")
		shown.rerender({
			loadedSpaceId: "s-1",
			sidebarRosters: {
				...ROSTERS,
				conversationsBySpaceId: {},
				botsBySpaceId: {
					"s-1": [
						aBot("b-old", { lastActivityAt: 1 }),
						aBot("b-new", { lastActivityAt: 9 }),
					],
				},
			},
		})

		shown.switchTo("conversations")

		expect(shown.selectedRow()).toBe("b-new")
	})

	it("falls back to the top row the sidebar displays, pins and sections first", async () => {
		const shown = await mountSwitch()
		shown.switchTo("missions")
		shown.rerender({
			loadedSpaceId: "s-1",
			sidebarRosters: {
				botsBySpaceId: {
					"s-1": [
						aBot("b-recent", { lastActivityAt: 9 }),
						aBot("b-folded", { sectionId: "sec-folded", pinPosition: 0 }),
						aBot("b-filed", { sectionId: "sec-open", pinPosition: 0 }),
					],
				},
				conversationsBySpaceId: {},
				sectionsBySpaceId: {
					"s-1": [
						{ id: "sec-folded", name: "Folded", position: 0 },
						{ id: "sec-open", name: "Open", position: 1 },
					],
				},
				collapsedSectionIds: ["sec-folded"],
			},
		})

		shown.switchTo("conversations")

		expect(shown.selectedRow()).toBe("b-filed")
	})

	it("puts a row waiting on the reader above a more recent one", async () => {
		const shown = await mountSwitch()
		shown.switchTo("missions")
		shown.rerender({
			loadedSpaceId: "s-1",
			sidebarRosters: {
				...ROSTERS,
				conversationsBySpaceId: {
					"s-1": [
						aRoom("c-waiting", {
							lastActivityAt: 1,
							missions: [
								{
									id: "m-1",
									state: "waiting",
									ticket: {
										platform: "linear",
										externalId: "T-1",
										title: "Ship",
									},
								},
							],
						}),
					],
				},
				botsBySpaceId: { "s-1": [aBot("b-recent", { lastActivityAt: 9 })] },
			},
		})

		shown.switchTo("conversations")

		expect(shown.selectedRow()).toBe("c-waiting")
	})

	it("shows no row and no mission when the space holds no conversation", async () => {
		const shown = await mountSwitch({
			sidebarRosters: {
				...ROSTERS,
				botsBySpaceId: {},
				conversationsBySpaceId: {},
			},
		})
		act(() =>
			shown.roster.enter("s-1", {
				selectedBotId: null,
				selectedConversationId: null,
			}),
		)
		act(() =>
			shown.openedMission.open({ missionId: "m-7", rowId: MISSION_ROW }),
		)

		shown.switchTo("conversations")

		expect(shown.shownMissionId()).toBeNull()
		expect(shown.selectedRow()).toBeNull()
	})

	it("reads the memory of the space shown after a space change", async () => {
		const shown = await mountSwitch()
		act(() =>
			shown.roster.enter("s-2", {
				selectedBotId: "b-3",
				selectedConversationId: null,
			}),
		)
		act(() => shown.roster.select("b-4"))
		shown.switchTo("missions")

		shown.switchTo("conversations")

		expect(shown.selectedRow()).toBe("b-4")
		expect(shown.shownMemory.lastRowIn("s-1")).toBe("c-1")
	})
})

describe("a mission opened from a thread card", () => {
	it("keeps the tab and the selection", async () => {
		const shown = await mountSwitch()

		act(() => shown.openedMission.open({ missionId: "m-7", rowId: "c-1" }))

		expect(shown.result.current.sidebarTab.openTab).toBe("conversations")
		expect(shown.selectedRow()).toBe("c-1")
		expect(shown.shownMemory.lastMissionIn("s-1")).toBe("m-7")
	})

	it("is remembered under its own space when it belongs to another", async () => {
		const shown = await mountSwitch()

		act(() =>
			shown.openedMission.open({
				missionId: "m-9",
				rowId: "b-3",
				spaceId: "s-2",
			}),
		)

		expect(shown.shownMemory.lastMissionIn("s-2")).toBe("m-9")
		expect(shown.shownMemory.lastMissionIn("s-1")).toBeNull()
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
	const shownMemory = createShownMemory({ roster, openedMission })
	const showLastMission = vi.fn(() => {
		openedMission.open({ missionId: "m-last", rowId: MISSION_ROW })
		roster.select(MISSION_ROW)
	})
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
			core: {
				openedMission,
				roster: { controller: roster },
				shownMemory,
				user,
			},
			sidebarMissions: { loadedSpaceId: "s-1", showLastMission },
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
		showLastMission,
		openTab: () => mounted.result.current.sidebarTab.openTab,
		selectedRow: () =>
			roster.getState().selectedBotId ??
			roster.getState().selectedConversationId,
		shownMissionId: () => openedMission.getState()?.missionId ?? null,
		switchTo: (panel: "conversations" | "missions") =>
			act(() =>
				mounted.result.current.sidebarTab.openSidebarTab(panel, ROSTERS),
			),
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
		expect(shown.showLastMission).not.toHaveBeenCalled()
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

	it("keeps the sidebar on a panel picked from its switch over the href written next", async () => {
		const shown = await mountTabbedSwitch()

		shown.switchTo("missions")

		expect(shown.shownHref()).toContain("mission=m-last")
		expect(shown.openTab()).toBe("missions")
		expect(shown.shownMissionId()).toBe("m-last")
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
