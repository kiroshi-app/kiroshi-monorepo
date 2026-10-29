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
	moveUnghosted: (tearOff: TabTearOff) => void
	moveTornOff: (tearOff: TabTearOff, size: WindowSize) => Promise<void>
	tornTabOf: (tabId: string) => TornTab | null
	removeDocked: (spaceId: string, tabId: string) => void
}

type GhostAnswer = Awaited<ReturnType<typeof commands.dragGhostShow>>

type HostAnswer = { status: "ok" } | { status: "error" }

type DockTarget = "outside" | "sameSpace" | "otherSpace"

type DockSite = {
	target: DockTarget
	label: string | null
}

type DragView = {
	ghostTab: DragGhostTab
	isGhostSupported: boolean
	isGhostShown: boolean
	isAnnounced: boolean
	target: DockTarget
}

type TabDrag = {
	kind: "tab"
	tabId: string
	spaceId: string
	size: WindowSize
	hasFailed: boolean
	view: Promise<DragView>
}

type WindowDrag = {
	kind: "window"
	tabId: string
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

const failOnce = (drag: TabDrag, command?: string) => {
	if (drag.hasFailed) {
		return
	}
	drag.hasFailed = true
	raiseDragFailure(command)
}

const startWindowMove = async () => {
	if (!(await isAccepted(commands.windowStartNativeMove()))) {
		raiseDragFailure("window_start_native_move")
	}
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
	if (!view.isGhostSupported) {
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

const announcedView = async (
	drag: TabDrag,
	torn: TornTab,
	point: ScreenPosition,
	drawGhost: DrawGhost,
): Promise<DragView> => {
	const ghostTab = drawGhost(drag.size)
	const [isShown, isAnnounced] = await Promise.all([
		showGhost(point, drag.size, ghostTab),
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

const cancelAnnounced = async (drag: TabDrag, view: DragView) => {
	if (!view.isAnnounced) {
		return true
	}
	const isCancelled = await isAccepted(commands.windowTabDragCancel())
	if (!isCancelled) {
		failOnce(drag, "window_tab_drag_cancel")
	}
	return isCancelled
}

export const createTabTearOff = ({
	moveUnghosted,
	moveTornOff,
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
		ended: TabDrag,
		view: DragView,
		point: ScreenPosition,
		targetLabel: string,
	) => {
		const awaited = await awaitDockAnswer(targetLabel, ended.tabId).catch(
			reportUnanswered,
		)
		if (!awaited) {
			failOnce(ended)
			await cancelAnnounced(ended, view)
			return
		}
		if (!(await isAccepted(commands.windowTabDragDrop(point)))) {
			failOnce(ended, "window_tab_drag_drop")
			return
		}
		if (await awaited.answer) {
			removeDocked(ended.spaceId, ended.tabId)
			return
		}
		failOnce(ended)
	}

	const leaveOutside = async (
		ended: TabDrag,
		view: DragView,
		tearOff: TabTearOff,
	) => {
		if (!(await cancelAnnounced(ended, view))) {
			return
		}
		if (view.isGhostSupported) {
			void moveTornOff(tearOff, originWindowSize())
		} else {
			moveUnghosted(tearOff)
		}
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
			await dock(ended, view, point, site.label)
		} else if (site?.target === "outside") {
			await leaveOutside(ended, view, tearOff)
		} else {
			await cancelAnnounced(ended, view)
		}
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
				void startWindowMove()
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
			ghostSettling = ended.view.then(async (view) =>
				cancelAnnounced(ended, await ghostLeft(view)),
			)
		},
		drop: (tearOff) => {
			const ended = endDrag()
			if (ended?.tabId !== tearOff.tabId) {
				moveUnghosted(tearOff)
				return true
			}
			if (ended.kind === "tab") {
				ghostSettling = land(ended, tearOff)
			}
			return true
		},
	}
}
