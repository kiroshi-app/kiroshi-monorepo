import { LIVE_HTML_MEASURED_EVENT, type LiveHtmlMeasured } from "@/lib/bindings"
import { listenOnThisWindow } from "@/lib/host/window-listen"

const isPageHeight = (height: number | null): height is number =>
	height !== null && Number.isFinite(height) && height > 0

export const listenToPageHeight = (
	id: string,
	onHeight: (height: number) => void,
) =>
	listenOnThisWindow<LiveHtmlMeasured>(
		LIVE_HTML_MEASURED_EVENT,
		({ payload }) => {
			if (payload.id === id && isPageHeight(payload.height)) {
				onHeight(payload.height)
			}
		},
	)
