"use client"

import { type TransitionEvent, useState } from "react"

import {
	CollapsedSidebar,
	type CollapsedSidebarProps,
} from "@workspace/ui/components/collapsed-sidebar"
import {
	ExpandedSidebar,
	type ExpandedSidebarProps,
} from "@workspace/ui/components/expanded-sidebar"
import {
	SIDEBAR_FOLD_MOTION,
	SidebarResizeHandle,
	useIsSidebarResizing,
} from "@workspace/ui/components/sidebar-resize"
import { useSidebar } from "@workspace/ui/components/ui/sidebar"
import { UpdateRow } from "@workspace/ui/components/update-badge"
import { cn } from "@workspace/ui/lib/utils"

const SIDEBAR = cn("relative flex min-h-0 shrink-0", SIDEBAR_FOLD_MOTION)

const SIDEBAR_OPEN = "w-(--sidebar-width)"

const SIDEBAR_COLLAPSED = "w-15"

const CLIP = "flex min-h-0 min-w-0 flex-1 overflow-clip"

const useFoldingColumn = (isOpen: boolean) => {
	const isResizing = useIsSidebarResizing()
	const [shownOpen, setShownOpen] = useState(isOpen)
	const [isFolding, setIsFolding] = useState(false)

	if (isOpen !== shownOpen) {
		setShownOpen(isOpen)
		setIsFolding(!isOpen && !isResizing)
	}

	const endFold = (event: TransitionEvent<HTMLDivElement>) => {
		if (event.target === event.currentTarget && event.propertyName === "width")
			setIsFolding(false)
	}

	return { isFolding, endFold }
}

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
	const { isFolding, endFold } = useFoldingColumn(open)

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
		<div
			className={cn(SIDEBAR, open ? SIDEBAR_OPEN : SIDEBAR_COLLAPSED)}
			data-slot="navigation-sidebar"
			onTransitionEnd={endFold}
		>
			<div className={CLIP}>
				{open || isFolding ? (
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
