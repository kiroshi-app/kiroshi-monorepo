import { useEffect, useRef, useSyncExternalStore } from "react"

import type { RosterView } from "./use-roster-view"
import type { WorkspaceCore } from "./use-workspace-core"
import type { WorkspaceDrivers } from "./use-workspace-drivers"

import { useCompanionAnnouncements } from "../companions/use-companion-announcements"
import { useCompanionArrivals } from "../conversations/use-companion-arrivals"

type ShownHome = {
	isShown: boolean
	agentId: string | null
}

type WorkspaceSubscriptionsInput = {
	core: WorkspaceCore
	drivers: WorkspaceDrivers
	rosterView: RosterView
	home: ShownHome
}

export const useWorkspaceSubscriptions = ({
	core,
	drivers,
	rosterView,
	home,
}: WorkspaceSubscriptionsInput) => {
	const { chat, homeEntries, homeVisits, joinedSpaces, roster, user } = core
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

	useEffect(() => homeEntries.followWindowReturns(), [homeEntries])
	const homeEntry = useSyncExternalStore(
		homeEntries.subscribe,
		homeEntries.getState,
	)
	const shownHomeEntry = home.isShown ? homeEntry : null

	const shownBotId = home.isShown ? home.agentId : selectedBotId
	const holdsShownBot = bots.some((bot) => bot.id === shownBotId)
	const holdsSelectedBot = bots.some((bot) => bot.id === selectedBotId)
	const shownRowId = useRef<string | null>(null)
	const onScreenRowId = home.isShown
		? home.agentId
		: (selectedBotId ?? selectedConversationId)

	useEffect(() => {
		if (onScreenRowId) {
			shownRowId.current = onScreenRowId
		}
	}, [onScreenRowId])

	useEffect(() => {
		if (!shownBotId || !holdsShownBot) {
			return
		}
		const spaceId =
			rosteredSpaceId && roster.controller.hostSpaceIdOf(rosteredSpaceId)
		const renewed =
			shownHomeEntry !== null && spaceId
				? homeVisits.open(shownBotId, spaceId)
				: Promise.resolve()
		void renewed.then(() => {
			if (shownRowId.current === shownBotId) {
				void chat.controller.open(shownBotId, spaceId)
			}
		})
	}, [
		chat.controller,
		homeVisits,
		roster.controller,
		shownBotId,
		holdsShownBot,
		shownHomeEntry,
		rosteredSpaceId,
	])

	useEffect(() => {
		if (!selectedBotId || !holdsSelectedBot) {
			return
		}
		void user.controller.setLastBot({
			spaceId: rosteredSpaceId,
			botId: selectedBotId,
		})
	}, [user.controller, selectedBotId, holdsSelectedBot, rosteredSpaceId])

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
