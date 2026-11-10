import { createContext, useContext } from "react"

import type { AppFrameRailProps } from "@workspace/ui/components/app-frame"
import type { AppTitleBarProps } from "@workspace/ui/components/app-title-bar"
import type { SettingsScreenRequestLeave } from "@workspace/ui/components/settings-screen"
import type { Space } from "@workspace/ui/components/space"

import type { RosterLists } from "./use-roster-lists"

import type { SidebarCollapse } from "../user/use-sidebar-collapse"

export type WorkspaceFrame = {
	gestures: AppFrameRailProps
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
