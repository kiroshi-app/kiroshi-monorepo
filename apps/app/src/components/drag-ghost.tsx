import { TitleBarTabChip } from "@workspace/ui/components/title-bar-tab-chip"

import type { DragGhostTab } from "@/lib/bindings"
import type { DockTarget } from "@/lib/tabs/drag-ghost-state"
import type { DragGhostViewStore } from "@/lib/tabs/drag-ghost-view"
import { type GhostIconReader, useGhostIcon } from "@/lib/tabs/use-ghost-icon"
import { useControllerState } from "@/lib/use-controller"

type DragGhostProps = {
	view: DragGhostViewStore
	reader: GhostIconReader
}

type DragGhostChipProps = {
	tab: DragGhostTab
	spaceId: string | null
	target: DockTarget
	reader: GhostIconReader
}

const DragGhostChip = ({
	tab,
	spaceId,
	target,
	reader,
}: DragGhostChipProps) => {
	const icon = useGhostIcon({ href: tab.href, spaceId, reader })
	return (
		<TitleBarTabChip
			icon={icon}
			isNotAllowed={target === "otherSpace"}
			placement="alone"
			title={tab.title}
		/>
	)
}

export const DragGhost = ({ view, reader }: DragGhostProps) => {
	const { tab, state, showCount } = useControllerState(view)
	if (!tab) {
		return null
	}
	const heldState = state?.tabId === tab.tabId ? state : null
	const target = heldState?.target ?? "outside"
	if (target === "sameSpace") {
		return null
	}
	return (
		<DragGhostChip
			key={showCount}
			reader={reader}
			spaceId={heldState?.spaceId ?? null}
			tab={tab}
			target={target}
		/>
	)
}
