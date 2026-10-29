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

type DrawnSize = 14 | 26 | 48

type Glyph = { scale: number; stroke: number }

type MarkMetrics = {
	initial: { fontSize: number; weight: number }
	badge: { diameter: number; cutOut: number }
	laptop: Glyph
	cross?: Glyph
	hatch: { spacing: number; stroke: number }
}

type StateMetrics = {
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
		attention: { gap: 1, width: 1.5 },
		invitationStroke: 1.5,
		lineStroke: 1,
	},
	26: {
		attention: { gap: 1.5, width: 2 },
		invitationStroke: 1.5,
		lineStroke: 1,
	},
	36: {
		attention: { gap: 1.5, width: 2 },
		invitationStroke: 2,
		lineStroke: 1.125,
	},
	48: {
		attention: { gap: 2, width: 2.5 },
		invitationStroke: 2,
		lineStroke: 1.5,
	},
	64: {
		attention: { gap: 2, width: 3 },
		invitationStroke: 2.5,
		lineStroke: 2,
	},
}

const DRAWN_MARKS: Record<DrawnSize, MarkMetrics> = {
	14: {
		initial: { fontSize: 10, weight: 700 },
		badge: { diameter: 8, cutOut: 1.5 },
		laptop: { scale: 0.258, stroke: 3.677 },
		hatch: { spacing: 3, stroke: 0.8 },
	},
	26: {
		initial: { fontSize: 13, weight: 600 },
		badge: { diameter: 12, cutOut: 2 },
		laptop: { scale: 0.35, stroke: 3.143 },
		cross: { scale: 0.34, stroke: 3.2 },
		hatch: { spacing: 4, stroke: 1 },
	},
	48: {
		initial: { fontSize: 24, weight: 600 },
		badge: { diameter: 18, cutOut: 2.5 },
		laptop: { scale: 0.51, stroke: 2.941 },
		cross: { scale: 0.51, stroke: 3.2 },
		hatch: { spacing: 6, stroke: 1.5 },
	},
}

const NEAREST_DRAWN: Record<SpaceAvatarSize, DrawnSize> = {
	12: 14,
	14: 14,
	26: 26,
	36: 26,
	48: 48,
	64: 48,
}

const INK: Record<SpaceAvatarTheme, LightnessChroma> = {
	light: [0.36, 0.09],
	dark: [0.96, 0.03],
}

const LOCAL_BADGE_FILL = "#737373"

const OFFLINE_BADGE_FILL: Record<SpaceAvatarTheme, string> = {
	light: "#dc2626",
	dark: "#ef4444",
}

const HATCH_INK: Record<SpaceAvatarTheme, { colour: string; opacity: number }> =
	{
		light: { colour: "#000000", opacity: 0.2 },
		dark: { colour: "#ffffff", opacity: 0.2 },
	}

const GLYPH_GRID = 24

const LAPTOP_GLYPH =
	"M4 16V6C4 4.8954 4.8954 4 6 4H18C19.1046 4 20 4.8954 20 6V16M2.5 16H21.5C21.7761 16 22 16.2239 22 16.5V18C22 19.1046 21.1046 20 20 20H4C2.8954 20 2 19.1046 2 18V16.5C2 16.2239 2.2239 16 2.5 16Z"

const CROSS_GLYPH = "M7.5 7.5L16.5 16.5M16.5 7.5L7.5 16.5"

const DOT_CENTRE_INSET = 0.36

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

const spaceInk = (theme: SpaceAvatarTheme, hue?: number | null) => {
	const [lightness, chroma] = INK[theme]
	return hue === undefined || hue === null
		? toneHex([lightness, 0])
		: toneHex([lightness, chroma], (hue * Math.PI) / 180)
}

const spaceInitial = (name: string) => {
	const [first] = new Intl.Segmenter().segment(name.trim())
	return first?.segment.toUpperCase() ?? ""
}

const markMetricsOf = (size: SpaceAvatarSize): MarkMetrics => {
	const drawn = NEAREST_DRAWN[size]
	const { initial, badge, laptop, cross, hatch } = DRAWN_MARKS[drawn]
	const scaled = (value: number) => round((value * size) / drawn)
	const scaledGlyph = ({ scale, stroke }: Glyph) => ({
		scale: scaled(scale),
		stroke,
	})
	return {
		initial: { fontSize: scaled(initial.fontSize), weight: initial.weight },
		badge: { diameter: scaled(badge.diameter), cutOut: scaled(badge.cutOut) },
		laptop: scaledGlyph(laptop),
		cross: cross ? scaledGlyph(cross) : undefined,
		hatch: { spacing: scaled(hatch.spacing), stroke: scaled(hatch.stroke) },
	}
}

const hatchPath = (size: number, spacing: number) =>
	Array.from({ length: Math.floor((2 * size) / spacing) + 1 }, (_, step) => {
		const offset = round(step * spacing)
		return `M${round(offset - size)} ${size}L${offset} 0`
	}).join("")

const spacePalette = (
	theme: SpaceAvatarTheme,
	hue?: number | null,
): SpacePalette => {
	const { full, compact } = TONES[theme]
	const tone = ([lightness, chroma]: LightnessChroma) =>
		hue === undefined || hue === null
			? toneHex([lightness, 0])
			: toneHex([lightness, chroma], (hue * Math.PI) / 180)
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
	CROSS_GLYPH,
	dashArray,
	dotCentre,
	GLYPH_GRID,
	type Glyph,
	HATCH_INK,
	hatchPath,
	isCompact,
	LAPTOP_GLYPH,
	LOCAL_BADGE_FILL,
	markMetricsOf,
	OFFLINE_BADGE_FILL,
	SPACE_AVATAR_SIZES,
	type SpaceArcs,
	type SpaceAvatarSize,
	type SpaceAvatarTheme,
	type SpacePalette,
	STATE_METRICS,
	spaceArcs,
	spaceInitial,
	spaceInk,
	spacePalette,
	superellipsePath,
	superellipsePerimeter,
}
