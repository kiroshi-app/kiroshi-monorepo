import { LiveHtmlSlot } from "@workspace/ui/components/live-html-slot"

import { mountingHtml } from "@/lib/live-html/live-html-view"
import { useLiveHtmlView } from "@/lib/live-html/use-live-html-view"

type LiveHtmlBlockProps = {
	html: string
}

export const LiveHtmlBlock = ({ html }: LiveHtmlBlockProps) => {
	const { status, height, still, onPlacementChange } = useLiveHtmlView(
		mountingHtml(html),
	)

	return (
		<LiveHtmlSlot
			height={height}
			html={html}
			onPlacementChange={onPlacementChange}
			status={status}
			still={still}
		/>
	)
}
