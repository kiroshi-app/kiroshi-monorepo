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
	isNotAllowed: boolean
	size: WindowSize
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
		isNotAllowed: false,
		size: ghostWindowSize(),
	})

	const showTab = (tab: DragGhostTab) => {
		const held = store.getState()
		const isSameTab = held.tab?.tabId === tab.tabId
		store.setState({
			tab,
			isNotAllowed: isSameTab && held.isNotAllowed,
			size: ghostWindowSize(),
		})
	}

	const showAnsweredTab = (tab: DragGhostTab | null) => {
		if (tab && store.getState().tab === null) {
			showTab(tab)
		}
	}

	const showState = ({ tabId, isNotAllowed }: DragGhostState) => {
		const held = store.getState()
		if (held.tab?.tabId === tabId) {
			store.setState({ ...held, isNotAllowed })
		}
	}

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
