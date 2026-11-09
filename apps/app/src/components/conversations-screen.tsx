import { ContentCard } from "@workspace/ui/components/content-card"

import { useWorkspaceBodyProps } from "@/components/use-workspace-body-props"
import { WorkspaceBody } from "@/components/workspace-body"
import { WorkspaceSidebar } from "@/components/workspace-sidebar"
import { useWorkspace } from "@/lib/workspace/workspace-context"

export const ConversationsScreen = () => {
	const {
		collapsedSectionIds,
		core,
		overlay,
		rosterLines,
		rosterView,
		sidebarMissions,
		sidebarTab,
		switcher,
	} = useWorkspace()
	const body = useWorkspaceBodyProps()

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
					{...body}
					bot={rosterView.selected}
					conversation={rosterView.selectedConversation}
					isMissionsPanelOpen={sidebarTab.openTab === "missions"}
				/>
			</ContentCard>
		</>
	)
}
