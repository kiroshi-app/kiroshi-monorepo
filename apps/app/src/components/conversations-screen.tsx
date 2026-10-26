import { WorkspaceShell } from "@workspace/ui/components/workspace-shell"

import { WorkspaceBody } from "@/components/workspace-body"
import { WorkspaceSidebar } from "@/components/workspace-sidebar"
import { isSidebarResizable } from "@/lib/host"
import { useWorkspace } from "@/lib/workspace/workspace-context"

export const ConversationsScreen = () => {
	const {
		collapsedSectionIds,
		core,
		drivers,
		loadSpaces,
		overlay,
		panels,
		rosterLines,
		rosterView,
		rosteredHostSpaceId,
		scopes,
		sidebarMissions,
		sidebarTab,
		switcher,
	} = useWorkspace()
	const { preferences, roster, spaces } = core

	return (
		<WorkspaceShell
			spaceTint={scopes.spaceTint}
			width={preferences.sidebarWidth ?? undefined}
			onWidthChange={overlay.changeSidebarWidth}
			isResizable={isSidebarResizable()}
			sidebar={
				<WorkspaceSidebar
					collapsedSectionIds={collapsedSectionIds}
					core={core}
					drivers={drivers}
					overlay={overlay}
					panels={panels}
					rosterLines={rosterLines}
					rosterView={rosterView}
					sidebarMissions={sidebarMissions}
					sidebarTab={sidebarTab}
					switcher={switcher}
				/>
			}
		>
			<WorkspaceBody
				activityPanel={overlay.activityPanel}
				attachments={core.attachments}
				bot={rosterView.selected}
				bots={rosterView.bots}
				chat={core.chat}
				conversation={rosterView.selectedConversation}
				conversationRuntimes={core.conversationRuntimes}
				drafts={core.drafts}
				haveSpacesFailed={spaces.state.hasFailedToLoad}
				isConversationSettingsOpen={overlay.isThreadConversationSettingsOpen}
				isMissionsPanelOpen={sidebarTab.openTab === "missions"}
				isOverlayOpen={overlay.isOverlayOpen}
				landings={core.messageLandings}
				missions={core.openedMission}
				onboarding={preferences.firstRunDone ? undefined : drivers.onboarding}
				onOpenConversationSettings={roster.controller.editConversation}
				onRetrySpaces={loadSpaces}
				onToggleSettings={overlay.toggleSettings}
				readerName={preferences.displayName}
				signIn={drivers.signIn}
				spaceId={rosteredHostSpaceId}
			/>
		</WorkspaceShell>
	)
}
