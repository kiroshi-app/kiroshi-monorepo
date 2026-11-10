import { useNavigate } from "@tanstack/react-router"

import { ContentCard } from "@workspace/ui/components/content-card"

import { useWorkspaceBodyProps } from "@/components/use-workspace-body-props"
import { WorkspaceBody } from "@/components/workspace-body"
import { useWorkspace } from "@/lib/workspace/workspace-context"

export const HomeRoute = () => {
	const { core, homeAgent, rosterView } = useWorkspace()
	const body = useWorkspaceBodyProps()
	const navigate = useNavigate()
	const spaceRowId = rosterView.rosteredSpaceId
	const pickAgent = (botId: string) => {
		if (spaceRowId) {
			core.homePicks.pick(spaceRowId, botId)
		}
	}
	const openConversation = (conversationId: string) => {
		void navigate({ to: "/", search: { conversation: conversationId } })
	}

	return (
		<ContentCard>
			<WorkspaceBody
				{...body}
				bot={homeAgent ?? undefined}
				home={{
					visits: core.homeVisits,
					store: core.store,
					conversations: rosterView.conversations,
					onSelectAgent: pickAgent,
					startConversation: core.roster.controller.createConversation,
					openConversation,
				}}
				isMissionsPanelOpen={false}
			/>
		</ContentCard>
	)
}
