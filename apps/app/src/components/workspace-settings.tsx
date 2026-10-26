import { Navigate, useSearch } from "@tanstack/react-router"

import type { SettingsScreenRequestLeave } from "@workspace/ui/components/settings-screen"

import { CompanionScreenHost } from "@/components/companion-screen-host"
import { SpaceSettingsScreen } from "@/components/space-settings-screen"
import { UserSettingsScreen } from "@/components/user-settings-screen"
import { titleBarWindowControls } from "@/components/window-caption-controls"
import { WorkspaceRail } from "@/components/workspace-rail"
import { hasOverlayWindowControls, isSidebarResizable } from "@/lib/host"
import type { SettingsFrame } from "@/lib/workspace/settings-frame"
import { useRosterLists } from "@/lib/workspace/use-roster-lists"
import { useWorkspace } from "@/lib/workspace/workspace-context"

const useSettingsFrame = (
	onSelectSpace: (id: string) => void,
): SettingsFrame => {
	const workspace = useWorkspace()
	const { core, drivers, rosterLines, rosterView, sidebarMissions, switcher } =
		workspace
	const rosterLists = useRosterLists({
		core,
		drivers,
		rosterLines,
		rosterView,
		waitingMissionCount: sidebarMissions.waitingCount,
	})

	return {
		rail: (requestLeave: SettingsScreenRequestLeave) => (
			<WorkspaceRail
				collapsedSectionIds={workspace.collapsedSectionIds}
				core={core}
				navigation={workspace.navigation}
				overlay={workspace.overlay}
				panels={workspace.panels}
				requestLeave={requestLeave}
				rosterLines={rosterLines}
				rosterLists={rosterLists}
				sidebarTab={workspace.sidebarTab}
				space={switcher.selectedSpace}
			/>
		),
		titleBar: {
			"data-tauri-drag-region": "deep",
			insetWindowControls: hasOverlayWindowControls(),
			windowControls: titleBarWindowControls(),
			badgesBySpaceId: rosterLists.badgesBySpaceId,
			selectedSpaceId: switcher.selectedSpaceId ?? undefined,
			spaces: switcher.spaces,
			hostBySpaceId: switcher.hostBySpaceId,
			invitations: switcher.invitations,
			onAcceptInvitation: switcher.onAcceptInvitation,
			onDeclineInvitation: switcher.onDeclineInvitation,
			onRetryInvitation: switcher.onRetryInvitation,
			onSpaceSwitcherOpenChange: switcher.onSpaceSwitcherOpenChange,
			onCreateSpace: rosterLines.sidebarActions.onCreateSpace,
			onSelectSpace,
		},
		width: core.preferences.sidebarWidth ?? undefined,
		onWidthChange: workspace.overlay.changeSidebarWidth,
		isResizable: isSidebarResizable(),
	}
}

export const SpaceSettingsRoute = () => {
	const workspace = useWorkspace()
	const search = useSearch({ from: "/settings/space" })
	const frame = useSettingsFrame(
		workspace.rosterLines.sidebarActions.onSelectSpace,
	)

	return (
		<SpaceSettingsScreen
			core={workspace.core}
			frame={frame}
			navigation={workspace.navigation}
			panels={workspace.panels}
			rosterLines={workspace.rosterLines}
			rosterView={workspace.rosterView}
			scopes={workspace.scopes}
			search={search}
		/>
	)
}

export const UserSettingsRoute = () => {
	const workspace = useWorkspace()
	const search = useSearch({ from: "/settings/user" })
	const frame = useSettingsFrame(
		workspace.rosterLines.sidebarActions.onSelectSpace,
	)

	return (
		<UserSettingsScreen
			about={workspace.about}
			core={workspace.core}
			frame={frame}
			navigation={workspace.navigation}
			overlay={workspace.overlay}
			panels={workspace.panels}
			scopes={workspace.scopes}
			search={search}
		/>
	)
}

export const CompanionSettingsRoute = () => {
	const workspace = useWorkspace()
	const search = useSearch({ from: "/settings/companion/$companionId" })
	const { navigation, rosterLines } = workspace
	const frame = useSettingsFrame((id) => {
		rosterLines.sidebarActions.onSelectSpace(id)
		navigation.openConversations()
	})

	if (!workspace.rosterView.settingsBot) {
		return <Navigate to="/" replace />
	}

	return (
		<CompanionScreenHost
			core={workspace.core}
			frame={frame}
			navigation={navigation}
			panels={workspace.panels}
			rosterLines={rosterLines}
			rosterView={workspace.rosterView}
			scopes={workspace.scopes}
			search={search}
		/>
	)
}
