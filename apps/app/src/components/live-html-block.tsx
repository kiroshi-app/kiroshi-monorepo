import { LiveHtmlSlot } from "@workspace/ui/components/live-html-slot"

import { mountingHtml } from "@/lib/live-html/live-html-view"
import { useLiveHtmlView } from "@/lib/live-html/use-live-html-view"

type LiveHtmlBlockProps = {
	html: string
}

export const LiveHtmlBlock = ({ html }: LiveHtmlBlockProps) => {
	const { status, onPlacementChange } = useLiveHtmlView(mountingHtml(html))

	return (
		<LiveHtmlSlot
			html={html}
			onPlacementChange={onPlacementChange}
			status={status}
		/>
	)
}
