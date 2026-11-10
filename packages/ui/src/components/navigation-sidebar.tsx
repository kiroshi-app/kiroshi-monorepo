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
		"pinned" | "conversations" | "sections" | "missionCount" | "onReorderSpaces"
	>

const NavigationSidebar = ({
	pinned,
	conversations,
	sections,
	missionCount,
	onReorderSpaces,
	...collapsed
}: NavigationSidebarProps) => {
	const { open } = useSidebar()

	if (!open) return <CollapsedSidebar {...collapsed} />

	const {
		zones: _zones,
		openConversationId: _openConversationId,
		openMissionId: _openMissionId,
		onOpenConversation: _onOpenConversation,
		onOpenMission: _onOpenMission,
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
			sections={sections}
			update={update ? <UpdateRow {...update} /> : null}
		/>
	)
}

export { NavigationSidebar, type NavigationSidebarProps }
