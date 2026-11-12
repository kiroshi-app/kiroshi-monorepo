import { useLocation, useNavigate } from "@tanstack/react-router"

import { ContentCard } from "@workspace/ui/components/content-card"

import { useWorkspaceBodyProps } from "@/components/use-workspace-body-props"
import { WorkspaceBody } from "@/components/workspace-body"
import { useWorkspace } from "@/lib/workspace/workspace-context"

export const HomeRoute = () => {
	const { core, homeAgent, rosterView } = useWorkspace()
	const body = useWorkspaceBodyProps()
	const navigate = useNavigate()
	const arrivalKey = useLocation({
		select: (location) => location.state.__TSR_key,
	})
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
					arrivalKey,
					visits: core.homeVisits,
					store: core.store,
					onSelectAgent: pickAgent,
					startConversation:
						core.roster.controller.createUnselectedConversation,
					discardConversation: core.roster.controller.discardConversation,
					openConversation,
				}}
			/>
		</ContentCard>
	)
}
