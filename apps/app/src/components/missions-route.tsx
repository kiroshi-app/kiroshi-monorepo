import { useMemo } from "react"

import { ContentCard } from "@workspace/ui/components/content-card"
import { MissionsPage } from "@workspace/ui/components/missions-page"

import { botFacesOf, missionEntriesOf } from "@/lib/missions/missions-model"
import {
	missionsPageStatusOf,
	toMissionsPageMissions,
} from "@/lib/missions/missions-page-model"
import { useSpaceMissions } from "@/lib/missions/use-space-missions"
import { useWorkspace } from "@/lib/workspace/workspace-context"

export const MissionsRoute = () => {
	const { core, rosterLines, sidebarMissions } = useWorkspace()
	const { rosters, conversationRosters, spaceRowId } = core.roster.state
	const feed = useSpaceMissions(core.spaces.state.selectedSpaceId)
	const missions = useMemo(() => {
		const faces = botFacesOf(rosters)
		return toMissionsPageMissions({
			entries: missionEntriesOf(feed),
			faceOf: (botId) => faces.get(botId),
			conversations:
				spaceRowId === null ? [] : (conversationRosters[spaceRowId] ?? []),
		})
	}, [feed, rosters, conversationRosters, spaceRowId])

	return (
		<ContentCard>
			<MissionsPage
				missions={missions}
				now={rosterLines.now}
				onOpen={sidebarMissions.openMissionThread}
				onRetry={feed.reload}
				status={missionsPageStatusOf(feed)}
				wrap={sidebarMissions.wrapPageRow}
			/>
		</ContentCard>
	)
}
