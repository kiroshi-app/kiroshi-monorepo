import { LiveHtmlSlot } from "@workspace/ui/components/live-html-slot"

import { useLiveHtmlView } from "@/lib/live-html/use-live-html-view"

type LiveHtmlBlockProps = {
	html: string
}

export const LiveHtmlBlock = ({ html }: LiveHtmlBlockProps) => {
	const { status, onPlacementChange } = useLiveHtmlView(html)

	return (
		<LiveHtmlSlot
			html={html}
			onPlacementChange={onPlacementChange}
			status={status}
		/>
	)
}
