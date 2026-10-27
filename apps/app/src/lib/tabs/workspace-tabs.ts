import {
	createHistory,
	type HistoryLocation,
	type RouterHistory,
} from "@tanstack/react-router"

import { goneMissionIdsOf, type ReadMission } from "./restored-missions"
import { EMPTY_LIST_HREF, HREF_BASE, pageOf, rowIdsNamedBy } from "./tab-pages"
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
	openBackgroundTab,
	openEmptyTab,
	pinTab,
	pushEntry,
	reorderTabs,
	replaceEntry,
	type SpaceTabs,
	selectTab,
	spaceTabsOn,
	type Tab,
	type TabEntry,
	unpinTab,
} from "./tabs-model"

import { createStore } from "../store"

const NO_SPACE = ""

export type WorkspaceTabsState = {
	spaceId: string
	bySpace: Record<string, SpaceTabs>
	restoredSpaceIds: string[]
}

type LeaveGuard = (leave: () => void) => void

export type WorkspaceTabs = {
	history: RouterHistory
	getState: () => WorkspaceTabsState
	subscribe: (listener: () => void) => () => void
	showSpace: (spaceId: string) => void
	openEmptyTab: () => void
	openInNewTab: (href: string) => void
	back: () => void
	forward: () => void
	select: (id: string) => void
	pin: (id: string) => void
	unpin: (id: string) => void
	close: (id: string) => void
	closeActive: () => void
	closeOthers: (id: string) => void
	reorder: (ids: string[]) => void
	dropAbsentRestored: (spaceId: string, check: RestoredCheck) => Promise<void>
	guardLeave: (guard: LeaveGuard) => () => void
	leaveAsked: (gesture: () => void) => void
}

type RestoredCheck = {
	isRowPresent: (id: string) => boolean
	readMission: ReadMission
}

export const shownTabsOf = ({ spaceId, bySpace }: WorkspaceTabsState) =>
	bySpace[spaceId] ?? spaceTabsOn(EMPTY_LIST_HREF)

const locationOf = ({ href, state }: TabEntry): HistoryLocation => {
	const { pathname, search, hash } = new URL(href, HREF_BASE)
	return { href, pathname, search, hash, state }
}

const shownEntryOf = (space: SpaceTabs) => currentEntryOf(activeTabOf(space))

const isNamingAnAbsentRow = (
	href: string,
	isPresent: (id: string) => boolean,
) => rowIdsNamedBy(href).some((id) => !isPresent(id))

const missionOfTab = (tab: Tab) => pageOf(currentHrefOf(tab)).thread.mission

export const createWorkspaceTabs = (
	initialHref = EMPTY_LIST_HREF,
): WorkspaceTabs => {
	const store = createStore<WorkspaceTabsState>({
		spaceId: NO_SPACE,
		bySpace: { [NO_SPACE]: spaceTabsOn(initialHref) },
		restoredSpaceIds: [],
	})
	const shown = () => shownTabsOf(store.getState())

	const keepIn = (spaceId: string, space: SpaceTabs) => {
		if (spaceId !== NO_SPACE) {
			writeSpaceTabs(spaceId, space)
		}
		const state = store.getState()
		store.setState({
			...state,
			bySpace: { ...state.bySpace, [spaceId]: space },
		})
	}

	const keep = (space: SpaceTabs) => keepIn(store.getState().spaceId, space)

	const history = createHistory({
		getLocation: () => locationOf(shownEntryOf(shown())),
		getLength: () => activeTabOf(shown()).entries.length,
		pushState: (href, state) => keep(pushEntry(shown(), { href, state })),
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

	let leaveGuard: LeaveGuard | undefined
	let isLeaveAsked = false

	const leaveAsked = (gesture: () => void) => {
		const wasAsked = isLeaveAsked
		isLeaveAsked = true
		try {
			gesture()
		} finally {
			isLeaveAsked = wasAsked
		}
	}

	const askBeforeLeaving = (gesture: () => void) => {
		if (!leaveGuard || isLeaveAsked) {
			gesture()
			return
		}
		leaveGuard(() => leaveAsked(gesture))
	}

	const leavesShown = (update: (space: SpaceTabs) => SpaceTabs) =>
		shownEntryOf(update(shown())) !== shownEntryOf(shown())

	const askIfLeaving = (
		update: (space: SpaceTabs) => SpaceTabs,
		gesture: () => void,
	) => (leavesShown(update) ? askBeforeLeaving(gesture) : gesture())

	const askingChange = (update: (space: SpaceTabs) => SpaceTabs) =>
		askIfLeaving(update, () => change(update))

	const askingMove = (steps: number, move: () => void) =>
		askIfLeaving((space) => moveInHistory(space, steps), move)

	const changeIn = (
		spaceId: string,
		update: (space: SpaceTabs) => SpaceTabs,
	) => {
		const held = store.getState().bySpace[spaceId]
		if (spaceId === store.getState().spaceId) {
			change(update)
		} else if (held) {
			keepIn(spaceId, update(held))
		}
	}

	const missionIdsIn = (spaceId: string) =>
		(store.getState().bySpace[spaceId]?.tabs ?? [])
			.map(missionOfTab)
			.filter((mission) => mission !== undefined)

	const dropGoneMissions = async (
		spaceId: string,
		readMission: ReadMission,
	) => {
		const goneIds = await goneMissionIdsOf(readMission, missionIdsIn(spaceId))
		if (goneIds.length === 0) {
			return
		}
		changeIn(spaceId, (space) =>
			dropTabsWhere(space, (tab) =>
				goneIds.some((id) => id === missionOfTab(tab)),
			),
		)
	}

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

	const reachSpace = (spaceId: string) => {
		const state = store.getState()
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
			askBeforeLeaving(() => reachSpace(spaceId))
		},
		openEmptyTab: () => askingChange(openEmptyTab),
		openInNewTab: (href) => change((space) => openBackgroundTab(space, href)),
		back: () => askingMove(-1, () => history.back()),
		forward: () => askingMove(1, () => history.forward()),
		select: (id) => askingChange((space) => selectTab(space, id)),
		pin: (id) => change((space) => pinTab(space, id)),
		unpin: (id) => change((space) => unpinTab(space, id)),
		close: (id) => askingChange((space) => closeTab(space, id)),
		closeActive: () => askingChange(closeActiveTab),
		closeOthers: (id) => askingChange((space) => closeOtherTabs(space, id)),
		reorder: (ids) => change((space) => reorderTabs(space, ids)),
		dropAbsentRestored: async (spaceId, { isRowPresent, readMission }) => {
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
					isNamingAnAbsentRow(currentHrefOf(tab), isRowPresent),
				),
			)
			await dropGoneMissions(spaceId, readMission)
		},
		guardLeave: (guard) => {
			leaveGuard = guard
			return () => {
				if (leaveGuard === guard) {
					leaveGuard = undefined
				}
			}
		},
		leaveAsked,
	}
}
