import {
	LIVE_HTML_LOADED_EVENT,
	type LiveHtmlError,
	type LiveHtmlLoaded,
} from "@/lib/bindings"
import { listenOnThisWindow } from "@/lib/host/window-listen"

export const listenToPageLoad = (
	id: string,
	onLoaded: (failure: LiveHtmlError | null) => void,
) =>
	listenOnThisWindow<LiveHtmlLoaded>(LIVE_HTML_LOADED_EVENT, ({ payload }) => {
		if (payload.id === id) onLoaded(payload.failure)
	})
