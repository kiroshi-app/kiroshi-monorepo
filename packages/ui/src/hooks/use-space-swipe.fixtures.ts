type TrackpadSwipeModel = {
	name: string
	provenance: "recorded on hardware" | "modelled"
	source: string
	releaseVelocityPxPerS: number
	fingerMs: number
}

const WEBKIT_SOURCE =
	"momentum derived from WebKit Source/WebKit/WebProcess/WebPage/MomentumEventDispatcher.cpp (main, read 2026-11-11), momentumDecayRate and buildOffsetTableWithInitialDelta, without the system acceleration curve"

export const SLOW_SHORT_SWIPE: TrackpadSwipeModel = {
	name: "a short slow swipe",
	provenance: "modelled",
	source: `finger phase assumed: a 120 Hz linear ramp to 240 px/s over 250 ms, under the 250 px/s weak-momentum bound of WebKit; ${WEBKIT_SOURCE}`,
	releaseVelocityPxPerS: 240,
	fingerMs: 250,
}

export const FAST_FLICK: TrackpadSwipeModel = {
	name: "a fast flick with a long momentum tail",
	provenance: "modelled",
	source: `finger phase assumed: a 120 Hz linear ramp to 1500 px/s over 120 ms; ${WEBKIT_SOURCE}`,
	releaseVelocityPxPerS: 1500,
	fingerMs: 120,
}

const DISPLAY_FRAME_MS = 1000 / 120

const MOMENTUM_GAP_MS = 2 * DISPLAY_FRAME_MS

const WEBKIT_CURVE_FRAME_MS = 1000 / 60

const WEBKIT_DECAY_STEP_MS = 8

const WEBKIT_DEFAULT_DECAY = 0.975

const WEBKIT_TAIL_DECAY = 0.91

const WEBKIT_TAIL_VELOCITY_PX_PER_S = 250

const WEBKIT_MOMENTUM_STOP_PX = 0.5

type TrackpadWheel = {
	deltaX: number
	deltaY: number
	at: number
}

const fingerPhase = (
	{ releaseVelocityPxPerS, fingerMs }: TrackpadSwipeModel,
	direction: 1 | -1,
): TrackpadWheel[] => {
	const frames = Math.round(fingerMs / DISPLAY_FRAME_MS)
	const releaseDelta = releaseVelocityPxPerS * (DISPLAY_FRAME_MS / 1000)
	return Array.from({ length: frames }, (_, frame) => ({
		deltaX: direction * releaseDelta * ((frame + 1) / frames),
		deltaY: 0,
		at: frame * DISPLAY_FRAME_MS,
	}))
}

const webkitDecayOf = (curveDelta: number) => {
	const velocity = Math.abs(curveDelta) / (WEBKIT_CURVE_FRAME_MS / 1000)
	const weakness = Math.max(
		0,
		(WEBKIT_TAIL_VELOCITY_PX_PER_S - velocity) / WEBKIT_TAIL_VELOCITY_PX_PER_S,
	)
	const decay =
		WEBKIT_DEFAULT_DECAY - (WEBKIT_DEFAULT_DECAY - WEBKIT_TAIL_DECAY) * weakness
	return decay ** (WEBKIT_CURVE_FRAME_MS / WEBKIT_DECAY_STEP_MS)
}

const momentumPhase = (releaseDelta: number, startsAt: number) => {
	const wheels: TrackpadWheel[] = []
	const displayFramesPerCurveFrame = WEBKIT_CURVE_FRAME_MS / DISPLAY_FRAME_MS
	let curveDelta = releaseDelta * displayFramesPerCurveFrame
	while (Math.abs(curveDelta) > WEBKIT_MOMENTUM_STOP_PX) {
		curveDelta *= webkitDecayOf(curveDelta)
		for (let frame = 0; frame < displayFramesPerCurveFrame; frame += 1) {
			wheels.push({
				deltaX: curveDelta / displayFramesPerCurveFrame,
				deltaY: 0,
				at: startsAt + wheels.length * DISPLAY_FRAME_MS,
			})
		}
	}
	return wheels
}

export const trackpadSwipe = (model: TrackpadSwipeModel, direction: 1 | -1) => {
	const fingers = fingerPhase(model, direction)
	const release = fingers[fingers.length - 1] ?? { deltaX: 0, at: 0 }
	return {
		fingers,
		momentum: momentumPhase(release.deltaX, release.at + MOMENTUM_GAP_MS),
	}
}

export const trackpadSwipeDuration = (model: TrackpadSwipeModel) => {
	const { momentum } = trackpadSwipe(model, 1)
	return momentum[momentum.length - 1]?.at ?? 0
}

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
