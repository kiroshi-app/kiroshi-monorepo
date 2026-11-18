import { LiveHtmlSlot } from "@workspace/ui/components/live-html-slot"

import { mountingAttachment } from "@/lib/live-html/live-html-view"
import { useLiveHtmlView } from "@/lib/live-html/use-live-html-view"

type LiveHtmlAttachmentProps = {
	path: string
	onUnavailable: () => void
}

export const LiveHtmlAttachment = ({
	path,
	onUnavailable,
}: LiveHtmlAttachmentProps) => {
	const { status, height, still, onPlacementChange } = useLiveHtmlView(
		mountingAttachment(path),
		onUnavailable,
	)

	return (
		<LiveHtmlSlot
			height={height}
			html=""
			onPlacementChange={onPlacementChange}
			status={status}
			still={still}
		/>
	)
}
