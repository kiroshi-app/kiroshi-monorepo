import { useNavigate, useRouter, useSearch } from "@tanstack/react-router"
import { useCallback } from "react"

import { ContentCard } from "@workspace/ui/components/content-card"
import { ScreenLayout } from "@workspace/ui/components/screen-layout"

import { BareAppHeader } from "@/components/bare-app-header"
import { LibraryScreen } from "@/components/library-screen"
import {
	type LibraryOpening,
	librarySearchOf,
	openingOf,
} from "@/lib/navigation/library-search"
import {
	useOpenLibraryItemInItsTab,
	useOpenLibraryItemInNewTab,
} from "@/lib/navigation/use-open-library-document"
import { isJoinedRowId } from "@/lib/spaces/joined-spaces-controller"
import { useWorkspace } from "@/lib/workspace/workspace-context"

const useCloseActiveTab = () => {
	const router = useRouter()
	return () => {
		const { tabs } = router.options.context
		const { bySpace, spaceId } = tabs.getState()
		tabs.close(bySpace[spaceId].activeId)
	}
}

const useShowOpening = () => {
	const navigate = useNavigate()
	return useCallback(
		(opening: LibraryOpening | undefined) =>
			void navigate({
				to: "/library",
				search: (previous) => ({ ...previous, ...librarySearchOf(opening) }),
				replace: true,
			}),
		[navigate],
	)
}

export const LibraryRoute = () => {
	const { core, rosteredHostSpaceId, rosterView, scopes } = useWorkspace()
	const opening = openingOf(useSearch({ from: "/library" }))
	const openInNewTab = useOpenLibraryItemInNewTab()
	const openInItsTab = useOpenLibraryItemInItsTab()
	const showOpening = useShowOpening()
	const closeTab = useCloseActiveTab()
	const spaceRowId = rosterView.rosteredSpaceId

	return (
		<ContentCard>
			{spaceRowId && rosteredHostSpaceId ? (
				<LibraryScreen
					bots={rosterView.bots}
					isJoined={isJoinedRowId(spaceRowId)}
					key={spaceRowId}
					onCloseTab={closeTab}
					onOpenBoard={openInItsTab}
					onOpenInNewTab={openInNewTab}
					onOpeningChange={showOpening}
					opening={opening}
					spaceId={rosteredHostSpaceId}
					spaceTint={scopes.spaceHue}
					viewerName={core.preferences.displayName}
				/>
			) : (
				<ScreenLayout header={<BareAppHeader />} />
			)}
		</ContentCard>
	)
}
