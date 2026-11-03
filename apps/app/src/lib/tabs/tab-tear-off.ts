import { i18n } from "@workspace/ui/lib/i18n"

import {
	type DockTarget,
	DRAG_GHOST_STATE_EVENT,
	DRAG_GHOST_WINDOW,
} from "./drag-ghost-state"
import { awaitDockAnswer } from "./tab-dock-channel"

import {
	commands,
	type DragGhostEnded,
	type DragGhostTab,
	type Json,
	type ScreenPosition,
	type WindowSize,
} from "../bindings"
import { raiseReportedFailure } from "../failure-report"
import {
	currentWindowLabel,
	emitToWindow,
	readPointerPosition,
	watchDragGhostEnded,
	watchNativeMoveEnded,
	watchNativeMoveFailed,
	watchWindowMoves,
} from "../host"

export type TabTearOff = {
	tabId: string
	screenX: number
	screenY: number
}

type DrawGhost = () => DragGhostTab

export type TabTearOffSession = {
	start: (tearOff: TabTearOff, drawGhost: DrawGhost) => void
	move: (tearOff: TabTearOff) => void
	cancel: () => void
	drop: (tearOff: TabTearOff) => true
}

export type TornTab = {
	packed: Json
	spaceId: string
	isOnlyTab: boolean
}

type TearOffMoves = {
	moveUnghosted: (tearOff: TabTearOff) => Promise<void>
	moveTornOff: (tearOff: TabTearOff, size: WindowSize) => Promise<void>
	raiseMoveFailure: (reason: unknown) => void
	tornTabOf: (tabId: string) => TornTab | null
	removeDocked: (spaceId: string, tabId: string) => Promise<boolean>
}

type GhostAnswer = Awaited<ReturnType<typeof commands.dragGhostShow>>

type HostAnswer = { status: "ok" } | { status: "error" }

type DockSite = {
	target: DockTarget
	label: string | null
}

type DragView = {
	isGhostSupported: boolean
	isGhostShown: boolean
	isAnnounced: boolean
	target: DockTarget
}

type Noticed = {
	isNoticed: boolean
}

type Failing = Noticed & {
	hasFailed: boolean
}

type Announced = {
	isAnnounced: boolean
}

type DockedDrag = Failing & {
	tabId: string
}

type TabDrag = DockedDrag & {
	kind: "tab"
	spaceId: string
	lastPoint: ScreenPosition
	view: Promise<DragView>
	unwatchEnded: Promise<() => void>
}

type WindowDrag = {
	kind: "window"
	tabId: string
}

type WindowView = Announced & {
	isHidden: boolean
	target: DockTarget
}

type WindowMove = DockedDrag & {
	spaceId: string
	isReleased: boolean
	view: Promise<WindowView>
	unwatchers: Promise<(() => void) | null>[]
	endWait?: ReturnType<typeof setTimeout>
}

type PointReader = () => Promise<ScreenPosition | null>

export const NATIVE_MOVE_END_WAIT_MS = 5000

export const pointOf = ({ screenX, screenY }: TabTearOff): ScreenPosition => ({
	x: Math.round(screenX),
	y: Math.round(screenY),
})

const originWindowSize = (): WindowSize => ({
	width: Math.round(window.innerWidth),
	height: Math.round(window.innerHeight),
})

const LIFTED_CHIP_SIZE: WindowSize = { width: 256, height: 28 }

const LIFTED_CHIP_SHADOW_BLEED = 32

const GHOST_SIZE: WindowSize = {
	width: LIFTED_CHIP_SIZE.width + LIFTED_CHIP_SHADOW_BLEED,
	height: LIFTED_CHIP_SIZE.height + LIFTED_CHIP_SHADOW_BLEED,
}

const isSupported = (answer: GhostAnswer) =>
	answer.status === "ok" && answer.data.supported

const reportGhostFailure = (reason: unknown) => {
	console.error("the drag ghost failed", reason)
	return false
}

const answerOf = (asking: Promise<GhostAnswer>) =>
	asking.then(isSupported, reportGhostFailure)

const hideGhost = () => answerOf(commands.dragGhostHide())

const raiseNoticeOnce = (
	drag: Noticed,
	notice: () => Parameters<typeof raiseReportedFailure>[0],
	command?: string,
) => {
	if (drag.isNoticed) {
		return
	}
	drag.isNoticed = true
	void raiseReportedFailure(notice(), { raisedIn: "tab-tear-off", command })
}

const ghostFailureNotice = () => ({
	title: i18n.t("common:titleBar.redockTabFailed.title"),
})

const failGhost = (drag: Noticed, command: string, reason: unknown) => {
	reportGhostFailure(reason)
	raiseNoticeOnce(drag, ghostFailureNotice, command)
	return false
}

const ghostAnswered = (
	drag: Noticed,
	command: string,
	asking: Promise<GhostAnswer>,
) =>
	asking.then(
		(answer) =>
			answer.status === "ok"
				? answer.data.supported
				: failGhost(drag, command, answer.error),
		(reason: unknown) => failGhost(drag, command, reason),
	)

const showGhost = (
	drag: TabDrag,
	point: ScreenPosition,
	ghostTab: DragGhostTab,
) =>
	ghostAnswered(
		drag,
		"drag_ghost_show",
		commands.dragGhostShow(point, GHOST_SIZE, ghostTab),
	)

const moveGhost = async (drag: TabDrag, point: ScreenPosition) => {
	if (
		await ghostAnswered(drag, "drag_ghost_move", commands.dragGhostMove(point))
	) {
		return true
	}
	await hideGhost()
	return false
}

const reportGhostStateFailure = (reason: unknown) => {
	console.error("the drag ghost did not hear its state", reason)
}

const sendGhostState = (drag: TabDrag, target: DockTarget) => {
	const state = { tabId: drag.tabId, spaceId: drag.spaceId, target }
	emitToWindow(DRAG_GHOST_WINDOW, DRAG_GHOST_STATE_EVENT, state).catch(
		reportGhostStateFailure,
	)
}

const reportHostFailure = (reason: unknown) => {
	console.error("the tab drag failed on the host", reason)
	return false
}

const isAccepted = (asking: Promise<HostAnswer>) =>
	asking.then((answer) => answer.status === "ok", reportHostFailure)

const reportUnanswered = (reason: unknown) => {
	reportHostFailure(reason)
	return null
}

const dockSiteAt = (
	point: ScreenPosition,
	spaceId: string,
): Promise<DockSite | null> =>
	commands.windowStripAt(point).then((strip) => {
		if (strip === null) {
			return { target: "outside", label: null }
		}
		const target = strip.spaceId === spaceId ? "sameSpace" : "otherSpace"
		return { target, label: strip.label }
	}, reportUnanswered)

const dragFailureNotice = () => ({
	title: i18n.t("common:titleBar.redockTabFailed.title"),
	description: i18n.t("common:titleBar.redockTabFailed.description"),
})

const failOnce = (drag: Failing, command?: string) => {
	drag.hasFailed = true
	raiseNoticeOnce(drag, dragFailureNotice, command)
}

const ghostLeft = async (view: DragView): Promise<DragView> => {
	if (!view.isGhostShown) {
		return view
	}
	await hideGhost()
	return { ...view, isGhostShown: false }
}

const hiddenByHost = (view: DragView): DragView => ({
	...view,
	isGhostShown: false,
})

const tearOffAt = (
	{ tabId }: TabDrag,
	{ x, y }: ScreenPosition,
): TabTearOff => ({ tabId, screenX: x, screenY: y })

const ghostFollowing = async (
	drag: TabDrag,
	view: DragView,
	point: ScreenPosition,
): Promise<DragView> => {
	if (!view.isGhostShown) {
		return view
	}
	const isShown = await moveGhost(drag, point)
	return { ...view, isGhostSupported: isShown, isGhostShown: isShown }
}

const ghostOver = (
	drag: TabDrag,
	view: DragView,
	point: ScreenPosition,
	target: DockTarget,
) => {
	if (view.isGhostShown && target !== view.target) {
		sendGhostState(drag, target)
	}
	return ghostFollowing(drag, { ...view, target }, point)
}

const drawnGhost = (drawGhost: DrawGhost) => {
	try {
		return drawGhost()
	} catch (reason) {
		reportGhostFailure(reason)
		return null
	}
}

const announcedView = async (
	drag: TabDrag,
	torn: TornTab,
	point: ScreenPosition,
	drawGhost: DrawGhost,
): Promise<DragView> => {
	const ghostTab = drawnGhost(drawGhost)
	if (ghostTab) {
		sendGhostState(drag, "outside")
	}
	const [isShown, isAnnounced] = await Promise.all([
		ghostTab ? showGhost(drag, point, ghostTab) : false,
		isAccepted(commands.windowTabDragStart(torn.packed, torn.spaceId)),
	])
	if (!isAnnounced) {
		failOnce(drag, "window_tab_drag_start")
	}
	return {
		isGhostSupported: isShown,
		isGhostShown: isShown,
		isAnnounced,
		target: "outside",
	}
}

const movedView = async (
	drag: TabDrag,
	view: DragView,
	point: ScreenPosition,
): Promise<DragView> => {
	if (drag.hasFailed) {
		return ghostFollowing(drag, view, point)
	}
	const [isMoved, site] = await Promise.all([
		isAccepted(commands.windowTabDragMove(point)),
		dockSiteAt(point, drag.spaceId),
	])
	if (!isMoved || site === null) {
		failOnce(drag, isMoved ? "window_strip_at" : "window_tab_drag_move")
		return ghostOver(drag, view, point, "outside")
	}
	return ghostOver(drag, view, point, site.target)
}

const cancelAnnounced = async (drag: Failing, view: Announced) => {
	if (!view.isAnnounced) {
		return true
	}
	const isCancelled = await isAccepted(commands.windowTabDragCancel())
	if (!isCancelled) {
		failOnce(drag, "window_tab_drag_cancel")
	}
	return isCancelled
}

const pointerNow = () =>
	readPointerPosition().catch((reason: unknown) => {
		reportHostFailure(reason)
		return null
	})

const reportUnwatched = (reason: unknown) => {
	reportHostFailure(reason)
	return () => undefined
}

const windowOver = async (
	move: WindowMove,
	view: WindowView,
	target: DockTarget,
): Promise<WindowView> => {
	const shouldHide = target === "sameSpace"
	if (shouldHide === view.isHidden) {
		return { ...view, target }
	}
	const isDone = await isAccepted(
		shouldHide ? commands.windowHide() : commands.windowShow(),
	)
	if (!isDone) {
		failOnce(move, shouldHide ? "window_hide" : "window_show")
	}
	return { ...view, target, isHidden: isDone ? shouldHide : view.isHidden }
}

const announcedWindow = async (
	move: WindowMove,
	torn: TornTab,
): Promise<WindowView> => {
	const isAnnounced = await isAccepted(
		commands.windowTabDragStart(torn.packed, torn.spaceId),
	)
	if (!isAnnounced) {
		failOnce(move, "window_tab_drag_start")
	}
	return { isAnnounced, isHidden: false, target: "outside" }
}

const followedWindow = async (
	move: WindowMove,
	view: WindowView,
): Promise<WindowView> => {
	if (move.hasFailed) {
		return windowOver(move, view, "outside")
	}
	const point = await pointerNow()
	if (point === null) {
		failOnce(move, "cursor_position")
		return windowOver(move, view, "outside")
	}
	const [isMoved, site] = await Promise.all([
		isAccepted(commands.windowTabDragMove(point)),
		dockSiteAt(point, move.spaceId),
	])
	if (!isMoved || site === null) {
		failOnce(move, isMoved ? "window_strip_at" : "window_tab_drag_move")
		return windowOver(move, view, "outside")
	}
	return windowOver(move, view, site.target)
}

const noPoint: PointReader = async () => null

const windowDockSite = async (
	move: WindowMove,
	view: WindowView,
	readPoint: PointReader,
) => {
	if (move.hasFailed || view.target !== "sameSpace") {
		return null
	}
	const point = await readPoint()
	const site = point && (await dockSiteAt(point, move.spaceId))
	return point && site?.target === "sameSpace" && site.label !== null
		? { point, label: site.label }
		: null
}

const followWindow = (move: WindowMove) => {
	if (!move.isReleased) {
		move.view = move.view.then((view) => followedWindow(move, view))
	}
}

const movingNow = async (move: () => Promise<void>) => move()

export const createTabTearOff = ({
	moveUnghosted,
	moveTornOff,
	raiseMoveFailure,
	tornTabOf,
	removeDocked,
}: TearOffMoves): TabTearOffSession => {
	let drag: TabDrag | WindowDrag | null = null
	let ghostSettling: Promise<unknown> = Promise.resolve()
	let releasedByHost: string | null = null

	const endDrag = () => {
		const ended = drag
		drag = null
		if (ended?.kind === "tab") {
			void ended.unwatchEnded.then((stopWatching) => stopWatching())
		}
		return ended
	}

	const dock = async (
		ended: DockedDrag,
		view: Announced,
		point: ScreenPosition,
		targetLabel: string,
	) => {
		const awaited = await awaitDockAnswer(targetLabel, ended.tabId).catch(
			reportUnanswered,
		)
		if (!awaited) {
			failOnce(ended)
			await cancelAnnounced(ended, view)
			return false
		}
		if (!(await isAccepted(commands.windowTabDragDrop(point)))) {
			failOnce(ended, "window_tab_drag_drop")
			return false
		}
		if (await awaited.answer) {
			return true
		}
		failOnce(ended)
		return false
	}

	const startMove = (move: () => Promise<void>) => {
		movingNow(move).catch(raiseMoveFailure)
	}

	const abandon = (ended: TabDrag) =>
		ended.view.then(async (view) =>
			cancelAnnounced(ended, await ghostLeft(view)),
		)

	const leaveOutside = async (
		ended: TabDrag,
		view: DragView,
		tearOff: TabTearOff,
	) => {
		if (!(await cancelAnnounced(ended, view))) {
			return
		}
		startMove(() =>
			view.isGhostSupported
				? moveTornOff(tearOff, originWindowSize())
				: moveUnghosted(tearOff),
		)
	}

	const land = async (ended: TabDrag, tearOff: TabTearOff) => {
		const view = await ghostLeft(await ended.view)
		if (ended.hasFailed) {
			await cancelAnnounced(ended, view)
			return
		}
		const point = pointOf(tearOff)
		const site = await dockSiteAt(point, ended.spaceId)
		if (site === null) {
			failOnce(ended, "window_strip_at")
		}
		if (site?.target === "sameSpace" && site.label !== null) {
			if (await dock(ended, view, point, site.label)) {
				removeDocked(ended.spaceId, ended.tabId)
			}
		} else if (site?.target === "outside") {
			await leaveOutside(ended, view, tearOff)
		} else {
			await cancelAnnounced(ended, view)
		}
	}

	const releasedWindow = async (
		move: WindowMove,
		view: WindowView,
		readPoint: PointReader,
	) => {
		const site = await windowDockSite(move, view, readPoint)
		if (!site) {
			await cancelAnnounced(move, view)
			await windowOver(move, view, "outside")
			return
		}
		const isWindowClosed =
			(await dock(move, view, site.point, site.label)) &&
			(await removeDocked(move.spaceId, move.tabId))
		if (!isWindowClosed) {
			await windowOver(move, view, "outside")
		}
	}

	const showAfterFailure = (reason: unknown) => {
		raiseMoveFailure(reason)
		return isAccepted(commands.windowShow())
	}

	const releaseWindow = async (move: WindowMove, readPoint: PointReader) => {
		clearTimeout(move.endWait)
		for (const stopWatching of await Promise.all(move.unwatchers)) {
			stopWatching?.()
		}
		await releasedWindow(move, await move.view, readPoint)
	}

	const releaseOnce = (move: WindowMove, readPoint: PointReader) => {
		if (move.isReleased) {
			return
		}
		move.isReleased = true
		releaseWindow(move, readPoint).catch(showAfterFailure)
	}

	const awaitMoveEnd = (move: WindowMove) => {
		if (move.isReleased) {
			return
		}
		clearTimeout(move.endWait)
		move.endWait = setTimeout(
			() => releaseOnce(move, noPoint),
			NATIVE_MOVE_END_WAIT_MS,
		)
	}

	const followMovedWindow = (move: WindowMove) => {
		followWindow(move)
		if (move.endWait !== undefined) {
			awaitMoveEnd(move)
		}
	}

	const watchMoveFailed = (move: WindowMove) => {
		const watching = watchNativeMoveFailed(({ label, error }) => {
			if (label !== currentWindowLabel()) {
				return
			}
			console.error("the window move failed on the host", error)
			failOnce(move, "window_start_native_move")
			releaseOnce(move, noPoint)
		}).catch(reportUnwatched)
		move.unwatchers.push(watching)
	}

	const watchMoveEnd = (move: WindowMove) => {
		const watching = watchNativeMoveEnded(({ label, point }) => {
			if (label === currentWindowLabel()) {
				releaseOnce(move, async () => point)
			}
		}).catch((reason: unknown) => {
			raiseMoveFailure(reason)
			return null
		})
		move.unwatchers.push(watching)
		return watching
	}

	const settleMove = (
		move: WindowMove,
		isMoved: boolean,
		isEndWatched: boolean,
	) => {
		if (isMoved && isEndWatched) {
			awaitMoveEnd(move)
			return
		}
		if (!isMoved) {
			failOnce(move, "window_start_native_move")
		}
		releaseOnce(move, pointerNow)
	}

	const moveWindow = async (tabId: string, torn: TornTab) => {
		const move: WindowMove = {
			tabId,
			spaceId: torn.spaceId,
			hasFailed: false,
			isNoticed: false,
			isReleased: false,
			view: Promise.resolve().then(() => announcedWindow(move, torn)),
			unwatchers: [],
		}
		move.unwatchers.push(
			watchWindowMoves(() => followMovedWindow(move)).catch(reportUnwatched),
		)
		watchMoveFailed(move)
		const isEndWatched = (await watchMoveEnd(move)) !== null
		const isMoved = await isAccepted(commands.windowStartNativeMove())
		settleMove(move, isMoved, isEndWatched)
	}

	const endByHost = (ended: TabDrag) => {
		endDrag()
		releasedByHost = ended.tabId
		ended.view = ended.view.then(hiddenByHost)
	}

	const releaseByHost = (released: TabDrag, point: ScreenPosition) => {
		endByHost(released)
		ghostSettling = land(released, tearOffAt(released, point)).catch(
			raiseMoveFailure,
		)
	}

	const loseByHost = (lost: TabDrag, error: unknown) => {
		failGhost(lost, "drag_ghost_follow", error)
		endByHost(lost)
		const tearOff = tearOffAt(lost, lost.lastPoint)
		ghostSettling = lost.view
			.then((view) => leaveOutside(lost, view, tearOff))
			.catch(raiseMoveFailure)
	}

	const hearGhostEnded = (started: TabDrag, ended: DragGhostEnded) => {
		if (drag !== started) {
			return
		}
		if (ended.kind === "released") {
			releaseByHost(started, ended.point)
		} else if (ended.kind === "lost") {
			loseByHost(started, ended.error)
		}
	}

	const startTabDrag = (
		tearOff: TabTearOff,
		torn: TornTab,
		drawGhost: DrawGhost,
	) => {
		const point = pointOf(tearOff)
		const unwatchEnded = watchDragGhostEnded((ended) =>
			hearGhostEnded(started, ended),
		).catch(reportUnwatched)
		const started: TabDrag = {
			kind: "tab",
			tabId: tearOff.tabId,
			spaceId: torn.spaceId,
			lastPoint: point,
			hasFailed: false,
			isNoticed: false,
			unwatchEnded,
			view: Promise.all([ghostSettling, unwatchEnded]).then(() =>
				announcedView(started, torn, point, drawGhost),
			),
		}
		drag = started
	}

	return {
		start: (tearOff, drawGhost) => {
			const torn = tornTabOf(tearOff.tabId)
			if (!torn) {
				return
			}
			releasedByHost = null
			if (torn.isOnlyTab) {
				drag = { kind: "window", tabId: tearOff.tabId }
				moveWindow(tearOff.tabId, torn).catch(showAfterFailure)
				return
			}
			startTabDrag(tearOff, torn, drawGhost)
		},
		move: (tearOff) => {
			const moving = drag
			if (moving?.kind !== "tab" || moving.tabId !== tearOff.tabId) {
				return
			}
			moving.lastPoint = pointOf(tearOff)
			moving.view = moving.view.then((view) =>
				movedView(moving, view, pointOf(tearOff)),
			)
		},
		cancel: () => {
			const ended = endDrag()
			if (ended?.kind !== "tab") {
				return
			}
			ghostSettling = abandon(ended)
		},
		drop: (tearOff) => {
			if (releasedByHost === tearOff.tabId) {
				releasedByHost = null
				return true
			}
			const ended = endDrag()
			const isDraggedTab = ended?.tabId === tearOff.tabId
			if (ended?.kind === "tab" && isDraggedTab) {
				ghostSettling = land(ended, tearOff).catch(raiseMoveFailure)
			} else if (ended?.kind === "tab") {
				ghostSettling = abandon(ended).then(() =>
					startMove(() => moveUnghosted(tearOff)),
				)
			} else if (!isDraggedTab) {
				startMove(() => moveUnghosted(tearOff))
			}
			return true
		},
	}
}
