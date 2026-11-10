import type { ExpandedSidebarDestination } from "@workspace/ui/components/expanded-sidebar"
import { NavigationSidebar } from "@workspace/ui/components/navigation-sidebar"

import {
	EXPANDED_CONVERSATION_ROWS,
	EXPANDED_PINNED_ROWS,
	ExpandedRowsProvider,
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

export const WorkspaceNavigationSidebar = () => {
	const { core, rosterLines, rosterView, sidebarMissions, tabs } =
		useWorkspace()
	const { frame, rosterLists } = useWorkspaceFrame()
	const { sidebar, selectedSpaceId } = frame
	const destination = useShownDestination(tabs)
	const { roster } = core
	const zones = sidebarZonesOf(useSidebarConversations())
	const { openCount, openMissionId } = sidebarMissions

	return (
		<ExpandedRowsProvider>
			<NavigationSidebar
				{...sidebar}
				conversations={EXPANDED_CONVERSATION_ROWS}
				destination={destination}
				listEnd={roster.listEnd}
				listStatus={rosterLists.rosterListStatus}
				missionCount={openCount > 0 ? openCount : undefined}
				onRetryList={roster.controller.retryLoad}
				openConversationId={rosterView.selectedConversationId ?? undefined}
				openMissionId={openMissionId}
				pinned={EXPANDED_PINNED_ROWS}
				selectedSpaceId={selectedSpaceId}
				spaces={sidebar.spaces ?? []}
				update={rosterLines.updateBadge}
				zones={zones}
			/>
		</ExpandedRowsProvider>
	)
}
