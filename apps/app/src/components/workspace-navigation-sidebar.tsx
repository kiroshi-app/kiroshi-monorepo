import type { ExpandedSidebarDestination } from "@workspace/ui/components/expanded-sidebar"
import { NavigationSidebar } from "@workspace/ui/components/navigation-sidebar"

import {
	ExpandedRowsProvider,
	useExpandedSlotElements,
} from "@/components/expanded-sidebar-rows"
import { sidebarZonesOf } from "@/lib/sidebar/sidebar-zones"
import { useSidebarConversations } from "@/lib/sidebar/use-sidebar-conversations"
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

const NavigationSidebarWithRows = () => {
	const { core, rosterLines, rosterView, sidebarMissions, tabs } =
		useWorkspace()
	const { frame, rosterLists } = useWorkspaceFrame()
	const { collapse, sidebar, selectedSpaceId } = frame
	const destination = useShownDestination(tabs)
	const { roster } = core
	const zones = sidebarZonesOf(useSidebarConversations())
	const { conversations, pinned, sections } = useExpandedSlotElements()
	const { openCount, openMissionId } = sidebarMissions

	return (
		<NavigationSidebar
			{...sidebar}
			conversations={conversations}
			destination={destination}
			listEnd={roster.listEnd}
			listStatus={
				collapse.isOpen
					? rosterLists.expandedListStatus
					: rosterLists.rosterListStatus
			}
			missionCount={openCount > 0 ? openCount : undefined}
			onRetryList={roster.controller.retryLoad}
			openConversationId={rosterView.selectedConversationId ?? undefined}
			openMissionId={openMissionId}
			pinned={pinned}
			sections={sections}
			selectedSpaceId={selectedSpaceId}
			spaces={sidebar.spaces ?? []}
			update={rosterLines.updateBadge}
			zones={zones}
		/>
	)
}

export const WorkspaceNavigationSidebar = () => (
	<ExpandedRowsProvider>
		<NavigationSidebarWithRows />
	</ExpandedRowsProvider>
)
