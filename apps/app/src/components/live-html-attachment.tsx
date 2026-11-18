import { LiveHtmlSlot } from "@workspace/ui/components/live-html-slot"
import { i18n } from "@workspace/ui/lib/i18n"

import { mountingAttachment } from "@/lib/live-html/live-html-view"
import { useLiveHtmlTheme } from "@/lib/live-html/use-live-html-theme"
import { useLiveHtmlView } from "@/lib/live-html/use-live-html-view"

type LiveHtmlAttachmentProps = {
	path: string
	onFailed: () => void
}

export const LiveHtmlAttachment = ({
	path,
	onFailed,
}: LiveHtmlAttachmentProps) => {
	const { status, height, still, onPlacementChange } = useLiveHtmlView(
		mountingAttachment(path),
		useLiveHtmlTheme(),
		{
			refusalNotice: i18n.t("chat:liveHtml.unavailableWithoutCode"),
			onFailed,
		},
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
