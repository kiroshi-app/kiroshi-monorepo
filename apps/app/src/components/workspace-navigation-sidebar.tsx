import type { ExpandedSidebarDestination } from "@workspace/ui/components/expanded-sidebar"
import { NavigationSidebar } from "@workspace/ui/components/navigation-sidebar"

import type { Section } from "@/lib/conversations/store-contract"
import { sidebarZonesOf } from "@/lib/sidebar/sidebar-zones"
import { soloThreadRowsOf } from "@/lib/sidebar/solo-thread-rows"
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
	const { sidebar, selectedSpaceId } = frame
	const destination = useShownDestination(tabs)
	const { roster, sections } = core
	const zones = sidebarZonesOf({
		conversations: [
			...rosterLists.rosterConversations,
			...soloThreadRowsOf({
				agents: rosterLists.rosterBots,
				soloThreads: rosterView.soloThreads,
				spaceId: rosterView.rosteredSpaceId,
			}),
		],
		sections: sectionsIn(sections.state.sections, rosterView.rosteredSpaceId),
	})

	return (
		<NavigationSidebar
			{...sidebar}
			conversations={null}
			destination={destination}
			listEnd={roster.listEnd}
			listStatus={rosterLists.rosterListStatus}
			missionCount={sidebarMissions.waitingCount}
			onRetryList={roster.controller.retryLoad}
			openConversationId={rosterView.selectedConversationId ?? undefined}
			pinned={null}
			selectedSpaceId={selectedSpaceId}
			spaces={sidebar.spaces ?? []}
			update={rosterLines.updateBadge}
			zones={zones}
		/>
	)
}
