import { ContentCard } from "@workspace/ui/components/content-card"

import { WorkspaceBody } from "@/components/workspace-body"
import { WorkspaceSidebar } from "@/components/workspace-sidebar"
import { onboardingCreationOf } from "@/lib/onboarding/onboarding-flow-controller"
import { useWorkspace } from "@/lib/workspace/workspace-context"

export const ConversationsScreen = () => {
	const {
		collapsedSectionIds,
		core,
		drivers,
		loadSpaces,
		navigation,
		overlay,
		rosterLines,
		rosterView,
		rosteredHostSpaceId,
		sidebarMissions,
		sidebarTab,
		switcher,
	} = useWorkspace()
	const { preferences, spaces } = core

	return (
		<>
			<WorkspaceSidebar
				collapsedSectionIds={collapsedSectionIds}
				core={core}
				overlay={overlay}
				rosterLines={rosterLines}
				rosterView={rosterView}
				sidebarMissions={sidebarMissions}
				sidebarTab={sidebarTab}
				switcher={switcher}
			/>
			<ContentCard>
				<WorkspaceBody
					activityPanel={overlay.activityPanel}
					attachments={core.attachments}
					bot={rosterView.selected}
					bots={rosterView.bots}
					chat={core.chat}
					conversation={rosterView.selectedConversation}
					conversationRuntimes={core.conversationRuntimes}
					conversations={rosterView.conversations}
					drafts={core.drafts}
					haveSpacesFailed={spaces.state.hasFailedToLoad}
					homeRenewals={core.homeRenewals}
					isMissionsPanelOpen={sidebarTab.openTab === "missions"}
					isOverlayOpen={overlay.isOverlayOpen}
					landings={core.messageLandings}
					missions={core.openedMission}
					onboardingCreation={
						onboardingCreationOf(drivers.onboarding.state) ?? undefined
					}
					onOpenConversationSettings={
						rosterLines.sidebarActions.onOpenConversationSettings
					}
					onOpenThreadInNewTab={navigation.openThreadInNewTab}
					onRetrySpaces={loadSpaces}
					onSelectBot={core.roster.controller.select}
					onToggleSettings={overlay.toggleSettings}
					readerName={preferences.displayName}
					signIn={drivers.signIn}
					spaceId={rosteredHostSpaceId}
					spaceRowId={rosterView.rosteredSpaceId}
					store={core.store}
				/>
			</ContentCard>
		</>
	)
}
