import { useCallback, useEffect, useRef } from "react"

import type {
	AppSidebarBot,
	AppSidebarConversation,
	AppSidebarSection,
} from "@workspace/ui/components/app-sidebar"

import type { RosterController } from "../bots/roster-controller"
import type { OpenedMissionController } from "../missions/opened-mission-controller"
import type { ShownMemory } from "../sidebar/shown-memory"
import { type DisplayedRoster, topRowIdOf } from "../sidebar/top-row"
import { isListPage, pageOf, threadRowIdOf } from "../tabs/tab-pages"
import { activeTabOf, currentHrefOf } from "../tabs/tabs-model"
import type { WorkspaceTabs, WorkspaceTabsState } from "../tabs/workspace-tabs"
import { type SidebarPanel, useSidebarTab } from "../user/use-sidebar-tab"
import type { User } from "../user/use-user"

type PanelRoster = Pick<RosterController, "select" | "selectConversation"> & {
	getState: () => { spaceRowId: string | null }
}

type PanelMemory = Pick<ShownMemory, "lastRowIn">

type SidebarPanelSwitchCore = {
	openedMission: Pick<OpenedMissionController, "getState" | "leave">
	roster: { controller: PanelRoster }
	shownMemory: PanelMemory
	user: User
}

export type SidebarRosters = {
	botsBySpaceId: Record<string, AppSidebarBot[]>
	conversationsBySpaceId: Record<string, AppSidebarConversation[]>
	sectionsBySpaceId: Record<string, AppSidebarSection[]>
	collapsedSectionIds: string[]
}

type ActivatedTabs = Pick<WorkspaceTabs, "getState" | "subscribe">

type SidebarPanelSwitchInput = {
	core: SidebarPanelSwitchCore
	sidebarMissions: {
		loadedSpaceId: string | null
		showLastMission: () => void
	}
	tabs: ActivatedTabs
}

const displayedIn = (
	sidebarRosters: SidebarRosters,
	spaceId: string,
): DisplayedRoster => ({
	bots: sidebarRosters.botsBySpaceId[spaceId] ?? [],
	conversations: sidebarRosters.conversationsBySpaceId[spaceId] ?? [],
	sections: sidebarRosters.sectionsBySpaceId[spaceId] ?? [],
	collapsedSectionIds: sidebarRosters.collapsedSectionIds,
})

const isDisplayed = (displayedRoster: DisplayedRoster, rowId: string | null) =>
	[...displayedRoster.bots, ...displayedRoster.conversations].some(
		({ id }) => id === rowId,
	)

const showLastConversation = (
	roster: PanelRoster,
	shownMemory: PanelMemory,
	sidebarRosters: SidebarRosters,
) => {
	const { spaceRowId } = roster.getState()
	if (spaceRowId === null) {
		return
	}
	const displayedRoster = displayedIn(sidebarRosters, spaceRowId)
	const lastRowId = shownMemory.lastRowIn(spaceRowId)
	const rowId = isDisplayed(displayedRoster, lastRowId)
		? lastRowId
		: topRowIdOf(displayedRoster)
	if (rowId === null) {
		return
	}
	if (displayedRoster.bots.some(({ id }) => id === rowId)) {
		roster.select(rowId)
	} else {
		roster.selectConversation(rowId)
	}
}

const panelOfPage = (href: string): SidebarPanel | null => {
	const page = pageOf(href)
	if (!isListPage(page) || threadRowIdOf(page.thread) === undefined) {
		return null
	}
	return page.thread.mission === undefined ? "conversations" : "missions"
}

const activatedPanelOf = (
	before: WorkspaceTabsState,
	after: WorkspaceTabsState,
) => {
	const space = after.bySpace[after.spaceId]
	if (
		space === undefined ||
		after.spaceId !== before.spaceId ||
		space.activeId === before.bySpace[before.spaceId]?.activeId
	) {
		return null
	}
	return panelOfPage(currentHrefOf(activeTabOf(space)))
}

const usePanelFollowingTabs = (
	tabs: ActivatedTabs,
	followPanel: (panel: SidebarPanel) => void,
) => {
	useEffect(() => {
		let shown = tabs.getState()
		return tabs.subscribe(() => {
			const before = shown
			shown = tabs.getState()
			const panel = activatedPanelOf(before, shown)
			if (panel !== null) {
				followPanel(panel)
			}
		})
	}, [tabs, followPanel])
}

export const useSidebarPanelSwitch = ({
	core,
	sidebarMissions,
	tabs,
}: SidebarPanelSwitchInput) => {
	const { openedMission, roster, shownMemory, user } = core
	const { openTab, openSidebarTab } = useSidebarTab(user)
	const { loadedSpaceId, showLastMission } = sidebarMissions
	const missionsShownForSpaceId = useRef<string | null>(null)

	useEffect(() => {
		if (
			openTab !== "missions" ||
			loadedSpaceId === null ||
			missionsShownForSpaceId.current === loadedSpaceId
		) {
			return
		}
		missionsShownForSpaceId.current = loadedSpaceId
		if (!openedMission.getState()) {
			showLastMission()
		}
	}, [openTab, loadedSpaceId, openedMission, showLastMission])

	const followPanel = useCallback(
		(panel: SidebarPanel) => {
			openSidebarTab(panel)
			missionsShownForSpaceId.current =
				panel === "missions" ? loadedSpaceId : null
		},
		[openSidebarTab, loadedSpaceId],
	)
	usePanelFollowingTabs(tabs, followPanel)

	const switchPanel = useCallback(
		(panel: SidebarPanel, sidebarRosters: SidebarRosters) => {
			openSidebarTab(panel)
			if (panel === "missions") {
				return
			}
			missionsShownForSpaceId.current = null
			openedMission.leave()
			showLastConversation(roster.controller, shownMemory, sidebarRosters)
		},
		[openSidebarTab, openedMission, roster.controller, shownMemory],
	)

	return { openTab, openSidebarTab: switchPanel }
}
