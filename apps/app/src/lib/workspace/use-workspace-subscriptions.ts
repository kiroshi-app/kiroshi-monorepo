import { useEffect } from "react"

import type { ApplicationScopes } from "./use-application-scopes"
import type { RosterView } from "./use-roster-view"
import { useSpaceSettingsReads } from "./use-settings-reads"
import type { WorkspaceCore } from "./use-workspace-core"
import type { WorkspaceDrivers } from "./use-workspace-drivers"
import { USER_OWNER } from "./user-owner"

import { useDirectoryWatch } from "../applications/use-directory-watch"
import { useCompanionSettings } from "../bots/use-companion-settings"
import { useCompanionAnnouncements } from "../companions/use-companion-announcements"
import { useCompanionArrivals } from "../conversations/use-companion-arrivals"

type WorkspaceSubscriptionsInput = {
	core: WorkspaceCore
	drivers: WorkspaceDrivers
	rosterView: RosterView
	scopes: ApplicationScopes
}

export const useWorkspaceSubscriptions = ({
	core,
	drivers,
	rosterView,
	scopes,
}: WorkspaceSubscriptionsInput) => {
	const {
		applications,
		botConnections,
		botMcpServers,
		chat,
		companionPlugin,
		joinedSpaces,
		roster,
		spaceConnections,
		spaceMcpServers,
		user,
		userConnections,
		userMcpServers,
	} = core
	const { onboarding } = drivers
	const {
		bots,
		isEditing,
		rosteredSpaceId,
		selectedBotId,
		selectedConversationId,
		settingsBotId,
	} = rosterView
	const { isSpaceEditing, selectedSpaceId } = scopes

	useEffect(() => {
		void user.controller.load()
		return user.controller.followOtherWindows()
	}, [user.controller])

	useCompanionAnnouncements({
		onCreated: (created) => {
			if (joinedSpaces.hosts.active === null) {
				void roster.controller.reload()
			}
			if (!user.controller.getState().preferences.firstRunDone) {
				void onboarding.controller.greetCompanion(created)
			}
		},
		onHostCreated: () => void roster.controller.reload(),
		onFirstRunDone: () => void user.controller.load(),
	})

	useCompanionArrivals(() => {
		void roster.controller.reload()
	})

	useCompanionSettings({
		applications: applications.controller,
		plugin: companionPlugin.controller,
		servers: botMcpServers.controller,
		connections: botConnections.controller,
		companionId: settingsBotId,
		spaceId: selectedSpaceId,
		isOpen: isEditing,
	})

	useSpaceSettingsReads({
		applications: applications.controller,
		servers: spaceMcpServers.controller,
		connections: spaceConnections.controller,
		spaceId: selectedSpaceId,
		isOpen: isSpaceEditing,
	})

	useEffect(() => {
		if (!user.state.isSettingsOpen) {
			return
		}
		void applications.controller.open()
		void userMcpServers.controller.open(USER_OWNER)
		void userConnections.controller.open(USER_OWNER)
	}, [
		applications.controller,
		userMcpServers.controller,
		userConnections.controller,
		user.state.isSettingsOpen,
	])

	useDirectoryWatch(
		applications.controller,
		user.state.isSettingsOpen || isEditing || isSpaceEditing,
	)

	const holdsSelectedBot = bots.some((bot) => bot.id === selectedBotId)

	useEffect(() => {
		if (!selectedBotId || !holdsSelectedBot) {
			return
		}
		void chat.controller.open(
			selectedBotId,
			rosteredSpaceId && roster.controller.hostSpaceIdOf(rosteredSpaceId),
		)
		void user.controller.setLastBot({
			spaceId: rosteredSpaceId,
			botId: selectedBotId,
		})
	}, [
		chat.controller,
		roster.controller,
		user.controller,
		selectedBotId,
		holdsSelectedBot,
		rosteredSpaceId,
	])

	useEffect(() => {
		if (!selectedConversationId) {
			return
		}
		void user.controller.setLastBot({
			spaceId: roster.controller.getState().spaceRowId,
			botId: selectedConversationId,
		})
	}, [roster.controller, user.controller, selectedConversationId])
}
