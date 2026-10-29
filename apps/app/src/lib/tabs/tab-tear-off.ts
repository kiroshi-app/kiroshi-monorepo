import {
	commands,
	type DragGhostTab,
	type ScreenPosition,
	type WindowSize,
} from "../bindings"

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

type TearOffMoves = {
	moveUnghosted: (tearOff: TabTearOff) => void
	moveTornOff: (tearOff: TabTearOff, size: WindowSize) => Promise<void>
}

type GhostAnswer = Awaited<ReturnType<typeof commands.dragGhostShow>>

type TornOffDrag = {
	tabId: string
	isGhosted: Promise<boolean>
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

const showGhost = (tearOff: TabTearOff, drawGhost: DrawGhost) => {
	const size = ghostSizeOf(originWindowSize())
	return answerOf(
		commands.dragGhostShow(pointOf(tearOff), size, drawGhost(size)),
	)
}

const moveGhost = async (tearOff: TabTearOff) => {
	if (await answerOf(commands.dragGhostMove(pointOf(tearOff)))) {
		return true
	}
	await hideGhost()
	return false
}

export const createTabTearOff = ({
	moveUnghosted,
	moveTornOff,
}: TearOffMoves): TabTearOffSession => {
	let drag: TornOffDrag | null = null

	const endDrag = () => {
		const ended = drag
		drag = null
		return ended
	}

	const dropTornOff = async (ended: TornOffDrag, tearOff: TabTearOff) => {
		if (!(await ended.isGhosted)) {
			moveUnghosted(tearOff)
			return
		}
		await hideGhost()
		await moveTornOff(tearOff, originWindowSize())
	}

	return {
		start: (tearOff, drawGhost) => {
			drag = {
				tabId: tearOff.tabId,
				isGhosted: showGhost(tearOff, drawGhost),
			}
		},
		move: (tearOff) => {
			if (drag?.tabId !== tearOff.tabId) {
				return
			}
			drag.isGhosted = drag.isGhosted.then(
				(isShown) => isShown && moveGhost(tearOff),
			)
		},
		cancel: () => {
			const ended = endDrag()
			if (ended) {
				void ended.isGhosted.then((isShown) => isShown && hideGhost())
			}
		},
		drop: (tearOff) => {
			const ended = endDrag()
			if (ended?.tabId === tearOff.tabId) {
				void dropTornOff(ended, tearOff)
			} else {
				moveUnghosted(tearOff)
			}
			return true
		},
	}
}
