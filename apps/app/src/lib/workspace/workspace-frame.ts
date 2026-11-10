import { createContext, useContext } from "react"

import type { AppTitleBarProps } from "@workspace/ui/components/app-title-bar"
import type { NavigationSidebarProps } from "@workspace/ui/components/navigation-sidebar"
import type { SettingsScreenRequestLeave } from "@workspace/ui/components/settings-screen"
import type { Space } from "@workspace/ui/components/space"

import type { RosterLists } from "./use-roster-lists"

import type { SidebarCollapse } from "../user/use-sidebar-collapse"

type SidebarNavigateKey =
	| "onSelectSpace"
	| "onOpenSpaceSettings"
	| "onOpenSettings"
	| "onNewConversation"
	| "onSelectMissions"
	| "onSelectLibrary"
	| "onOpenConversation"
	| "onOpenMission"

type SidebarSwitcherKey =
	| "badgesBySpaceId"
	| "hostBySpaceId"
	| "invitations"
	| "onAcceptInvitation"
	| "onCreateSpace"
	| "onDeclineInvitation"
	| "onRetryInvitation"
	| "onOpenChange"
	| "onOpenSearch"
	| "spaces"
	| "user"

export type WorkspaceSidebarNavigation = Required<
	Pick<NavigationSidebarProps, SidebarNavigateKey>
> &
	Pick<NavigationSidebarProps, SidebarSwitcherKey>

export type WorkspaceSidebarRowMenu = {
	isAgent: (id: string) => boolean
	onOpenInNewTab: (id: string) => void
	onOpenSettings: (id: string) => void
	onOpenAgentDangerZone: (id: string) => void
}

export type WorkspaceFrame = {
	sidebar: WorkspaceSidebarNavigation
	rowMenu: WorkspaceSidebarRowMenu
	selectedSpaceId: string | undefined
	collapse: SidebarCollapse
	guardLeave: (requestLeave: SettingsScreenRequestLeave) => () => void
	titleBar: AppTitleBarProps
	width: number | undefined
	onWidthChange: (width: number) => void
	isResizable: boolean
	spaceTint: Space["colour"]
}

export type WorkspaceFrameRead = {
	frame: WorkspaceFrame
	rosterLists: RosterLists
}

export const WorkspaceFrameContext = createContext<WorkspaceFrameRead | null>(
	null,
)

export const useWorkspaceFrame = () => {
	const workspaceFrame = useContext(WorkspaceFrameContext)
	if (!workspaceFrame) {
		throw new Error("useWorkspaceFrame is read outside the workspace frame")
	}
	return workspaceFrame
}
