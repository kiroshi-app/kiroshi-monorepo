import { TabDragThumbnail } from "@workspace/ui/components/tab-drag-thumbnail"
import { useChatCopy } from "@workspace/ui/hooks/use-chat-copy"

import type { DragGhostViewStore } from "@/lib/tabs/drag-ghost-view"
import { tabFaceOf } from "@/lib/tabs/tab-faces"
import { useControllerState } from "@/lib/use-controller"

type DragGhostProps = {
	view: DragGhostViewStore
}

export const DragGhost = ({ view }: DragGhostProps) => {
	const t = useChatCopy()
	const { tab, thumbnail } = useControllerState(view)
	if (!tab || thumbnail?.tabId !== tab.tabId) {
		return null
	}
	const { companionName, messages, size, faces } = thumbnail
	return (
		<TabDragThumbnail
			companionName={companionName}
			composerPlaceholder={
				companionName === ""
					? t("composer.placeholder")
					: t("screen.placeholder", { name: companionName })
			}
			height={size.height}
			icon={tabFaceOf(tab.href, faces).icon}
			messages={messages}
			title={tab.title}
			width={size.width}
		/>
	)
}
