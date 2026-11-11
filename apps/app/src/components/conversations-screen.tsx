import { ContentCard } from "@workspace/ui/components/content-card"

import { useWorkspaceBodyProps } from "@/components/use-workspace-body-props"
import { WorkspaceBody } from "@/components/workspace-body"
import { useWorkspace } from "@/lib/workspace/workspace-context"

export const ConversationsScreen = () => {
	const { rosterView } = useWorkspace()
	const body = useWorkspaceBodyProps()

	return (
		<ContentCard>
			<WorkspaceBody
				{...body}
				bot={rosterView.selected}
				conversation={rosterView.selectedConversation}
			/>
		</ContentCard>
	)
}
