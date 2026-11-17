import {
	AgentsPage,
	type AgentsPageStatus,
} from "@workspace/ui/components/agents-page"
import { ContentCard } from "@workspace/ui/components/content-card"

import { toCompanionSummary } from "@/lib/bots/bot-settings"
import { useCompanionCounts } from "@/lib/bots/use-companion-counts"
import { spaceIdsOfBot } from "@/lib/sidebar/companion-menu"
import { hasRosterFailedWithNothingHeld } from "@/lib/workspace/use-roster-lists"
import { useWorkspace } from "@/lib/workspace/workspace-context"

const FROM_AGENTS_PAGE = { isFromAgentsPage: true }

type AgentsPageStatusInput = {
	isRosterHeld: boolean
	hasFailedWithNothingHeld: boolean
}

const agentsPageStatusOf = ({
	isRosterHeld,
	hasFailedWithNothingHeld,
}: AgentsPageStatusInput): AgentsPageStatus => {
	if (!isRosterHeld) return "loading"
	if (hasFailedWithNothingHeld) return "failed"
	return "loaded"
}

export const AgentsRoute = () => {
	const { core, navigation, rosterLines, rosterView, scopes, switcher } =
		useWorkspace()
	const { roster } = core
	const { isRosterPending, rosters } = roster.state
	const { sidebarActions } = rosterLines
	const status = agentsPageStatusOf({
		isRosterHeld:
			rosterView.hasLoaded &&
			rosterView.rosteredSpaceId === scopes.openRowId &&
			!isRosterPending,
		hasFailedWithNothingHeld: hasRosterFailedWithNothingHeld(roster.state),
	})
	const countsOf = useCompanionCounts(scopes.selectedSpace?.id)
	const agents =
		status === "loaded"
			? rosterView.bots.map((bot) => ({
					...toCompanionSummary(bot, countsOf(bot.id)),
					memberships: spaceIdsOfBot(rosters, bot.id),
				}))
			: []

	return (
		<ContentCard>
			<AgentsPage
				agents={agents}
				onAddToSpace={sidebarActions.onAddBotToSpace}
				onCreate={sidebarActions.onCreateBot}
				onDelete={sidebarActions.onDeleteBot}
				onDuplicate={sidebarActions.onDuplicateBot}
				onOpenInNewTab={sidebarActions.onOpenBotInNewTab}
				onRemoveFromSpace={sidebarActions.onRemoveBotFromSpace}
				onRetry={roster.controller.retryLoad}
				onSelect={(id) =>
					navigation.openCompanionSettings(id, FROM_AGENTS_PAGE)
				}
				openSpaceId={scopes.openRowId ?? undefined}
				spaceName={switcher.selectedSpace?.name ?? ""}
				spaces={switcher.ownedSpaces}
				status={status}
			/>
		</ContentCard>
	)
}
