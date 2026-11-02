import { Navigate, useParams, useSearch } from "@tanstack/react-router"

import { CompanionScreenHost } from "@/components/companion-screen-host"
import { ConversationScreenHost } from "@/components/conversation-screen-host"
import { SpaceSettingsScreen } from "@/components/space-settings-screen"
import { UserSettingsScreen } from "@/components/user-settings-screen"
import { settingsSpacesOf, spacePageOf } from "@/lib/spaces/settings-spaces"
import { useSettingsSpaceSwitch } from "@/lib/tabs/use-settings-space-switch"
import { ACCOUNT_TAB } from "@/lib/workspace/use-settings-panels"
import { useWorkspace } from "@/lib/workspace/workspace-context"
import { useWorkspaceFrame } from "@/lib/workspace/workspace-frame"

export const useWorkspaceSpaceSwitch = () => {
	const { core, rosterLines, tabs } = useWorkspace()
	return useSettingsSpaceSwitch({
		joinedSpaces: core.joinedSpaces.controller,
		sidebarActions: rosterLines.sidebarActions,
		spaces: core.spaces.controller,
		tabs,
	})
}

export const SpaceSettingsRoute = () => {
	const workspace = useWorkspace()
	const { core, navigation, rosterLines, switcher } = workspace
	const { spaceId } = useParams({ from: "/settings/space/$spaceId" })
	const search = useSearch({ from: "/settings/space/$spaceId" })
	const { frame } = useWorkspaceFrame()
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
	const { frame, rosterLists } = useWorkspaceFrame()

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
				badgesBySpaceId: rosterLists.badgesBySpaceId,
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
	const { frame } = useWorkspaceFrame()

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

export const ConversationSettingsRoute = () => {
	const workspace = useWorkspace()
	const search = useSearch({ from: "/settings/conversation/$conversationId" })
	const { frame } = useWorkspaceFrame()
	const conversation = workspace.rosterView.settingsConversation

	if (!conversation) {
		return <Navigate to="/" replace />
	}

	return (
		<ConversationScreenHost
			bots={workspace.rosterView.bots}
			conversation={conversation}
			core={workspace.core}
			frame={frame}
			navigation={workspace.navigation}
			rosterLines={workspace.rosterLines}
			search={search}
		/>
	)
}
