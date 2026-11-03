import { useRouter, useSearch } from "@tanstack/react-router"

import { ContentCard } from "@workspace/ui/components/content-card"
import { ScreenLayout } from "@workspace/ui/components/screen-layout"

import { BareAppHeader } from "@/components/bare-app-header"
import { LibraryScreen } from "@/components/library-screen"
import { isJoinedRowId } from "@/lib/spaces/joined-spaces-controller"
import { useWorkspace } from "@/lib/workspace/workspace-context"

type LibraryItemOpened = { id: string }

const useOpenLibraryItemInNewTab = () => {
	const router = useRouter()
	return ({ id }: LibraryItemOpened) =>
		router.options.context.tabs.openInNewTab(
			router.buildLocation({ to: "/library", search: { item: id } }).href,
		)
}

export const LibraryRoute = () => {
	const { rosteredHostSpaceId, rosterView, scopes } = useWorkspace()
	const { item } = useSearch({ from: "/library" })
	const openInNewTab = useOpenLibraryItemInNewTab()
	const spaceRowId = rosterView.rosteredSpaceId

	return (
		<ContentCard>
			{spaceRowId && rosteredHostSpaceId ? (
				<LibraryScreen
					bots={rosterView.bots}
					isJoined={isJoinedRowId(spaceRowId)}
					key={`${spaceRowId}/${item ?? ""}`}
					onOpenInNewTab={openInNewTab}
					openedOnArrival={item}
					spaceId={rosteredHostSpaceId}
					spaceTint={scopes.spaceHue}
				/>
			) : (
				<ScreenLayout header={<BareAppHeader />} />
			)}
		</ContentCard>
	)
}
