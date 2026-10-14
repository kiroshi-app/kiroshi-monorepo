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

type SidebarPanelSwitchInput = {
	core: SidebarPanelSwitchCore
	sidebarMissions: {
		loadedSpaceId: string | null
		showLastMission: () => void
	}
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

export const useSidebarPanelSwitch = ({
	core,
	sidebarMissions,
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
