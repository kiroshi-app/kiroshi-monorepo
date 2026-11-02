import { DRAG_GHOST_STATE_EVENT, type DragGhostState } from "./drag-ghost-state"

import {
	commands,
	DRAG_GHOST_TAB_EVENT,
	type DragGhostTab,
	type WindowSize,
} from "../bindings"
import { createStore } from "../store"
import { listenOnThisWindow } from "../host/window-listen"

type DragGhostView = {
	tab: DragGhostTab | null
	state: DragGhostState | null
	size: WindowSize
	showCount: number
}

type GhostTabReader = () => Promise<DragGhostTab | null>

const ghostWindowSize = (): WindowSize => ({
	width: window.innerWidth,
	height: window.innerHeight,
})

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
		size: ghostWindowSize(),
		showCount: 0,
	})

	const showTab = (tab: DragGhostTab) => {
		const held = store.getState()
		store.setState({
			...held,
			tab,
			size: ghostWindowSize(),
			showCount: held.showCount + 1,
		})
	}

	const showAnsweredTab = (tab: DragGhostTab | null) => {
		if (tab && store.getState().tab === null) {
			showTab(tab)
		}
	}

	const showState = (state: DragGhostState) =>
		store.setState({ ...store.getState(), state })

	const showSize = () =>
		store.setState({ ...store.getState(), size: ghostWindowSize() })

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
			window.addEventListener("resize", showSize)
			await readTab().then(showAnsweredTab, reportUnreadTab)
			return () => {
				stopListeningTabs()
				stopListeningState()
				window.removeEventListener("resize", showSize)
			}
		},
	}
}

export type DragGhostViewStore = ReturnType<typeof createDragGhostView>
