import { TitleBarTabChip } from "@workspace/ui/components/title-bar-tab-chip"

import type { DragGhostViewStore } from "@/lib/tabs/drag-ghost-view"
import { type TabFaceSources, tabFaceOf } from "@/lib/tabs/tab-faces"
import { useControllerState } from "@/lib/use-controller"

type DragGhostProps = {
	view: DragGhostViewStore
}

const NO_FACE_SOURCES: TabFaceSources = {
	bots: [],
	conversations: [],
	missionTitles: {},
}

export const DragGhost = ({ view }: DragGhostProps) => {
	const { tab, state } = useControllerState(view)
	if (!tab) {
		return null
	}
	const target = state?.tabId === tab.tabId ? state.target : "outside"
	if (target === "sameSpace") {
		return null
	}
	return (
		<TitleBarTabChip
			icon={tabFaceOf(tab.href, NO_FACE_SOURCES).icon}
			isNotAllowed={target === "otherSpace"}
			placement="alone"
			title={tab.title}
		/>
	)
}
