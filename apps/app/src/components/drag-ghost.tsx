import { TabDragThumbnail } from "@workspace/ui/components/tab-drag-thumbnail"
import { useChatCopy } from "@workspace/ui/hooks/use-chat-copy"

import type { DragGhostViewStore } from "@/lib/tabs/drag-ghost-view"
import { type TabFaceSources, tabFaceOf } from "@/lib/tabs/tab-faces"
import { useControllerState } from "@/lib/use-controller"

type DragGhostProps = {
	view: DragGhostViewStore
}

const NO_FACES: TabFaceSources = {
	bots: [],
	conversations: [],
	missionTitles: {},
}

export const DragGhost = ({ view }: DragGhostProps) => {
	const t = useChatCopy()
	const { tab, isNotAllowed, size } = useControllerState(view)
	if (!tab) {
		return null
	}
	return (
		<TabDragThumbnail
			companionName=""
			composerPlaceholder={t("composer.placeholder")}
			height={size.height}
			icon={tabFaceOf(tab.href, NO_FACES).icon}
			isNotAllowed={isNotAllowed}
			messages={[]}
			title={tab.title}
			width={size.width}
		/>
	)
}
