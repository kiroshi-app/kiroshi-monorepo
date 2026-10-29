import { i18n } from "@workspace/ui/lib/i18n"

import { setGhostNotAllowed } from "./ghost-thumbnail"
import { awaitDockAnswer } from "./tab-dock-channel"

import {
	commands,
	type DragGhostTab,
	type Json,
	type ScreenPosition,
	type WindowSize,
} from "../bindings"
import { raiseReportedFailure } from "../failure-report"
import { readPointerPosition, watchWindowMoves } from "../host"

export type TabTearOff = {
	tabId: string
	screenX: number
	screenY: number
}

type DrawGhost = (size: WindowSize) => DragGhostTab

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
	removeDocked: (spaceId: string, tabId: string) => boolean
}

type GhostAnswer = Awaited<ReturnType<typeof commands.dragGhostShow>>

type HostAnswer = { status: "ok" } | { status: "error" }

type DockTarget = "outside" | "sameSpace" | "otherSpace"

type DockSite = {
	target: DockTarget
	label: string | null
}

type DragView = {
	ghostTab: DragGhostTab | null
	isGhostSupported: boolean
	isGhostShown: boolean
	isAnnounced: boolean
	target: DockTarget
}

type Failing = {
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
	size: WindowSize
	view: Promise<DragView>
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
}

export const pointOf = ({ screenX, screenY }: TabTearOff): ScreenPosition => ({
	x: Math.round(screenX),
	y: Math.round(screenY),
})

const originWindowSize = (): WindowSize => ({
	width: Math.round(window.innerWidth),
	height: Math.round(window.innerHeight),
})

const ghostSizeOf = ({ width, height }: WindowSize): WindowSize => ({
	width: Math.round(width / 2),
	height: Math.round(height / 2),
})

const isSupported = (answer: GhostAnswer) =>
	answer.status === "ok" && answer.data.supported

const reportGhostFailure = (reason: unknown) => {
	console.error("the drag ghost failed", reason)
	return false
}

const answerOf = (asking: Promise<GhostAnswer>) =>
	asking.then(isSupported, reportGhostFailure)

const hideGhost = () => answerOf(commands.dragGhostHide())

const showGhost = (
	point: ScreenPosition,
	size: WindowSize,
	ghostTab: DragGhostTab,
) => answerOf(commands.dragGhostShow(point, size, ghostTab))

const moveGhost = async (point: ScreenPosition) => {
	if (await answerOf(commands.dragGhostMove(point))) {
		return true
	}
	await hideGhost()
	return false
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

const raiseDragFailure = (command?: string) => {
	void raiseReportedFailure(
		{
			title: i18n.t("common:titleBar.redockTabFailed.title"),
			description: i18n.t("common:titleBar.redockTabFailed.description"),
		},
		{ raisedIn: "tab-tear-off", command },
	)
}

const failOnce = (drag: Failing, command?: string) => {
	if (drag.hasFailed) {
		return
	}
	drag.hasFailed = true
	raiseDragFailure(command)
}

const ghostLeft = async (view: DragView): Promise<DragView> => {
	if (!view.isGhostShown) {
		return view
	}
	await hideGhost()
	return { ...view, isGhostShown: false }
}

const ghostFollowing = async (
	drag: TabDrag,
	view: DragView,
	point: ScreenPosition,
): Promise<DragView> => {
	if (!view.isGhostSupported || !view.ghostTab) {
		return view
	}
	const isShown = view.isGhostShown
		? await moveGhost(point)
		: await showGhost(point, drag.size, view.ghostTab)
	return { ...view, isGhostSupported: isShown, isGhostShown: isShown }
}

const ghostOver = (
	drag: TabDrag,
	view: DragView,
	point: ScreenPosition,
	target: DockTarget,
) => {
	if (view.isGhostSupported && target !== view.target) {
		setGhostNotAllowed(drag.tabId, target === "otherSpace")
	}
	const shown = { ...view, target }
	return target === "sameSpace"
		? ghostLeft(shown)
		: ghostFollowing(drag, shown, point)
}

const drawnGhost = (drawGhost: DrawGhost, size: WindowSize) => {
	try {
		return drawGhost(size)
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
	const ghostTab = drawnGhost(drawGhost, drag.size)
	const [isShown, isAnnounced] = await Promise.all([
		ghostTab ? showGhost(point, drag.size, ghostTab) : false,
		isAccepted(commands.windowTabDragStart(torn.packed, torn.spaceId)),
	])
	if (!isAnnounced) {
		failOnce(drag, "window_tab_drag_start")
	}
	return {
		ghostTab,
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

	const endDrag = () => {
		const ended = drag
		drag = null
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

	const windowDockSite = async (move: WindowMove, view: WindowView) => {
		if (move.hasFailed || view.target !== "sameSpace") {
			return null
		}
		const point = await pointerNow()
		const site = point && (await dockSiteAt(point, move.spaceId))
		return point && site?.target === "sameSpace" && site.label !== null
			? { point, label: site.label }
			: null
	}

	const releasedWindow = async (move: WindowMove, view: WindowView) => {
		const site = await windowDockSite(move, view)
		if (!site) {
			await cancelAnnounced(move, view)
		} else if (
			(await dock(move, view, site.point, site.label)) &&
			removeDocked(move.spaceId, move.tabId)
		) {
			return
		}
		await windowOver(move, view, "outside")
	}

	const followWindow = (move: WindowMove) => {
		if (!move.isReleased) {
			move.view = move.view.then((view) => followedWindow(move, view))
		}
	}

	const releaseWindow = async (
		move: WindowMove,
		watching: Promise<() => void>,
		isMoved: boolean,
	) => {
		move.isReleased = true
		const stopWatching = await watching
		stopWatching()
		if (!isMoved) {
			failOnce(move, "window_start_native_move")
		}
		await releasedWindow(move, await move.view)
	}

	const moveWindow = (tabId: string, torn: TornTab) => {
		const moving = isAccepted(commands.windowStartNativeMove())
		const move: WindowMove = {
			tabId,
			spaceId: torn.spaceId,
			hasFailed: false,
			isReleased: false,
			view: Promise.resolve().then(() => announcedWindow(move, torn)),
		}
		const watching = watchWindowMoves(() => followWindow(move)).catch(
			reportUnwatched,
		)
		moving
			.then((isMoved) => releaseWindow(move, watching, isMoved))
			.catch(raiseMoveFailure)
	}

	const startTabDrag = (
		tearOff: TabTearOff,
		torn: TornTab,
		drawGhost: DrawGhost,
	) => {
		const started: TabDrag = {
			kind: "tab",
			tabId: tearOff.tabId,
			spaceId: torn.spaceId,
			size: ghostSizeOf(originWindowSize()),
			hasFailed: false,
			view: ghostSettling.then(() =>
				announcedView(started, torn, pointOf(tearOff), drawGhost),
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
			if (torn.isOnlyTab) {
				drag = { kind: "window", tabId: tearOff.tabId }
				moveWindow(tearOff.tabId, torn)
				return
			}
			startTabDrag(tearOff, torn, drawGhost)
		},
		move: (tearOff) => {
			const moving = drag
			if (moving?.kind !== "tab" || moving.tabId !== tearOff.tabId) {
				return
			}
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
