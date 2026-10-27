import { $ } from "bun"

import {
	COMPACT_BELOW,
	COMPACT_EDGE,
	edgeWidthOf,
	GLAZE_EDGE,
	GLAZE_THEMES,
	isCompactAt,
	LIP_OPACITY,
} from "../../../packages/ui/src/components/glaze-border"

const OUTPUT = new URL(
	"../KiroshiTests/Vectors/glaze-border.json",
	import.meta.url,
)

const SIDES = [12, 14, 16, 17.87, 19, 20, 24, 28, 40, 52, 56, 64, 88]

const vectors = {
	compactBelow: COMPACT_BELOW,
	borders: GLAZE_THEMES.flatMap((theme) =>
		SIDES.map((side) => {
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
await $`bunx biome format --write ${OUTPUT.pathname}`.quiet()
console.log(`${vectors.borders.length} borders -> ${OUTPUT.pathname}`)
