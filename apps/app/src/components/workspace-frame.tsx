import { Outlet, useMatch } from "@tanstack/react-router"
import { useMemo } from "react"

import {
	type AppFrameRailProps,
	AppFrameShell,
} from "@workspace/ui/components/app-frame"
import { useSettingsLeaveGuard } from "@workspace/ui/components/settings-screen"
import type { TitleBarTabsProps } from "@workspace/ui/components/title-bar-tabs"

import { titleBarWindowControls } from "@/components/window-caption-controls"
import { useWorkspaceRail } from "@/components/workspace-rail"
import { useWorkspaceSpaceSwitch } from "@/components/workspace-settings"
import { hasOverlayWindowControls, isSidebarResizable } from "@/lib/host"
import type { WorkspaceTabs } from "@/lib/tabs/workspace-tabs"
import type { SidebarPanel } from "@/lib/user/use-sidebar-tab"
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

type RailPanelGestures = Pick<
	AppFrameRailProps,
	"onSelectConversations" | "onSelectMissions"
>

const useConversationsRailPanels = (): RailPanelGestures | undefined => {
	const { sidebarTab } = useWorkspace()
	const conversations = useMatch({ from: "/", shouldThrow: false })

	if (!conversations) return undefined
	const switchTo = (panel: SidebarPanel) => () =>
		sidebarTab.openSidebarTab(panel)
	return {
		onSelectConversations: switchTo("conversations"),
		onSelectMissions: switchTo("missions"),
	}
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

	const conversationsRailPanels = useConversationsRailPanels()

	const frame: WorkspaceFrame = {
		...rail,
		rail: {
			...rail.rail,
			"data-tauri-drag-region": "deep",
			...conversationsRailPanels,
		},
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
	const { frame, rosterLists } = useWorkspaceFrameRead()
	const leaveGuard = useSettingsLeaveGuard(frame)
	const guardedFrame: WorkspaceFrame = { ...frame, ...leaveGuard }

	return (
		<WorkspaceFrameContext.Provider
			value={{ frame: guardedFrame, rosterLists }}
		>
			<AppFrameShell
				isResizable={guardedFrame.isResizable}
				onWidthChange={guardedFrame.onWidthChange}
				rail={guardedFrame.rail}
				space={guardedFrame.currentSpace}
				spaceHost={guardedFrame.currentSpaceHost}
				spaceTint={guardedFrame.spaceTint}
				titleBar={guardedFrame.titleBar}
				width={guardedFrame.width}
			>
				<Outlet />
			</AppFrameShell>
		</WorkspaceFrameContext.Provider>
	)
}
