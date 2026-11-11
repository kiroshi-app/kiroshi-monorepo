import type { WorkspaceBodyProps } from "@/components/workspace-body"
import { onboardingCreationOf } from "@/lib/onboarding/onboarding-flow-controller"
import { useWorkspace } from "@/lib/workspace/workspace-context"

type SharedBodyProps = Omit<WorkspaceBodyProps, "bot" | "conversation" | "home">

export const useWorkspaceBodyProps = (): SharedBodyProps => {
	const {
		core,
		drivers,
		loadSpaces,
		navigation,
		overlay,
		rosterLines,
		rosterView,
		rosteredHostSpaceId,
	} = useWorkspace()

	return {
		activityPanel: overlay.activityPanel,
		attachments: core.attachments,
		bots: rosterView.bots,
		chat: core.chat,
		conversationRuntimes: core.conversationRuntimes,
		drafts: core.drafts,
		haveSpacesFailed: core.spaces.state.hasFailedToLoad,
		isOverlayOpen: overlay.isOverlayOpen,
		landings: core.messageLandings,
		missions: core.openedMission,
		onboardingCreation:
			onboardingCreationOf(drivers.onboarding.state) ?? undefined,
		onOpenConversationSettings:
			rosterLines.sidebarActions.onOpenConversationSettings,
		onOpenThreadInNewTab: navigation.openThreadInNewTab,
		onRetrySpaces: loadSpaces,
		onToggleSettings: overlay.toggleSettings,
		readerName: core.preferences.displayName,
		signIn: drivers.signIn,
		spaceId: rosteredHostSpaceId,
		spaceRowId: rosterView.rosteredSpaceId,
	}
}
