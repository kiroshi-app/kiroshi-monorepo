import { useDriverWindow } from "./use-driver-window"
import type { WorkspaceCore } from "./use-workspace-core"

import { useEvolution } from "../bots/use-evolution"
import { useBotBadges } from "../chat/use-bot-badges"
import { useCompanionSpokeDriver } from "../conversations/use-companion-spoke-driver"
import { useConversationBadges } from "../conversations/use-conversation-badges"
import { useDockBadge } from "../dock-badge/use-dock-badge"
import { useExternalLinks } from "../links/use-external-links"
import { useMissionMarks } from "../missions/use-mission-marks"
import { useMissionRunDriver } from "../missions/use-mission-run-driver"
import { useNotifications } from "../notifications/use-notifications"
import { onboardingFlowWorldOf } from "../onboarding/onboarding-flow-controller"
import { onboardingTransport } from "../onboarding/onboarding-transport"
import { signInWorldOf } from "../onboarding/sign-in-controller"
import { useOnboardingFlow } from "../onboarding/use-onboarding-flow"
import { useSignIn } from "../onboarding/use-sign-in"
import { useReportRelay } from "../routines/use-report-relay"
import { useUpdater } from "../updater/use-updater"

export const useWorkspaceDrivers = (
	core: WorkspaceCore,
	isMainWindow: boolean,
) => {
	const {
		chat,
		conversationRuntimes,
		driver,
		joinedSpaces,
		openedMission,
		roster,
		spaces,
		spokenWords,
		store,
		user,
	} = core
	const isDriverWindow = useDriverWindow(isMainWindow)

	const onboarding = useOnboardingFlow(
		onboardingTransport,
		onboardingFlowWorldOf({
			chat: chat.controller,
			roster: roster.controller,
			user: user.controller,
		}),
	)
	const signIn = useSignIn(
		onboardingTransport,
		signInWorldOf({
			chat: chat.controller,
			selectedBotId: () => roster.controller.getState().selectedBotId,
		}),
	)

	const updater = useUpdater()

	useExternalLinks()

	useReportRelay({
		driver,
		store,
		runtimes: conversationRuntimes,
		isDriverWindow,
	})

	useMissionRunDriver({
		driver,
		store,
		runtimes: conversationRuntimes,
		chat: chat.controller,
		isDriverWindow,
	})

	useCompanionSpokeDriver({
		runtimes: conversationRuntimes,
		roster: roster.controller,
		spokenWords,
		isDriverWindow,
	})

	useNotifications({
		chat: chat.controller,
		runtimes: conversationRuntimes,
		roster: roster.controller,
		spaces: spaces.controller,
		joinedSpaces: joinedSpaces.controller,
		missions: openedMission,
		spokenWords,
		user: user.controller,
		isDriverWindow,
	})

	useEvolution({
		driver,
		roster: roster.controller,
		isDriverWindow,
	})

	const badges = useBotBadges({
		chat: chat.controller,
		roster: roster.controller,
		isDriverWindow,
	})

	const missionMarks = useMissionMarks(spaces.state.selectedSpaceId)

	const conversationBadges = useConversationBadges({
		runtimes: conversationRuntimes,
		roster: roster.controller,
		spokenWords,
		isDriverWindow,
	})

	useDockBadge({
		roster: roster.controller,
		botBadges: badges,
		conversationBadges,
		isDriverWindow,
	})

	return {
		badges,
		conversationBadges,
		isDriverWindow,
		onboarding,
		signIn,
		missionMarks,
		updater,
	}
}

export type WorkspaceDrivers = ReturnType<typeof useWorkspaceDrivers>
