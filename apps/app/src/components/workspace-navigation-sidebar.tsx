import type { ExpandedSidebarDestination } from "@workspace/ui/components/expanded-sidebar"
import { NavigationSidebar } from "@workspace/ui/components/navigation-sidebar"

import {
	ExpandedRowsProvider,
	useExpandedSlotElements,
} from "@/components/expanded-sidebar-rows"
import { expandedSpaceListOf } from "@/components/space-neighbour-lists"
import {
	isHomePage,
	isLibraryPage,
	isMissionsPage,
	isUserSettingsPage,
} from "@/lib/tabs/tab-pages"
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
	const { core, rosterLines, sidebarMissions, tabs } = useWorkspace()
	const { frame, rosterLists } = useWorkspaceFrame()
	const { onOpenConversation: _opensFromARow, ...navigation } = frame.sidebar
	const destination = useShownDestination(tabs)
	const isSettingsShown = usePageShown(tabs, isUserSettingsPage)
	const { roster } = core
	const { conversations, pinned, sections } = useExpandedSlotElements()
	const { openCount } = sidebarMissions

	return (
		<NavigationSidebar
			{...navigation}
			conversations={conversations}
			destination={destination}
			isSettingsShown={isSettingsShown}
			listEnd={roster.listEnd}
			listStatus={rosterLists.expandedListStatus}
			missionCount={openCount > 0 ? openCount : undefined}
			onRetryList={roster.controller.retryLoad}
			pinned={pinned}
			renderSpaceList={expandedSpaceListOf}
			sections={sections}
			selectedSpaceId={frame.selectedSpaceId}
			spaces={navigation.spaces ?? []}
			update={rosterLines.updateBadge}
		/>
	)
}

export const WorkspaceNavigationSidebar = () => (
	<ExpandedRowsProvider>
		<NavigationSidebarWithRows />
	</ExpandedRowsProvider>
)
