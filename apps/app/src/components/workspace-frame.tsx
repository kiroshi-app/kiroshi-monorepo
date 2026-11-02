import { Outlet, useMatch } from "@tanstack/react-router"
import { useMemo } from "react"

import type { TitleBarTabsProps } from "@workspace/ui/components/title-bar-tabs"

import { titleBarWindowControls } from "@/components/window-caption-controls"
import { useWorkspaceRail } from "@/components/workspace-rail"
import { useWorkspaceSpaceSwitch } from "@/components/workspace-settings"
import { hasOverlayWindowControls, isSidebarResizable } from "@/lib/host"
import type { WorkspaceTabs } from "@/lib/tabs/workspace-tabs"
import { useRosterLists } from "@/lib/workspace/use-roster-lists"
import { useWorkspaceTitleBarTabs } from "@/lib/workspace/use-workspace-title-bar-tabs"
import { useWorkspace } from "@/lib/workspace/workspace-context"
import {
	type WorkspaceFrame,
	WorkspaceFrameContext,
	type WorkspaceFrameRead,
} from "@/lib/workspace/workspace-frame"

type GesturesAskedByLeaveGuard = Pick<
	TitleBarTabsProps,
	"onSelectTab" | "onCloseTab" | "onNewTab" | "onGoBack" | "onGoForward"
>

const gesturesAskedByLeaveGuard = (
	tabs: WorkspaceTabs,
): GesturesAskedByLeaveGuard => ({
	onSelectTab: (id) => tabs.leaveAsked(() => tabs.select(id)),
	onCloseTab: (id) => tabs.leaveAsked(() => tabs.closeUnpinned(id)),
	onNewTab: () => tabs.leaveAsked(tabs.openEmptyTab),
	onGoBack: () => tabs.leaveAsked(tabs.back),
	onGoForward: () => tabs.leaveAsked(tabs.forward),
})

const useRailSpaceSelection = () => {
	const { navigation, rosterLines } = useWorkspace()
	const spaceSwitch = useWorkspaceSpaceSwitch()
	const spaceSettings = useMatch({
		from: "/settings/space/$spaceId",
		shouldThrow: false,
	})
	const companionSettings = useMatch({
		from: "/settings/companion/$companionId",
		shouldThrow: false,
	})
	const conversationSettings = useMatch({
		from: "/settings/conversation/$conversationId",
		shouldThrow: false,
	})

	if (spaceSettings) {
		return (id: string) => {
			spaceSwitch.switchSpace(id)
			navigation.openSpaceSettings(id, { entry: spaceSettings.search.entry })
		}
	}
	if (companionSettings || conversationSettings) {
		return spaceSwitch.switchSpace
	}
	return rosterLines.sidebarActions.onSelectSpace
}

const useWorkspaceFrameRead = (): WorkspaceFrameRead => {
	const workspace = useWorkspace()
	const { core, drivers, rosterLines, rosterView, sidebarMissions, tabs } =
		workspace
	const rosterLists = useRosterLists({
		core,
		drivers,
		rosterLines,
		rosterView,
		waitingMissionCount: sidebarMissions.waitingCount,
	})
	const titleBarTabs = useWorkspaceTitleBarTabs({
		core,
		rosterLists,
		rosterView,
		tabs,
	})
	const askedGestures = useMemo(() => gesturesAskedByLeaveGuard(tabs), [tabs])
	const onSelectSpace = useRailSpaceSelection()
	const rail = useWorkspaceRail({
		collapsedSectionIds: workspace.collapsedSectionIds,
		core,
		navigation: workspace.navigation,
		overlay: workspace.overlay,
		panels: workspace.panels,
		rosterLines,
		rosterLists,
		sidebarTab: workspace.sidebarTab,
		switcher: workspace.switcher,
		tabs,
		onSelectSpace,
	})

	const frame: WorkspaceFrame = {
		...rail,
		guardLeave: tabs.guardLeave,
		titleBar: {
			"data-tauri-drag-region": "deep",
			insetWindowControls: hasOverlayWindowControls(),
			windowControls: titleBarWindowControls(),
			...titleBarTabs,
			...askedGestures,
		},
		width: core.preferences.sidebarWidth ?? undefined,
		onWidthChange: workspace.overlay.changeSidebarWidth,
		isResizable: isSidebarResizable(),
		spaceTint: workspace.scopes.spaceHue,
	}
	return { frame, rosterLists }
}

export const WorkspaceFrameOutlet = () => {
	const workspaceFrame = useWorkspaceFrameRead()

	return (
		<WorkspaceFrameContext.Provider value={workspaceFrame}>
			<Outlet />
		</WorkspaceFrameContext.Provider>
	)
}
