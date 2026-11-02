import { AppFrame } from "@workspace/ui/components/app-frame"
import { ScreenLayout } from "@workspace/ui/components/screen-layout"
import { WorkspaceShell } from "@workspace/ui/components/workspace-shell"

import { BareAppHeader } from "@/components/bare-app-header"
import { LibraryScreen } from "@/components/library-screen"
import { isJoinedRowId } from "@/lib/spaces/joined-spaces-controller"
import { useWorkspace } from "@/lib/workspace/workspace-context"
import { useWorkspaceFrame } from "@/lib/workspace/workspace-frame"

export const LibraryRoute = () => {
	const { rosteredHostSpaceId, rosterView } = useWorkspace()
	const { frame } = useWorkspaceFrame()
	const spaceRowId = rosterView.rosteredSpaceId

	return (
		<WorkspaceShell
			spaceTint={frame.spaceTint}
			sidebar={
				<AppFrame
					rail={frame.rail}
					space={frame.currentSpace}
					spaceHost={frame.currentSpaceHost}
					titleBar={frame.titleBar}
				>
					{null}
				</AppFrame>
			}
		>
			{spaceRowId && rosteredHostSpaceId ? (
				<LibraryScreen
					isJoined={isJoinedRowId(spaceRowId)}
					key={spaceRowId}
					spaceId={rosteredHostSpaceId}
				/>
			) : (
				<ScreenLayout header={<BareAppHeader />} />
			)}
		</WorkspaceShell>
	)
}
