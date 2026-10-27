import { $ } from "bun"

import { BLOT_TINTS } from "../../../packages/ui/src/components/companion-colour"
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
	COMPACT_RADII,
	dotCentre,
	isCompact,
	SPACE_AVATAR_SIZES,
	STATE_METRICS,
	spaceArcs,
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
		[null, ...BLOT_TINTS].map((colour) => ({
			theme,
			colour,
			...spacePalette(theme, colour),
		})),
	),
	sizes: SPACE_AVATAR_SIZES.map((size) => {
		const { dot, lineStroke } = STATE_METRICS[size]
		return {
			size,
			isCompact: isCompact(size),
			lineStroke,
			dot: dot ? { ...dot, centre: dotCentre(size, dot.diameter) } : null,
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

await Bun.write(OUTPUT, JSON.stringify(vectors))
await Bun.write(BORDER_OUTPUT, JSON.stringify(borders))
await $`bunx biome format --write ${OUTPUT.pathname} ${BORDER_OUTPUT.pathname}`.quiet()
console.log(
	`${vectors.arcs.length} ids, ${vectors.palettes.length} palettes, ${vectors.sizes.length} sizes -> ${OUTPUT.pathname}`,
)
console.log(`${borders.borders.length} borders -> ${BORDER_OUTPUT.pathname}`)
