import type { ExpandedSidebarDestination } from "@workspace/ui/components/expanded-sidebar"
import { NavigationSidebar } from "@workspace/ui/components/navigation-sidebar"

import type { Section } from "@/lib/conversations/store-contract"
import { railZonesOf } from "@/lib/sidebar/rail-zones"
import { isHomePage, isLibraryPage, isMissionsPage } from "@/lib/tabs/tab-pages"
import { usePageShown } from "@/lib/tabs/use-page-shown"
import type { WorkspaceTabs } from "@/lib/tabs/workspace-tabs"
import { useWorkspace } from "@/lib/workspace/workspace-context"
import { useWorkspaceFrame } from "@/lib/workspace/workspace-frame"

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

const NO_SECTIONS: Section[] = []

const sectionsIn = (
	sectionsBySpaceId: Record<string, Section[]>,
	spaceId: string | null,
) =>
	spaceId === null ? NO_SECTIONS : (sectionsBySpaceId[spaceId] ?? NO_SECTIONS)

export const WorkspaceNavigationSidebar = () => {
	const { core, rosterLines, rosterView, sidebarMissions, tabs } =
		useWorkspace()
	const { frame, rosterLists } = useWorkspaceFrame()
	const { gestures, selectedSpaceId } = frame
	const destination = useShownDestination(tabs)
	const { roster, sections } = core
	const zones = railZonesOf({
		conversations: rosterLists.rosterConversations,
		sections: sectionsIn(sections.state.sections, rosterView.rosteredSpaceId),
	})

	return (
		<NavigationSidebar
			badgesBySpaceId={gestures.badgesBySpaceId}
			conversations={null}
			destination={destination}
			hostBySpaceId={gestures.hostBySpaceId}
			invitations={gestures.invitations}
			listEnd={roster.listEnd}
			listStatus={rosterLists.rosterListStatus}
			missionCount={sidebarMissions.waitingCount}
			onAcceptInvitation={gestures.onAcceptInvitation}
			onCreateSpace={gestures.onCreateSpace}
			onDeclineInvitation={gestures.onDeclineInvitation}
			onNewConversation={gestures.onSelectHome}
			onOpenChange={gestures.onSpacesMenuOpenChange}
			onOpenConversation={rosterLines.sidebarActions.onSelectConversation}
			onOpenMission={sidebarMissions.openMissionThread}
			onOpenSearch={gestures.onOpenSearch}
			onOpenSettings={gestures.onOpenYou}
			onRetryInvitation={gestures.onRetryInvitation}
			onRetryList={roster.controller.retryLoad}
			onSelectLibrary={gestures.onSelectLibrary}
			onSelectMissions={gestures.onSelectMissions}
			onSelectSpace={gestures.onSelectSpace}
			openConversationId={rosterView.selectedConversationId ?? undefined}
			pinned={null}
			selectedSpaceId={selectedSpaceId}
			spaces={gestures.spaces ?? []}
			update={rosterLines.updateBadge}
			user={gestures.user}
			zones={zones}
		/>
	)
}
