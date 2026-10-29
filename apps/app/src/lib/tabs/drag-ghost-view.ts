import {
	type GhostThumbnail,
	readGhostThumbnail,
	watchGhostThumbnail,
} from "./ghost-thumbnail"

import { DRAG_GHOST_TAB_EVENT, type DragGhostTab } from "../bindings"
import { createStore } from "../store"
import { listenOnThisWindow } from "../host/window-listen"

type DragGhostView = {
	tab: DragGhostTab | null
	thumbnail: GhostThumbnail | null
}

export const createDragGhostView = (listen = listenOnThisWindow) => {
	const store = createStore<DragGhostView>({
		tab: null,
		thumbnail: readGhostThumbnail(),
	})

	const showThumbnail = () =>
		store.setState({ ...store.getState(), thumbnail: readGhostThumbnail() })

	const showTab = (tab: DragGhostTab) =>
		store.setState({ tab, thumbnail: readGhostThumbnail() })

	return {
		getState: store.getState,
		subscribe: store.subscribe,
		watch: async () => {
			const stopWatchingThumbnail = watchGhostThumbnail(showThumbnail)
			const stopListening = await listen<DragGhostTab>(
				DRAG_GHOST_TAB_EVENT,
				({ payload }) => showTab(payload),
			)
			return () => {
				stopWatchingThumbnail()
				stopListening()
			}
		},
	}
}

export type DragGhostViewStore = ReturnType<typeof createDragGhostView>
