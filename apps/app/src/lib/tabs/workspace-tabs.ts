import {
	createHistory,
	type HistoryLocation,
	type RouterHistory,
} from "@tanstack/react-router"

import { i18n } from "@workspace/ui/lib/i18n"

import { goneMissionIdsOf, type ReadMission } from "./restored-missions"
import { EMPTY_LIST_HREF, HREF_BASE, pageOf, rowIdsNamedBy } from "./tab-pages"
import {
	discardSecondaryWindowTabs,
	MAIN_WINDOW_LABEL,
	readSpaceTabs,
	writeSpaceTabs,
} from "./tabs-mirror"
import {
	activeTabOf,
	type ClosedTab,
	closeActiveTab,
	closeOtherTabs,
	closeTab,
	currentEntryOf,
	currentHrefOf,
	dropTabsWhere,
	duplicateTab,
	moveInHistory,
	openBackgroundTab,
	openEmptyTab,
	pinTab,
	pushEntry,
	reopenTab,
	reorderTabs,
	replaceEntry,
	type SpaceTabs,
	selectTab,
	spaceTabsOn,
	type Tab,
	type TabEntry,
	tabsClosedBetween,
	unpinTab,
} from "./tabs-model"

import { commands } from "../bindings"
import {
	describeFailure,
	raiseReportedFailure,
	type UnreportedFailureNotice,
} from "../failure-report"
import { closeWindow } from "../host"
import { createStore } from "../store"

const NO_SPACE = ""

const MAX_CLOSED_TABS = 10

export type WorkspaceTabsState = {
	spaceId: string
	bySpace: Record<string, SpaceTabs>
	restoredSpaceIds: string[]
	closedBySpace: Record<string, ClosedTab[]>
}

type LeaveGuard = (leave: () => void) => void

export type WorkspaceTabs = {
	history: RouterHistory
	getState: () => WorkspaceTabsState
	subscribe: (listener: () => void) => () => void
	showSpace: (spaceId: string) => void
	openEmptyTab: () => void
	openInNewTab: (href: string, spaceId?: string) => void
	back: () => void
	forward: () => void
	select: (id: string) => void
	pin: (id: string) => void
	unpin: (id: string) => void
	close: (id: string) => void
	closeActive: () => void
	closeOthers: (id: string) => void
	duplicate: (id: string) => void
	moveToNewWindow: (id: string) => Promise<void>
	reopenClosed: () => void
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

export const closedTabsOf = ({ spaceId, closedBySpace }: WorkspaceTabsState) =>
	closedBySpace[spaceId] ?? []

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

const raiseWindowFailure = (
	notice: UnreportedFailureNotice,
	command?: string,
) => {
	raiseReportedFailure(notice, { raisedIn: "workspace-tabs", command })
}

const closeThisWindow = () => {
	closeWindow().catch(() =>
		raiseWindowFailure({
			title: i18n.t("common:windowControls.failure.close"),
		}),
	)
}

type WindowOpening = { isOpened: true } | { isOpened: false; reason?: string }

const reasonOf = (error: unknown) =>
	(error == null ? "" : describeFailure(error).trim()) || undefined

const openWindowOn = (href: string): Promise<WindowOpening> =>
	commands.windowOpen(href).then(
		(opened) =>
			opened.status === "ok"
				? { isOpened: true }
				: { isOpened: false, reason: reasonOf(opened.error) },
		(error: unknown) => ({ isOpened: false, reason: reasonOf(error) }),
	)

const moveFailureOf = (reason: string | undefined) => ({
	title: i18n.t("common:titleBar.moveTabFailed.title"),
	description:
		reason === undefined
			? i18n.t("common:titleBar.moveTabFailed.description")
			: i18n.t("common:titleBar.moveTabFailed.descriptionWithReason", {
					reason,
				}),
})

const isOnlyTab = (space: SpaceTabs | undefined, id: string) =>
	space?.tabs.length === 1 && space.tabs[0]?.id === id

export const createWorkspaceTabs = (
	initialHref = EMPTY_LIST_HREF,
	windowLabel = MAIN_WINDOW_LABEL,
): WorkspaceTabs => {
	const isMainWindow = windowLabel === MAIN_WINDOW_LABEL
	if (isMainWindow) {
		discardSecondaryWindowTabs()
	}
	const store = createStore<WorkspaceTabsState>({
		spaceId: NO_SPACE,
		bySpace: { [NO_SPACE]: spaceTabsOn(initialHref) },
		restoredSpaceIds: [],
		closedBySpace: {},
	})
	const shown = () => shownTabsOf(store.getState())

	const keepIn = (spaceId: string, space: SpaceTabs) => {
		if (spaceId !== NO_SPACE) {
			writeSpaceTabs(windowLabel, spaceId, space)
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

	const keepClosed = (closed: ClosedTab[]) => {
		const state = store.getState()
		store.setState({
			...state,
			closedBySpace: {
				...state.closedBySpace,
				[state.spaceId]: closed.slice(-MAX_CLOSED_TABS),
			},
		})
	}

	const closesEveryTab = (update: (space: SpaceTabs) => SpaceTabs) => {
		const before = shown()
		return (
			tabsClosedBetween(before, update(before)).length === before.tabs.length
		)
	}

	const closingChange = (update: (space: SpaceTabs) => SpaceTabs) =>
		askIfLeaving(update, () => {
			if (!isMainWindow && closesEveryTab(update)) {
				closeThisWindow()
				return
			}
			const before = shown()
			change(update)
			const closed = tabsClosedBetween(before, shown())
			if (closed.length > 0) {
				keepClosed([...closedTabsOf(store.getState()), ...closed])
			}
		})

	const reopenClosed = () => {
		const last = closedTabsOf(store.getState()).at(-1)
		if (!last) {
			return
		}
		const reopen = (space: SpaceTabs) => reopenTab(space, last)
		askIfLeaving(reopen, () => {
			keepClosed(
				closedTabsOf(store.getState()).filter((closed) => closed !== last),
			)
			change(reopen)
		})
	}

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

	const heldOrRestoredTabsOf = (spaceId: string) => {
		const held = store.getState().bySpace[spaceId]
		if (held) {
			return { space: held, isRestored: false }
		}
		const restored = readSpaceTabs(windowLabel, spaceId)
		return restored ? { space: restored, isRestored: true } : null
	}

	const reachedTabsOf = (spaceId: string) => {
		const isBooting = store.getState().spaceId === NO_SPACE
		if (isBooting && !isMainWindow) {
			return { space: shown(), isRestored: false }
		}
		const fresh = isBooting ? shown() : spaceTabsOn(EMPTY_LIST_HREF)
		return heldOrRestoredTabsOf(spaceId) ?? { space: fresh, isRestored: false }
	}

	const changeAway = (
		spaceId: string,
		update: (space: SpaceTabs) => SpaceTabs,
	) => {
		const { space, isRestored } = heldOrRestoredTabsOf(spaceId) ?? {
			space: spaceTabsOn(EMPTY_LIST_HREF),
			isRestored: false,
		}
		if (isRestored) {
			const state = store.getState()
			store.setState({
				...state,
				restoredSpaceIds: [...state.restoredSpaceIds, spaceId],
			})
		}
		keepIn(spaceId, update(space))
	}

	const removeMoved = (spaceId: string, id: string) => {
		if (!isMainWindow && isOnlyTab(store.getState().bySpace[spaceId], id)) {
			closeThisWindow()
			return
		}
		changeIn(spaceId, (space) => closeTab(space, id))
	}

	const moveToNewWindow = async (id: string) => {
		const { spaceId } = store.getState()
		const moved = shown().tabs.find((tab) => tab.id === id)
		if (!moved) {
			return
		}
		const opening = await openWindowOn(currentHrefOf(moved))
		if (opening.isOpened) {
			removeMoved(spaceId, id)
			return
		}
		raiseWindowFailure(moveFailureOf(opening.reason), "window_open")
	}

	const reachSpace = (spaceId: string) => {
		const state = store.getState()
		const { space, isRestored } = reachedTabsOf(spaceId)
		showChange(() =>
			store.setState({
				...state,
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
		openInNewTab: (href, spaceId = store.getState().spaceId) => {
			const update = (space: SpaceTabs) => openBackgroundTab(space, href)
			if (spaceId === store.getState().spaceId) {
				change(update)
				return
			}
			changeAway(spaceId, update)
		},
		back: () => askingMove(-1, () => history.back()),
		forward: () => askingMove(1, () => history.forward()),
		select: (id) => askingChange((space) => selectTab(space, id)),
		pin: (id) => change((space) => pinTab(space, id)),
		unpin: (id) => change((space) => unpinTab(space, id)),
		close: (id) => closingChange((space) => closeTab(space, id)),
		closeActive: () => closingChange(closeActiveTab),
		closeOthers: (id) => closingChange((space) => closeOtherTabs(space, id)),
		duplicate: (id) => change((space) => duplicateTab(space, id)),
		moveToNewWindow,
		reopenClosed,
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
