import { TabDragThumbnail } from "@workspace/ui/components/tab-drag-thumbnail"
import { useChatCopy } from "@workspace/ui/hooks/use-chat-copy"

import type { DragGhostTab, WindowSize } from "@/lib/bindings"
import type { DockTarget } from "@/lib/tabs/drag-ghost-state"
import type { DragGhostViewStore } from "@/lib/tabs/drag-ghost-view"
import { tabFaceOf } from "@/lib/tabs/tab-faces"
import { type GhostCardReader, useGhostCard } from "@/lib/tabs/use-ghost-card"
import { useControllerState } from "@/lib/use-controller"

type DragGhostProps = {
	view: DragGhostViewStore
	reader: GhostCardReader
}

type DragGhostCardProps = {
	tab: DragGhostTab
	spaceId: string | null
	target: DockTarget
	size: WindowSize
	reader: GhostCardReader
}

const DragGhostCard = ({
	tab,
	spaceId,
	target,
	size,
	reader,
}: DragGhostCardProps) => {
	const t = useChatCopy()
	const { companionName, faces, messages } = useGhostCard({
		href: tab.href,
		spaceId,
		reader,
	})
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
			isNotAllowed={target === "otherSpace"}
			messages={messages}
			title={tab.title}
			width={size.width}
		/>
	)
}

export const DragGhost = ({ view, reader }: DragGhostProps) => {
	const { tab, state, size, showCount } = useControllerState(view)
	if (!tab) {
		return null
	}
	const heldState = state?.tabId === tab.tabId ? state : null
	const target = heldState?.target ?? "outside"
	if (target === "sameSpace") {
		return null
	}
	return (
		<DragGhostCard
			key={showCount}
			reader={reader}
			size={size}
			spaceId={heldState?.spaceId ?? null}
			tab={tab}
			target={target}
		/>
	)
}
