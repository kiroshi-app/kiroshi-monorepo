const FRAME_MS = 8

const MOMENTUM_GAP_MS = 16

const FINGER_DELTAS_X = [1, 2, 3, 5, 7, 8, 9, 9, 8, 7, 6, 5]

const FINGER_DELTAS_Y = [1, 1, 1]

const MOMENTUM_DELTAS_X = [
	6, 5, 5, 4, 4, 4, 3, 3, 3, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1,
]

type TrackpadWheel = {
	deltaX: number
	deltaY: number
	at: number
}

const fingerPhase = (direction: 1 | -1): TrackpadWheel[] =>
	FINGER_DELTAS_X.map((deltaX, frame) => ({
		deltaX: deltaX * direction,
		deltaY: FINGER_DELTAS_Y[frame] ?? 0,
		at: frame * FRAME_MS,
	}))

const momentumPhase = (direction: 1 | -1): TrackpadWheel[] => {
	const startsAt = (FINGER_DELTAS_X.length - 1) * FRAME_MS + MOMENTUM_GAP_MS
	return MOMENTUM_DELTAS_X.map((deltaX, frame) => ({
		deltaX: deltaX * direction,
		deltaY: 0,
		at: startsAt + frame * FRAME_MS,
	}))
}

export const trackpadSwipe = (direction: 1 | -1) => ({
	fingers: fingerPhase(direction),
	momentum: momentumPhase(direction),
})

export const trackpadSwipeDuration = (() => {
	const { momentum } = trackpadSwipe(1)
	return momentum[momentum.length - 1]?.at ?? 0
})()

export const dispatchTrackpadWheels = (
	target: Element,
	wheels: readonly TrackpadWheel[],
	startsAt: number,
) =>
	wheels.map(({ deltaX, deltaY, at }) => {
		const event = new WheelEvent("wheel", {
			bubbles: true,
			cancelable: true,
			deltaX,
			deltaY,
		})
		Object.defineProperty(event, "timeStamp", { value: startsAt + at })
		return !target.dispatchEvent(event)
	})
