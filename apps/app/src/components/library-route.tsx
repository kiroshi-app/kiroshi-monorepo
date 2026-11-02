import { ContentCard } from "@workspace/ui/components/content-card"
import { ScreenLayout } from "@workspace/ui/components/screen-layout"

import { BareAppHeader } from "@/components/bare-app-header"
import { LibraryScreen } from "@/components/library-screen"
import { isJoinedRowId } from "@/lib/spaces/joined-spaces-controller"
import { useWorkspace } from "@/lib/workspace/workspace-context"

export const LibraryRoute = () => {
	const { rosteredHostSpaceId, rosterView } = useWorkspace()
	const spaceRowId = rosterView.rosteredSpaceId

	return (
		<ContentCard>
			{spaceRowId && rosteredHostSpaceId ? (
				<LibraryScreen
					isJoined={isJoinedRowId(spaceRowId)}
					key={spaceRowId}
					spaceId={rosteredHostSpaceId}
				/>
			) : (
				<ScreenLayout header={<BareAppHeader />} />
			)}
		</ContentCard>
	)
}
