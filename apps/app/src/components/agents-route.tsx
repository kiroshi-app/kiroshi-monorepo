import { AgentsPage } from "@workspace/ui/components/agents-page"
import { ContentCard } from "@workspace/ui/components/content-card"

import { toCompanionSummary } from "@/lib/bots/bot-settings"
import { useCompanionCounts } from "@/lib/bots/use-companion-counts"
import { spaceIdsOfBot } from "@/lib/sidebar/companion-menu"
import { useWorkspace } from "@/lib/workspace/workspace-context"

const FROM_AGENTS_PAGE = { isFromAgentsPage: true }

export const AgentsRoute = () => {
	const { core, navigation, rosterLines, rosterView, scopes, switcher } =
		useWorkspace()
	const { hasFailedToLoad, isRosterPending, rosters } = core.roster.state
	const { sidebarActions } = rosterLines
	const isRosterShown =
		rosterView.hasLoaded &&
		rosterView.rosteredSpaceId === scopes.openRowId &&
		!isRosterPending &&
		!hasFailedToLoad
	const countsOf = useCompanionCounts(scopes.selectedSpace?.id)
	const agents = isRosterShown
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
				onSelect={(id) =>
					navigation.openCompanionSettings(id, FROM_AGENTS_PAGE)
				}
				openSpaceId={scopes.openRowId ?? undefined}
				spaceName={switcher.selectedSpace?.name ?? ""}
				spaces={switcher.ownedSpaces}
				status={isRosterShown ? "loaded" : "loading"}
			/>
		</ContentCard>
	)
}
