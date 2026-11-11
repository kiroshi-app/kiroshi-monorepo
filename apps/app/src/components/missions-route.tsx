import { ContentCard } from "@workspace/ui/components/content-card"
import { MissionsPage } from "@workspace/ui/components/missions-page"

import { useWorkspace } from "@/lib/workspace/workspace-context"

export const MissionsRoute = () => {
	const { rosterLines, sidebarMissions } = useWorkspace()

	return (
		<ContentCard>
			<MissionsPage {...sidebarMissions.page} now={rosterLines.now} />
		</ContentCard>
	)
}
