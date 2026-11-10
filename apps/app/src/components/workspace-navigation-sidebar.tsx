import type { AppFrameRailProps } from "@workspace/ui/components/app-frame"
import type { ExpandedSidebarDestination } from "@workspace/ui/components/expanded-sidebar"
import { NavigationSidebar } from "@workspace/ui/components/navigation-sidebar"

import { isHomePage, isLibraryPage, isMissionsPage } from "@/lib/tabs/tab-pages"
import { usePageShown } from "@/lib/tabs/use-page-shown"
import type { WorkspaceTabs } from "@/lib/tabs/workspace-tabs"
import type { RosterLists } from "@/lib/workspace/use-roster-lists"
import { useWorkspace } from "@/lib/workspace/workspace-context"

type WorkspaceNavigationSidebarProps = {
	gestures: AppFrameRailProps
	selectedSpaceId: string | undefined
	rosterLists: RosterLists
}

const useShownDestination = (
	tabs: WorkspaceTabs,
): ExpandedSidebarDestination | undefined => {
	const isHomeShown = usePageShown(tabs, isHomePage)
	const isMissionsShown = usePageShown(tabs, isMissionsPage)
	const isLibraryShown = usePageShown(tabs, isLibraryPage)

	if (isHomeShown) return "newConversation"
	if (isMissionsShown) return "missions"
	if (isLibraryShown) return "library"
	return undefined
}

export const WorkspaceNavigationSidebar = ({
	gestures,
	selectedSpaceId,
	rosterLists,
}: WorkspaceNavigationSidebarProps) => {
	const { rosterLines, rosterView, tabs } = useWorkspace()
	const destination = useShownDestination(tabs)

	return (
		<NavigationSidebar
			badgesBySpaceId={gestures.badgesBySpaceId}
			conversations={null}
			destination={destination}
			hostBySpaceId={gestures.hostBySpaceId}
			invitations={gestures.invitations}
			onAcceptInvitation={gestures.onAcceptInvitation}
			onCreateSpace={gestures.onCreateSpace}
			onDeclineInvitation={gestures.onDeclineInvitation}
			onNewConversation={gestures.onSelectHome}
			onOpenChange={gestures.onSpacesMenuOpenChange}
			onOpenConversation={rosterLines.sidebarActions.onSelectConversation}
			onOpenSearch={gestures.onOpenSearch}
			onOpenSettings={gestures.onOpenYou}
			onRetryInvitation={gestures.onRetryInvitation}
			onSelectLibrary={gestures.onSelectLibrary}
			onSelectMissions={gestures.onSelectMissions}
			onSelectSpace={gestures.onSelectSpace}
			openConversationId={rosterView.selectedConversationId ?? undefined}
			pinned={null}
			selectedSpaceId={selectedSpaceId}
			spaces={gestures.spaces ?? []}
			update={rosterLines.updateBadge}
			user={gestures.user}
			zones={[
				{
					id: "conversations",
					conversations: rosterLists.rosterConversations,
				},
			]}
		/>
	)
}
