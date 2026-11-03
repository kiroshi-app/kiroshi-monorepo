import { DRAG_GHOST_STATE_EVENT, type DragGhostState } from "./drag-ghost-state"

import { commands, DRAG_GHOST_TAB_EVENT, type DragGhostTab } from "../bindings"
import { createStore } from "../store"
import { listenOnThisWindow } from "../host/window-listen"

type DragGhostView = {
	tab: DragGhostTab | null
	state: DragGhostState | null
	showCount: number
}

type GhostTabReader = () => Promise<DragGhostTab | null>

const reportUnreadTab = (reason: unknown) => {
	console.error("the drag ghost could not read its tab", reason)
}

export const createDragGhostView = (
	listen = listenOnThisWindow,
	readTab: GhostTabReader = commands.dragGhostTab,
) => {
	const store = createStore<DragGhostView>({
		tab: null,
		state: null,
		showCount: 0,
	})

	const showTab = (tab: DragGhostTab) => {
		const held = store.getState()
		store.setState({ ...held, tab, showCount: held.showCount + 1 })
	}

	const showAnsweredTab = (tab: DragGhostTab | null) => {
		if (tab && store.getState().tab === null) {
			showTab(tab)
		}
	}

	const showState = (state: DragGhostState) =>
		store.setState({ ...store.getState(), state })

	return {
		getState: store.getState,
		subscribe: store.subscribe,
		watch: async () => {
			const stopListeningTabs = await listen<DragGhostTab>(
				DRAG_GHOST_TAB_EVENT,
				({ payload }) => showTab(payload),
			)
			const stopListeningState = await listen<DragGhostState>(
				DRAG_GHOST_STATE_EVENT,
				({ payload }) => showState(payload),
			)
			await readTab().then(showAnsweredTab, reportUnreadTab)
			return () => {
				stopListeningTabs()
				stopListeningState()
			}
		},
	}
}

export type DragGhostViewStore = ReturnType<typeof createDragGhostView>
