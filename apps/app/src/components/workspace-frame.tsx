import { Outlet, useMatch } from "@tanstack/react-router"

import { AppTitleBar } from "@workspace/ui/components/app-title-bar"
import { useLeaveGuard } from "@workspace/ui/components/settings-screen"
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
	type WorkspaceSidebarNavigation,
	type WorkspaceSidebarRowMenu,
} from "@/lib/workspace/workspace-frame"

type AskFirst = ReturnType<typeof useLeaveGuard>["askFirst"]

type TabGestures = Required<
	Pick<
		TitleBarTabsProps,
		"onSelectTab" | "onCloseTab" | "onNewTab" | "onGoBack" | "onGoForward"
	>
>

const tabGesturesAskingFirst = (
	tabs: WorkspaceTabs,
	activeTabId: string | undefined,
	askFirst: AskFirst,
): TabGestures => {
	const isActive = (id: string) => id === activeTabId
	const select = (id: string) => tabs.leaveAsked(() => tabs.select(id))
	const close = (id: string) => tabs.leaveAsked(() => tabs.closeUnpinned(id))
	const selectAskingFirst = askFirst(select)
	const closeAskingFirst = askFirst(close)

	return {
		onSelectTab: (id) => (isActive(id) ? select(id) : selectAskingFirst(id)),
		onCloseTab: (id) => (isActive(id) ? closeAskingFirst(id) : close(id)),
		onNewTab: askFirst(() => tabs.leaveAsked(tabs.openEmptyTab)),
		onGoBack: askFirst(() => tabs.leaveAsked(tabs.back)),
		onGoForward: askFirst(() => tabs.leaveAsked(tabs.forward)),
	}
}

const sidebarAskingFirst = (
	sidebar: WorkspaceSidebarNavigation,
	askFirst: AskFirst,
): WorkspaceSidebarNavigation => ({
	...sidebar,
	onSelectSpace: askFirst(sidebar.onSelectSpace),
	onOpenSpaceSettings: askFirst(sidebar.onOpenSpaceSettings),
	onOpenSettings: askFirst(sidebar.onOpenSettings),
	onNewConversation: askFirst(sidebar.onNewConversation),
	onSelectMissions: askFirst(sidebar.onSelectMissions),
	onSelectLibrary: askFirst(sidebar.onSelectLibrary),
	onOpenConversation: askFirst(sidebar.onOpenConversation),
})

const rowMenuAskingFirst = (
	rowMenu: WorkspaceSidebarRowMenu,
	askFirst: AskFirst,
): WorkspaceSidebarRowMenu => ({
	...rowMenu,
	onOpenSettings: askFirst(rowMenu.onOpenSettings),
	onOpenAgentDangerZone: askFirst(rowMenu.onOpenAgentDangerZone),
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
	const { askFirst, guardLeave } = useLeaveGuard({
		guardLeave: tabs.guardLeave,
	})
	const onSelectSpace = useSwitcherSpaceSelection()
	const { sidebar, rowMenu, selectedSpaceId } = useWorkspaceNavigation({
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
		sidebar: sidebarAskingFirst(sidebar, askFirst),
		rowMenu: rowMenuAskingFirst(rowMenu, askFirst),
		selectedSpaceId,
		collapse,
		guardLeave,
		titleBar: {
			"data-tauri-drag-region": "deep",
			insetWindowControls: hasOverlayWindowControls(),
			windowControls: titleBarWindowControls(),
			...titleBarTabs,
			...tabGesturesAskingFirst(tabs, titleBarTabs.activeTabId, askFirst),
			onToggleSidebar: collapse.toggle,
			onOpenSearch: workspace.overlay.search.open,
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

	return (
		<WorkspaceFrameContext.Provider value={{ frame, rosterLists }}>
			<WorkspaceShellRoot
				isResizable={frame.isResizable}
				onOpenChange={frame.collapse.changeOpen}
				onWidthChange={frame.onWidthChange}
				open={frame.collapse.isOpen}
				spaceTint={frame.spaceTint}
				width={frame.width}
			>
				<AppTitleBar {...frame.titleBar} />
				<WorkspaceNavigationSidebar />
				<Outlet />
			</WorkspaceShellRoot>
		</WorkspaceFrameContext.Provider>
	)
}
