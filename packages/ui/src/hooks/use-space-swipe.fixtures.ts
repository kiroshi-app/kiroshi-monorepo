const FRAME_MS = 8

const MOMENTUM_GAP_MS = 16

const FINGER_DELTAS_X = [1, 2, 3, 5, 7, 8, 9, 9, 8, 7, 6, 5]

const FINGER_DELTAS_Y = [1, 1, 1]

const MOMENTUM_DELTAS_X = [
	6, 5, 5, 4, 4, 4, 3, 3, 3, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1,
]

const MOMENTUM_STARTS_AT =
	(FINGER_DELTAS_X.length - 1) * FRAME_MS + MOMENTUM_GAP_MS

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

const momentumPhase = (direction: 1 | -1): TrackpadWheel[] =>
	MOMENTUM_DELTAS_X.map((deltaX, frame) => ({
		deltaX: deltaX * direction,
		deltaY: 0,
		at: MOMENTUM_STARTS_AT + frame * FRAME_MS,
	}))

export const trackpadSwipe = (direction: 1 | -1) => ({
	fingers: fingerPhase(direction),
	momentum: momentumPhase(direction),
})

export const trackpadSwipeDuration =
	MOMENTUM_STARTS_AT + (MOMENTUM_DELTAS_X.length - 1) * FRAME_MS

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
