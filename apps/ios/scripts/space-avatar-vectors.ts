import { $ } from "bun"

import { BLOT_HUES } from "../../../packages/ui/src/components/companion-colour"
import { companionSeed } from "../../../packages/ui/src/components/companion-field"
import {
	COMPACT_BELOW,
	COMPACT_EDGE,
	edgeWidthOf,
	GLAZE_EDGE,
	GLAZE_THEMES,
	isCompactAt,
	LIP_OPACITY,
} from "../../../packages/ui/src/components/glaze-border"
import {
	HUE_ROLES,
	hueTone,
} from "../../../packages/ui/src/components/hue-palette"
import { HUE_TONES } from "../../../packages/ui/src/components/hue-tones"
import {
	COMPACT_RADII,
	CROSS_GLYPH,
	dotCentre,
	GLYPH_GRID,
	HATCH_INK,
	hatchPath,
	isCompact,
	LAPTOP_GLYPH,
	LOCAL_BADGE_FILL,
	markMetricsOf,
	OFFLINE_BADGE_FILL,
	SPACE_AVATAR_SIZES,
	STATE_METRICS,
	spaceArcs,
	spaceInitial,
	spaceInk,
	spacePalette,
	superellipsePath,
} from "../../../packages/ui/src/components/space-avatar-recipe"

const OUTPUT = new URL(
	"../KiroshiTests/Vectors/space-avatar.json",
	import.meta.url,
)

const BORDER_OUTPUT = new URL(
	"../KiroshiTests/Vectors/glaze-border.json",
	import.meta.url,
)

const HUE_OUTPUT = new URL(
	"../KiroshiTests/Vectors/hue-tones.json",
	import.meta.url,
)

const HUES = [...Array(360).keys()]

const PALETTE_HUES = [null, ...Object.values(BLOT_HUES), 17, 200]

const BORDER_SIDES = [12, 14, 16, 17.87, 19, 20, 24, 28, 40, 52, 56, 64, 88]

const SPACE_IDS = [
	"9b1e0000-0000-4000-8000-000000000001",
	"9b1e0000-0000-4000-8000-000000000003",
	"9b1e0000-0000-4000-8000-000000000004",
	"space-studio",
	"space-0",
	"space-1",
	"space-2",
	"space-3",
	"Atelier",
	"Northwind Field Research",
	"espace-été",
	"🚀-launch",
]

const THEMES = ["light", "dark"] as const

const SPACE_NAMES = [
	"Atelier",
	"harbour Studio",
	"  personal",
	"Fieldwork",
	"quarry Labs",
	"espace-été",
	"e\u0301tude",
	"\u{1F468}\u200D\u{1F4BB} lab",
	"🚀-launch",
	"straße",
	"",
	" \t ",
]

const hatchOffsetsOf = (path: string) =>
	[...path.matchAll(/L(-?[\d.]+) 0/g)].map(([, offset]) => Number(offset))

const pointsOf = (path: string) =>
	[...path.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map(([, x, y]) => [
		Number(x),
		Number(y),
	])

const vectors = {
	compactRadii: COMPACT_RADII,
	arcs: SPACE_IDS.map((id) => ({
		id,
		seed: companionSeed(id),
		...spaceArcs(id),
	})),
	palettes: THEMES.flatMap((theme) =>
		PALETTE_HUES.map((colour) => ({
			theme,
			colour,
			...spacePalette(theme, colour),
		})),
	),
	inks: THEMES.flatMap((theme) =>
		PALETTE_HUES.map((colour) => ({
			theme,
			colour,
			ink: spaceInk(theme, colour),
		})),
	),
	initials: SPACE_NAMES.map((name) => ({
		name,
		initial: spaceInitial(name),
	})),
	glyphs: { grid: GLYPH_GRID, laptop: LAPTOP_GLYPH, cross: CROSS_GLYPH },
	badges: Object.fromEntries(
		THEMES.map((theme) => [
			theme,
			{
				local: LOCAL_BADGE_FILL,
				offline: OFFLINE_BADGE_FILL[theme],
				hatch: HATCH_INK[theme],
			},
		]),
	),
	sizes: SPACE_AVATAR_SIZES.map((size) => {
		const { lineStroke } = STATE_METRICS[size]
		const mark = markMetricsOf(size)
		return {
			size,
			isCompact: isCompact(size),
			lineStroke,
			mark: {
				...mark,
				cross: mark.cross ?? null,
				badgeCentre: dotCentre(size, mark.badge.diameter),
				hatchOffsets: hatchOffsetsOf(hatchPath(size, mark.hatch.spacing)),
			},
			outline: pointsOf(superellipsePath(size / 2, size / 2)),
		}
	}),
}

const borders = {
	compactBelow: COMPACT_BELOW,
	borders: GLAZE_THEMES.flatMap((theme) =>
		BORDER_SIDES.map((side) => {
			const isCompact = isCompactAt(side)
			return {
				side,
				theme,
				isCompact,
				edgeWidth: edgeWidthOf(side),
				edge: (isCompact ? COMPACT_EDGE : GLAZE_EDGE)[theme],
				lipOpacity: isCompact ? null : LIP_OPACITY[theme],
			}
		}),
	),
}

const hueTones = {
	tones: HUE_TONES,
	hues: HUES.map((hue) =>
		Object.fromEntries(
			THEMES.map((theme) => [
				theme,
				Object.fromEntries(
					HUE_ROLES.map((role) => [role, hueTone(hue, theme, role).hex]),
				),
			]),
		),
	),
}

await Bun.write(OUTPUT, JSON.stringify(vectors))
await Bun.write(HUE_OUTPUT, JSON.stringify(hueTones))
await Bun.write(BORDER_OUTPUT, JSON.stringify(borders))
await $`bunx biome format --write ${OUTPUT.pathname} ${BORDER_OUTPUT.pathname} ${HUE_OUTPUT.pathname}`.quiet()
console.log(
	`${vectors.arcs.length} ids, ${vectors.palettes.length} palettes, ${vectors.inks.length} inks, ${vectors.initials.length} initials, ${vectors.sizes.length} sizes -> ${OUTPUT.pathname}`,
)
console.log(`${borders.borders.length} borders -> ${BORDER_OUTPUT.pathname}`)
console.log(`${hueTones.hues.length} hues -> ${HUE_OUTPUT.pathname}`)
