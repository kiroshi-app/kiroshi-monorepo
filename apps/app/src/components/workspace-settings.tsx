import { Navigate, useParams, useSearch } from "@tanstack/react-router"

import type { SettingsScreenRequestLeave } from "@workspace/ui/components/settings-screen"
import type { TitleBarTabsProps } from "@workspace/ui/components/title-bar-tabs"

import { CompanionScreenHost } from "@/components/companion-screen-host"
import { SpaceSettingsScreen } from "@/components/space-settings-screen"
import { UserSettingsScreen } from "@/components/user-settings-screen"
import { titleBarWindowControls } from "@/components/window-caption-controls"
import { WorkspaceRail } from "@/components/workspace-rail"
import { hasOverlayWindowControls, isSidebarResizable } from "@/lib/host"
import { settingsSpacesOf, spacePageOf } from "@/lib/spaces/settings-spaces"
import { useSettingsSpaceSwitch } from "@/lib/tabs/use-settings-space-switch"
import type { WorkspaceTabs } from "@/lib/tabs/workspace-tabs"
import type { SettingsFrame } from "@/lib/workspace/settings-frame"
import {
	type RosterLists,
	useRosterLists,
} from "@/lib/workspace/use-roster-lists"
import { ACCOUNT_TAB } from "@/lib/workspace/use-settings-panels"
import { useWorkspaceTitleBarTabs } from "@/lib/workspace/use-workspace-title-bar-tabs"
import { useWorkspace } from "@/lib/workspace/workspace-context"

const useWorkspaceSpaceSwitch = () => {
	const { core, rosterLines, tabs } = useWorkspace()
	return useSettingsSpaceSwitch({
		joinedSpaces: core.joinedSpaces.controller,
		sidebarActions: rosterLines.sidebarActions,
		spaces: core.spaces.controller,
		tabs,
	})
}

type GesturesAskedBySettings = Pick<
	TitleBarTabsProps,
	"onSelectTab" | "onCloseTab" | "onNewTab" | "onGoBack" | "onGoForward"
>

const gesturesAskedBySettings = (
	tabs: WorkspaceTabs,
): GesturesAskedBySettings => ({
	onSelectTab: (id) => tabs.leaveAsked(() => tabs.select(id)),
	onCloseTab: (id) => tabs.leaveAsked(() => tabs.close(id)),
	onNewTab: () => tabs.leaveAsked(tabs.openEmptyTab),
	onGoBack: () => tabs.leaveAsked(tabs.back),
	onGoForward: () => tabs.leaveAsked(tabs.forward),
})

type SettingsFrameRead = {
	frame: SettingsFrame
	badgesBySpaceId: RosterLists["badgesBySpaceId"]
}

const useSettingsFrame = (
	onSelectSpace: (id: string) => void,
): SettingsFrameRead => {
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
	const titleBarTabs = useWorkspaceTitleBarTabs({
		core,
		rosterLists,
		rosterView,
		tabs: workspace.tabs,
	})

	const frame: SettingsFrame = {
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
				switcher={switcher}
				tabs={workspace.tabs}
				onSelectSpace={onSelectSpace}
			/>
		),
		titleBar: {
			"data-tauri-drag-region": "deep",
			insetWindowControls: hasOverlayWindowControls(),
			windowControls: titleBarWindowControls(),
			...titleBarTabs,
			...gesturesAskedBySettings(workspace.tabs),
		},
		width: core.preferences.sidebarWidth ?? undefined,
		onWidthChange: workspace.overlay.changeSidebarWidth,
		isResizable: isSidebarResizable(),
		spaceTint: workspace.scopes.spaceTint,
	}
	return { frame, badgesBySpaceId: rosterLists.badgesBySpaceId }
}

export const SpaceSettingsRoute = () => {
	const workspace = useWorkspace()
	const { core, navigation, rosterLines, switcher } = workspace
	const { spaceId } = useParams({ from: "/settings/space/$spaceId" })
	const search = useSearch({ from: "/settings/space/$spaceId" })
	const spaceSwitch = useWorkspaceSpaceSwitch()
	const { frame } = useSettingsFrame((id) => {
		spaceSwitch.switchSpace(id)
		navigation.openSpaceSettings(id, { entry: search.entry })
	})
	const page = spacePageOf(spaceId, {
		spaces: core.spaces.state.spaces,
		joinedSpaces: core.joinedSpaces.state.joinedSpaces,
		invitations: core.invitations,
	})

	if (page.state === "gone") {
		return (
			<Navigate to="/settings/user" search={{ entry: ACCOUNT_TAB }} replace />
		)
	}

	if (page.state === "accepted") {
		return (
			<Navigate
				to="/settings/space/$spaceId"
				params={{ spaceId: page.rowId }}
				search={search}
				replace
			/>
		)
	}

	return (
		<SpaceSettingsScreen
			core={core}
			frame={frame}
			hostBySpaceId={switcher.hostBySpaceId}
			navigation={navigation}
			page={page}
			panels={workspace.panels}
			rosterLines={rosterLines}
			rosterView={workspace.rosterView}
			scopes={workspace.scopes}
			search={search}
			spaceId={spaceId}
			switcherSpaces={switcher.spaces}
		/>
	)
}

export const UserSettingsRoute = () => {
	const workspace = useWorkspace()
	const search = useSearch({ from: "/settings/user" })
	const spaceSwitch = useWorkspaceSpaceSwitch()
	const { frame, badgesBySpaceId } = useSettingsFrame(
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
			spaces={settingsSpacesOf({
				...workspace.switcher,
				badgesBySpaceId,
			})}
			currentSpaceId={workspace.switcher.selectedSpaceId ?? undefined}
			onCreateSpace={() => {
				void spaceSwitch.createSpace(() =>
					workspace.navigation.openUserSettings(search),
				)
			}}
		/>
	)
}

export const CompanionSettingsRoute = () => {
	const workspace = useWorkspace()
	const search = useSearch({ from: "/settings/companion/$companionId" })
	const { navigation, rosterLines } = workspace
	const spaceSwitch = useWorkspaceSpaceSwitch()
	const { frame } = useSettingsFrame(spaceSwitch.switchSpace)

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
