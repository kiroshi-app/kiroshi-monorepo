import {
	createHistory,
	type HistoryLocation,
	type RouterHistory,
} from "@tanstack/react-router"

import { EMPTY_LIST_HREF, HREF_BASE, rowIdsNamedBy } from "./tab-pages"
import { readSpaceTabs, writeSpaceTabs } from "./tabs-mirror"
import {
	activeTabOf,
	closeActiveTab,
	closeOtherTabs,
	closeTab,
	currentEntryOf,
	currentHrefOf,
	dropTabsWhere,
	moveInHistory,
	openTab,
	pinTab,
	pushEntry,
	reorderTabs,
	replaceEntry,
	type SpaceTabs,
	selectTab,
	spaceTabsOn,
	type TabEntry,
	tabShowing,
	unpinTab,
} from "./tabs-model"

import { createStore } from "../store"

const NO_SPACE = ""

export type WorkspaceTabsState = {
	spaceId: string
	bySpace: Record<string, SpaceTabs>
	restoredSpaceIds: string[]
}

export type WorkspaceTabs = {
	history: RouterHistory
	getState: () => WorkspaceTabsState
	subscribe: (listener: () => void) => () => void
	showSpace: (spaceId: string) => void
	openEmptyTab: () => void
	openInNewTab: (href: string) => void
	select: (id: string) => void
	pin: (id: string) => void
	unpin: (id: string) => void
	close: (id: string) => void
	closeActive: () => void
	closeOthers: (id: string) => void
	reorder: (ids: string[]) => void
	dropAbsentRestored: (
		spaceId: string,
		isPresent: (id: string) => boolean,
	) => void
}

export const shownTabsOf = ({ spaceId, bySpace }: WorkspaceTabsState) =>
	bySpace[spaceId] ?? spaceTabsOn(EMPTY_LIST_HREF)

const locationOf = ({ href, state }: TabEntry): HistoryLocation => {
	const { pathname, search, hash } = new URL(href, HREF_BASE)
	return { href, pathname, search, hash, state }
}

const shownEntryOf = (space: SpaceTabs) => currentEntryOf(activeTabOf(space))

const pushedIn = (space: SpaceTabs, entry: TabEntry) => {
	const shownElsewhere = tabShowing(space, entry.href)
	if (!shownElsewhere || shownElsewhere.id === space.activeId) {
		return pushEntry(space, entry)
	}
	const selected = selectTab(space, shownElsewhere.id)
	return replaceEntry(selected, {
		href: entry.href,
		state: currentEntryOf(shownElsewhere).state,
	})
}

const isNamingAnAbsentRow = (
	href: string,
	isPresent: (id: string) => boolean,
) => rowIdsNamedBy(href).some((id) => !isPresent(id))

export const createWorkspaceTabs = (
	initialHref = EMPTY_LIST_HREF,
): WorkspaceTabs => {
	const store = createStore<WorkspaceTabsState>({
		spaceId: NO_SPACE,
		bySpace: { [NO_SPACE]: spaceTabsOn(initialHref) },
		restoredSpaceIds: [],
	})
	const shown = () => shownTabsOf(store.getState())

	const keep = (space: SpaceTabs) => {
		const state = store.getState()
		if (state.spaceId !== NO_SPACE) {
			writeSpaceTabs(state.spaceId, space)
		}
		store.setState({
			...state,
			bySpace: { ...state.bySpace, [state.spaceId]: space },
		})
	}

	const history = createHistory({
		getLocation: () => locationOf(shownEntryOf(shown())),
		getLength: () => activeTabOf(shown()).entries.length,
		pushState: (href, state) => keep(pushedIn(shown(), { href, state })),
		replaceState: (href, state) => keep(replaceEntry(shown(), { href, state })),
		back: () => keep(moveInHistory(shown(), -1)),
		forward: () => keep(moveInHistory(shown(), 1)),
		go: (steps) => keep(moveInHistory(shown(), steps)),
		createHref: (href) => href,
	})

	const showChange = (change: () => void) => {
		const before = shownEntryOf(shown())
		change()
		if (shownEntryOf(shown()) !== before) {
			history.notify({ type: "PUSH" })
		}
	}

	const change = (update: (space: SpaceTabs) => SpaceTabs) =>
		showChange(() => keep(update(shown())))

	const reachedTabsOf = (spaceId: string) => {
		const state = store.getState()
		const held = state.bySpace[spaceId]
		if (held) {
			return { space: held, isRestored: false }
		}
		const restored = readSpaceTabs(spaceId)
		if (restored) {
			return { space: restored, isRestored: true }
		}
		const fresh =
			state.spaceId === NO_SPACE ? shown() : spaceTabsOn(EMPTY_LIST_HREF)
		return { space: fresh, isRestored: false }
	}

	return {
		history,
		getState: store.getState,
		subscribe: store.subscribe,
		showSpace: (spaceId) => {
			const state = store.getState()
			if (spaceId === state.spaceId) {
				return
			}
			const { space, isRestored } = reachedTabsOf(spaceId)
			showChange(() =>
				store.setState({
					spaceId,
					bySpace: { ...state.bySpace, [spaceId]: space },
					restoredSpaceIds: isRestored
						? [...state.restoredSpaceIds, spaceId]
						: state.restoredSpaceIds,
				}),
			)
		},
		openEmptyTab: () => change((space) => openTab(space, EMPTY_LIST_HREF)),
		openInNewTab: (href) => change((space) => openTab(space, href)),
		select: (id) => change((space) => selectTab(space, id)),
		pin: (id) => change((space) => pinTab(space, id)),
		unpin: (id) => change((space) => unpinTab(space, id)),
		close: (id) => change((space) => closeTab(space, id)),
		closeActive: () => change(closeActiveTab),
		closeOthers: (id) => change((space) => closeOtherTabs(space, id)),
		reorder: (ids) => change((space) => reorderTabs(space, ids)),
		dropAbsentRestored: (spaceId, isPresent) => {
			const state = store.getState()
			if (
				state.spaceId !== spaceId ||
				!state.restoredSpaceIds.includes(spaceId)
			) {
				return
			}
			store.setState({
				...state,
				restoredSpaceIds: state.restoredSpaceIds.filter(
					(restoredId) => restoredId !== spaceId,
				),
			})
			change((space) =>
				dropTabsWhere(space, (tab) =>
					isNamingAnAbsentRow(currentHrefOf(tab), isPresent),
				),
			)
		},
	}
}
