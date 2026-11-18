import { LiveHtmlSlot } from "@workspace/ui/components/live-html-slot"
import { i18n } from "@workspace/ui/lib/i18n"

import { mountingHtml } from "@/lib/live-html/live-html-view"
import { useLiveHtmlTheme } from "@/lib/live-html/use-live-html-theme"
import { useLiveHtmlView } from "@/lib/live-html/use-live-html-view"

type LiveHtmlBlockProps = {
	html: string
}

export const LiveHtmlBlock = ({ html }: LiveHtmlBlockProps) => {
	const { status, height, still, onPlacementChange } = useLiveHtmlView(
		mountingHtml(html),
		useLiveHtmlTheme(),
		{ refusalNotice: i18n.t("chat:liveHtml.unavailableWithCode") },
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
