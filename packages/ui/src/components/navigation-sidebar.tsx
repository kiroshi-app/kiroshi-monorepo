"use client"

import {
	CollapsedSidebar,
	type CollapsedSidebarProps,
} from "@workspace/ui/components/collapsed-sidebar"
import {
	ExpandedSidebar,
	type ExpandedSidebarProps,
} from "@workspace/ui/components/expanded-sidebar"
import { SidebarResizeHandle } from "@workspace/ui/components/sidebar-resize"
import { useSidebar } from "@workspace/ui/components/ui/sidebar"
import { UpdateRow } from "@workspace/ui/components/update-badge"
import { cn } from "@workspace/ui/lib/utils"

const SIDEBAR = "relative flex min-h-0 shrink-0"

const SIDEBAR_OPEN = "w-(--sidebar-width)"

const SIDEBAR_COLLAPSED = "w-15"

const CLIP = "flex min-h-0 min-w-0 flex-1 overflow-clip"

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

	const {
		zones: _zones,
		openConversationId: _openConversationId,
		openMissionId: _openMissionId,
		onOpenConversation: _onOpenConversation,
		update,
		...shared
	} = collapsed

	return (
		<div
			className={cn(SIDEBAR, open ? SIDEBAR_OPEN : SIDEBAR_COLLAPSED)}
			data-slot="navigation-sidebar"
		>
			<div className={CLIP}>
				{open ? (
					<ExpandedSidebar
						{...shared}
						conversations={conversations}
						missionCount={missionCount}
						onReorderSpaces={onReorderSpaces}
						pinned={pinned}
						sections={sections}
						update={update ? <UpdateRow {...update} /> : null}
					/>
				) : (
					<CollapsedSidebar {...collapsed} />
				)}
			</div>
			<SidebarResizeHandle side="left" />
		</div>
	)
}

export { NavigationSidebar, type NavigationSidebarProps }
