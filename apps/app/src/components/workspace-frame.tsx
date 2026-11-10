import { Outlet, useMatch } from "@tanstack/react-router"
import { useMemo } from "react"

import { AppTitleBar } from "@workspace/ui/components/app-title-bar"
import { useSettingsLeaveGuard } from "@workspace/ui/components/settings-screen"
import type { TitleBarTabsProps } from "@workspace/ui/components/title-bar-tabs"
import { WorkspaceShellRoot } from "@workspace/ui/components/workspace-shell"

import { titleBarWindowControls } from "@/components/window-caption-controls"
import { useWorkspaceNavigation } from "@/components/workspace-navigation"
import { WorkspaceNavigationSidebar } from "@/components/workspace-navigation-sidebar"
import { useWorkspaceSpaceSwitch } from "@/components/workspace-settings"
import { hasOverlayWindowControls, isSidebarResizable } from "@/lib/host"
import type { WorkspaceTabs } from "@/lib/tabs/workspace-tabs"
import { useSidebarCollapse } from "@/lib/user/use-sidebar-collapse"
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

const useSwitcherSpaceSelection = () => {
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
	const onSelectSpace = useSwitcherSpaceSelection()
	const { gestures, selectedSpaceId } = useWorkspaceNavigation({
		navigation: workspace.navigation,
		overlay: workspace.overlay,
		rosterLines,
		rosterLists,
		switcher: workspace.switcher,
		tabs,
		onSelectSpace,
	})
	const collapse = useSidebarCollapse({
		isCollapsed: core.preferences.sidebarCollapsed,
		controller: core.user.controller,
	})

	const frame: WorkspaceFrame = {
		gestures,
		selectedSpaceId,
		collapse,
		guardLeave: tabs.guardLeave,
		titleBar: {
			"data-tauri-drag-region": "deep",
			insetWindowControls: hasOverlayWindowControls(),
			windowControls: titleBarWindowControls(),
			...titleBarTabs,
			...askedGestures,
			onToggleSidebar: collapse.toggle,
		},
		width: core.preferences.sidebarWidth ?? undefined,
		onWidthChange: workspace.overlay.changeSidebarWidth,
		isResizable: isSidebarResizable(),
		spaceTint: workspace.scopes.spaceHue,
	}
	return { frame, rosterLists }
}

export const WorkspaceFrameOutlet = () => {
	const { frame, rosterLists } = useWorkspaceFrameRead()
	const leaveGuard = useSettingsLeaveGuard({
		rail: frame.gestures,
		titleBar: frame.titleBar,
		guardLeave: frame.guardLeave,
	})
	const guardedFrame: WorkspaceFrame = {
		...frame,
		gestures: leaveGuard.rail,
		titleBar: leaveGuard.titleBar,
		guardLeave: leaveGuard.guardLeave,
	}

	return (
		<WorkspaceFrameContext.Provider
			value={{ frame: guardedFrame, rosterLists }}
		>
			<WorkspaceShellRoot
				isResizable={guardedFrame.isResizable}
				onOpenChange={guardedFrame.collapse.changeOpen}
				onWidthChange={guardedFrame.onWidthChange}
				open={guardedFrame.collapse.isOpen}
				spaceTint={guardedFrame.spaceTint}
				width={guardedFrame.width}
			>
				<AppTitleBar {...guardedFrame.titleBar} />
				<WorkspaceNavigationSidebar
					gestures={guardedFrame.gestures}
					rosterLists={rosterLists}
					selectedSpaceId={guardedFrame.selectedSpaceId}
				/>
				<Outlet />
			</WorkspaceShellRoot>
		</WorkspaceFrameContext.Provider>
	)
}
