import type { BotAvatarState } from "@workspace/ui/components/companion-state"

const FIELD_STATES = [
	"idle",
	"thinking",
	"searching",
	"working",
	"writing",
	"waiting",
] as const satisfies readonly BotAvatarState[]

type FieldState = (typeof FIELD_STATES)[number]

type FieldAvatarProps = {
	name: string
	hue?: number
	state?: FieldState
	size?: number
}

type Silhouette = { family: number; variant: number }

type SilhouetteSpace = { families: number; variants: number }

type FieldPoint = { x: number; y: number }

type Wave = (cycle: number) => number

type StateMotion = {
	period: number
	phase: (point: FieldPoint) => number
	wave: Wave
}

const FNV_OFFSET = 0x811c9dc5
const FNV_PRIME = 0x01000193
const UINT32_RANGE = 4294967296
const FIELD_FLOOR = 0.3
const PULSE_WIDTH = 0.25
const REVEAL_SPAN = 0.6
const STILL_CYCLE = 0.3
const SWEEP_SPAN = 0.6
const RIPPLE_SPAN = 0.5
const TURN = Math.PI * 2

const companionSeed = (name: string) => {
	let hash = FNV_OFFSET
	for (const character of name) {
		hash ^= character.codePointAt(0) ?? 0
		hash = Math.imul(hash, FNV_PRIME)
	}
	return hash >>> 0
}

const seededRandom = (seed: number) => {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let mixed = Math.imul(state ^ (state >>> 15), state | 1)
		mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
		return ((mixed ^ (mixed >>> 14)) >>> 0) / UINT32_RANGE
	}
}

const pickSilhouette = (
	seed: number,
	{ families, variants }: SilhouetteSpace,
): Silhouette => {
	const random = seededRandom(seed)
	return {
		family: Math.floor(random() * families),
		variant: Math.floor(random() * variants),
	}
}

const silhouetteRandom = ({ family, variant }: Silhouette) =>
	seededRandom(variant * 7919 + family * 104729 + 1)

const fraction = (value: number) => value - Math.floor(value)

const pulse: Wave = (cycle) =>
	cycle < PULSE_WIDTH ? Math.sin((Math.PI * cycle) / PULSE_WIDTH) : 0

const reveal: Wave = (cycle) => (cycle < REVEAL_SPAN ? 1 : 0)

const breath: Wave = (cycle) => 0.5 - 0.5 * Math.cos(TURN * cycle)

const across = (value: number) => (value + 1) / 2

const STATE_MOTION: Record<Exclude<FieldState, "idle">, StateMotion> = {
	thinking: {
		period: 1800,
		phase: ({ x, y }) => (Math.hypot(x, y) / Math.SQRT2) * RIPPLE_SPAN,
		wave: pulse,
	},
	searching: {
		period: 1400,
		phase: ({ x }) => across(x) * SWEEP_SPAN,
		wave: pulse,
	},
	working: {
		period: 1000,
		phase: ({ x, y }) => fraction(Math.atan2(y, x) / TURN),
		wave: pulse,
	},
	writing: {
		period: 2000,
		phase: ({ x, y }) => across(y) * SWEEP_SPAN + across(x) * 0.05,
		wave: reveal,
	},
	waiting: {
		period: 3000,
		phase: () => 0.5,
		wave: breath,
	},
}

const stillTime = (state: FieldState) =>
	state === "idle" ? 0 : STATE_MOTION[state].period * STILL_CYCLE

const fieldIntensity = (state: FieldState, point: FieldPoint, time: number) => {
	if (state === "idle") return 1
	const { period, phase, wave } = STATE_MOTION[state]
	const cycle = fraction(time / period - phase(point))
	return FIELD_FLOOR + (1 - FIELD_FLOOR) * wave(cycle)
}

export {
	companionSeed,
	type FieldAvatarProps,
	type FieldState,
	fieldIntensity,
	pickSilhouette,
	type Silhouette,
	seededRandom,
	silhouetteRandom,
	stillTime,
}
