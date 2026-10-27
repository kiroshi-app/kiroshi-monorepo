import {
	BLOT_COLOURS,
	oklabOf,
	srgbOfHex,
} from "@workspace/ui/components/companion-avatar"
import type { BotAvatarBlot } from "@workspace/ui/components/companion-colour"
import { companionSeed } from "@workspace/ui/components/companion-field"
import { COMPACT_BELOW } from "@workspace/ui/components/glaze-border"

const SPACE_AVATAR_SIZES = [12, 14, 26, 36, 48, 64] as const

type SpaceAvatarSize = (typeof SPACE_AVATAR_SIZES)[number]

type SpaceAvatarTheme = "light" | "dark"

type Point = { x: number; y: number }

type LightnessChroma = [lightness: number, chroma: number]

type RadiusRange = [min: number, max: number]

type ThemeTones = { full: LightnessChroma[]; compact: LightnessChroma[] }

type SpacePalette = { full: string[]; compact: string[] }

type SpaceArcs = { anchor: Point; radii: number[] }

type StateMetrics = {
	dot?: { diameter: number; cutOut: number }
	attention: { gap: number; width: number }
	invitationStroke: number
	lineStroke: number
}

const SUPERELLIPSE_EXPONENT = 4.6

const OUTLINE_POINTS = 96

const ANCHOR_OUTSET = 0.02

const ANCHORS: Point[] = [
	{ x: -ANCHOR_OUTSET, y: -ANCHOR_OUTSET },
	{ x: 1 + ANCHOR_OUTSET, y: -ANCHOR_OUTSET },
	{ x: 1 + ANCHOR_OUTSET, y: 1 + ANCHOR_OUTSET },
	{ x: -ANCHOR_OUTSET, y: 1 + ANCHOR_OUTSET },
]

const ARC_RANGES: RadiusRange[] = [
	[0.36, 0.42],
	[0.64, 0.76],
	[0.92, 1.08],
]

const COMPACT_RADII = [0.44, 0.8]

const CHROMA_STEP = 0.002

const GAMUT_TOLERANCE = 1e-6

const TONES: Record<SpaceAvatarTheme, ThemeTones> = {
	light: {
		full: [
			[0.93, 0.035],
			[0.85, 0.06],
			[0.76, 0.09],
			[0.66, 0.11],
		],
		compact: [
			[0.91, 0.045],
			[0.72, 0.11],
			[0.5, 0.13],
		],
	},
	dark: {
		full: [
			[0.36, 0.04],
			[0.46, 0.06],
			[0.57, 0.08],
			[0.68, 0.1],
		],
		compact: [
			[0.38, 0.05],
			[0.56, 0.09],
			[0.78, 0.1],
		],
	},
}

const STATE_METRICS: Record<SpaceAvatarSize, StateMetrics> = {
	12: {
		attention: { gap: 1, width: 1.5 },
		invitationStroke: 1.5,
		lineStroke: 1,
	},
	14: {
		dot: { diameter: 6, cutOut: 1.5 },
		attention: { gap: 1, width: 1.5 },
		invitationStroke: 1.5,
		lineStroke: 1,
	},
	26: {
		dot: { diameter: 8, cutOut: 2 },
		attention: { gap: 1.5, width: 2 },
		invitationStroke: 1.5,
		lineStroke: 1,
	},
	36: {
		dot: { diameter: 10, cutOut: 2 },
		attention: { gap: 1.5, width: 2 },
		invitationStroke: 2,
		lineStroke: 1.125,
	},
	48: {
		dot: { diameter: 12, cutOut: 2.5 },
		attention: { gap: 2, width: 2.5 },
		invitationStroke: 2,
		lineStroke: 1.5,
	},
	64: {
		dot: { diameter: 14, cutOut: 3 },
		attention: { gap: 2, width: 3 },
		invitationStroke: 2.5,
		lineStroke: 2,
	},
}

const DOT_CENTRE_INSET = 0.32

const DASH_SHARE = 0.55

const DASH_PERIOD_PER_STROKE = 3.2

const MIN_DASHES = 8

const isCompact = (size: SpaceAvatarSize) => size < COMPACT_BELOW

const spaceArcs = (spaceId: string): SpaceArcs => {
	const seed = companionSeed(spaceId)
	const byte = (index: number) => ((seed >>> (8 * index)) & 0xff) / 0xff
	return {
		anchor: ANCHORS[seed & 0b11] ?? ANCHORS[0],
		radii: ARC_RANGES.map(
			([min, max], index) => min + (max - min) * byte(index + 1),
		),
	}
}

const hueOf = (colour: BotAvatarBlot) => {
	const { a, b } = oklabOf(srgbOfHex(BLOT_COLOURS[colour]))
	return Math.atan2(b, a)
}

const linearSrgbOf = (lightness: number, chroma: number, hue: number) => {
	const a = chroma * Math.cos(hue)
	const b = chroma * Math.sin(hue)
	const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
	const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
	const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
	return [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
	]
}

const isInSrgb = (channels: number[]) =>
	channels.every(
		(channel) => channel >= -GAMUT_TOLERANCE && channel <= 1 + GAMUT_TOLERANCE,
	)

const hexOfLinear = (channels: number[]) =>
	`#${channels
		.map((linear) => {
			const clamped = Math.min(1, Math.max(0, linear))
			const gamma =
				clamped <= 0.0031308
					? clamped * 12.92
					: 1.055 * clamped ** (1 / 2.4) - 0.055
			return Math.round(gamma * 255)
				.toString(16)
				.padStart(2, "0")
		})
		.join("")}`

const toneHex = ([lightness, chroma]: LightnessChroma, hue = 0) => {
	let fitted = chroma
	while (fitted > 0 && !isInSrgb(linearSrgbOf(lightness, fitted, hue)))
		fitted = Math.max(0, fitted - CHROMA_STEP)
	return hexOfLinear(linearSrgbOf(lightness, fitted, hue))
}

const spacePalette = (
	theme: SpaceAvatarTheme,
	colour?: BotAvatarBlot | null,
): SpacePalette => {
	const { full, compact } = TONES[theme]
	const tone = ([lightness, chroma]: LightnessChroma) =>
		colour
			? toneHex([lightness, chroma], hueOf(colour))
			: toneHex([lightness, 0])
	return { full: full.map(tone), compact: compact.map(tone) }
}

const superellipsePoints = (centre: number, half: number): Point[] => {
	const power = 2 / SUPERELLIPSE_EXPONENT
	return Array.from({ length: OUTLINE_POINTS }, (_, index) => {
		const angle = (index / OUTLINE_POINTS) * 2 * Math.PI
		const cos = Math.cos(angle)
		const sin = Math.sin(angle)
		return {
			x: centre + half * Math.sign(cos) * Math.abs(cos) ** power,
			y: centre + half * Math.sign(sin) * Math.abs(sin) ** power,
		}
	})
}

const round = (value: number) => Math.round(value * 1000) / 1000

const superellipsePath = (centre: number, half: number) =>
	`${superellipsePoints(centre, half)
		.map(
			({ x, y }, index) => `${index === 0 ? "M" : "L"}${round(x)} ${round(y)}`,
		)
		.join("")}Z`

const superellipsePerimeter = (centre: number, half: number) => {
	const points = superellipsePoints(centre, half)
	return points.reduce((length, point, index) => {
		const next = points[(index + 1) % points.length] ?? point
		return length + Math.hypot(next.x - point.x, next.y - point.y)
	}, 0)
}

const dashArray = (perimeter: number, stroke: number) => {
	const count = Math.max(
		MIN_DASHES,
		Math.round(perimeter / (DASH_PERIOD_PER_STROKE * stroke)),
	)
	const period = perimeter / count
	return `${round(period * DASH_SHARE)} ${round(period * (1 - DASH_SHARE))}`
}

const dotCentre = (size: SpaceAvatarSize, diameter: number) =>
	size - DOT_CENTRE_INSET * diameter

export {
	COMPACT_RADII,
	dashArray,
	dotCentre,
	isCompact,
	SPACE_AVATAR_SIZES,
	type SpaceArcs,
	type SpaceAvatarSize,
	type SpaceAvatarTheme,
	type SpacePalette,
	STATE_METRICS,
	spaceArcs,
	spacePalette,
	superellipsePath,
	superellipsePerimeter,
}
