import { useEffect } from "react"

import type { RosterView } from "./use-roster-view"
import type { WorkspaceCore } from "./use-workspace-core"
import type { WorkspaceDrivers } from "./use-workspace-drivers"

import { useCompanionAnnouncements } from "../companions/use-companion-announcements"
import { useCompanionArrivals } from "../conversations/use-companion-arrivals"

type WorkspaceSubscriptionsInput = {
	core: WorkspaceCore
	drivers: WorkspaceDrivers
	rosterView: RosterView
}

export const useWorkspaceSubscriptions = ({
	core,
	drivers,
	rosterView,
}: WorkspaceSubscriptionsInput) => {
	const { chat, joinedSpaces, roster, user } = core
	const { onboarding } = drivers
	const { bots, rosteredSpaceId, selectedBotId, selectedConversationId } =
		rosterView

	useEffect(() => {
		void user.controller.load().then(onboarding.controller.resume)
		return user.controller.followOtherWindows()
	}, [user.controller, onboarding.controller])

	useCompanionAnnouncements({
		onCreated: (created) => {
			if (joinedSpaces.hosts.active === null) {
				void roster.controller.reload()
			}
			onboarding.controller.noteCreated(created)
		},
		onHostCreated: () => void roster.controller.reload(),
		onFirstRunDone: () => {
			void onboarding.controller.noteFirstRunDone()
			void user.controller.load()
		},
	})

	useCompanionArrivals(() => {
		void roster.controller.reload()
	})

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
