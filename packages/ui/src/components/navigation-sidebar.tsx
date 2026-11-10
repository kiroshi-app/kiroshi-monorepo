"use client"

import {
	CollapsedSidebar,
	type CollapsedSidebarProps,
} from "@workspace/ui/components/collapsed-sidebar"
import {
	ExpandedSidebar,
	type ExpandedSidebarProps,
} from "@workspace/ui/components/expanded-sidebar"
import { useSidebar } from "@workspace/ui/components/ui/sidebar"
import { UpdateRow } from "@workspace/ui/components/update-badge"

type NavigationSidebarProps = CollapsedSidebarProps &
	Pick<
		ExpandedSidebarProps,
		"pinned" | "conversations" | "missionCount" | "onReorderSpaces"
	>

const NavigationSidebar = ({
	pinned,
	conversations,
	missionCount,
	onReorderSpaces,
	...collapsed
}: NavigationSidebarProps) => {
	const { open } = useSidebar()

	if (!open) return <CollapsedSidebar {...collapsed} />

	const {
		zones: _zones,
		listStatus: _listStatus,
		listEnd: _listEnd,
		openConversationId: _openConversationId,
		openMissionId: _openMissionId,
		onOpenConversation: _onOpenConversation,
		onOpenMission: _onOpenMission,
		onRetryList: _onRetryList,
		update,
		...shared
	} = collapsed

	return (
		<ExpandedSidebar
			{...shared}
			conversations={conversations}
			missionCount={missionCount}
			onReorderSpaces={onReorderSpaces}
			pinned={pinned}
			update={update ? <UpdateRow {...update} /> : null}
		/>
	)
}

export { NavigationSidebar, type NavigationSidebarProps }
