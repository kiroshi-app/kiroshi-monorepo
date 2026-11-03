import { useNavigate, useRouter, useSearch } from "@tanstack/react-router"
import { useCallback } from "react"

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

const useDropOpenedItem = () => {
	const navigate = useNavigate()
	return useCallback(
		() =>
			void navigate({
				to: "/library",
				search: (previous) => ({ ...previous, item: undefined }),
				replace: true,
			}),
		[navigate],
	)
}

export const LibraryRoute = () => {
	const { rosteredHostSpaceId, rosterView, scopes } = useWorkspace()
	const { item } = useSearch({ from: "/library" })
	const openInNewTab = useOpenLibraryItemInNewTab()
	const dropOpenedItem = useDropOpenedItem()
	const spaceRowId = rosterView.rosteredSpaceId

	return (
		<ContentCard>
			{spaceRowId && rosteredHostSpaceId ? (
				<LibraryScreen
					bots={rosterView.bots}
					isJoined={isJoinedRowId(spaceRowId)}
					key={spaceRowId}
					onArrivalOpened={dropOpenedItem}
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
