import { useEffect } from "react"

import { isListPage, pageOf, threadRowIdOf } from "../tabs/tab-pages"
import { activeTabOf, currentHrefOf } from "../tabs/tabs-model"
import type { WorkspaceTabs, WorkspaceTabsState } from "../tabs/workspace-tabs"
import { type SidebarPanel, useSidebarTab } from "../user/use-sidebar-tab"
import type { User } from "../user/use-user"

type ActivatedTabs = Pick<WorkspaceTabs, "getState" | "subscribe">

type SidebarPanelSwitchInput = {
	core: { user: User }
	tabs: ActivatedTabs
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
	tabs,
}: SidebarPanelSwitchInput) => {
	const sidebarTab = useSidebarTab(core.user)
	usePanelFollowingTabs(tabs, sidebarTab.openSidebarTab)
	return sidebarTab
}
