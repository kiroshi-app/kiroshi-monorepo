import { LiveHtmlSlot } from "@workspace/ui/components/live-html-slot"

import { useLiveHtmlView } from "@/lib/live-html/use-live-html-view"

type LiveHtmlBlockProps = {
	html: string
}

export const LiveHtmlBlock = ({ html }: LiveHtmlBlockProps) => {
	const { status, onRectChange } = useLiveHtmlView(html)

	return (
		<LiveHtmlSlot html={html} onRectChange={onRectChange} status={status} />
	)
}
