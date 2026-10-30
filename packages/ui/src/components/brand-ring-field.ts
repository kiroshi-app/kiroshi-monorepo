import {
	type DensityField,
	fieldLattice,
} from "@workspace/ui/components/companion-avatar"
import { squareGrid } from "@workspace/ui/components/field-grid"
import {
	INNER,
	isInsideRoundedHexagon,
	OUTER,
} from "@workspace/ui/components/kiroshi-hexagon"

const REFERENCE_WIDTH = 401
const MARGIN_CELLS = 1
const brandRingField = (seed: number, cells: number): DensityField => {
	const scale = (REFERENCE_WIDTH * cells) / (cells - 2 * MARGIN_CELLS)
	const ring = Uint8Array.from({ length: cells * cells }, (_, index) => {
		const x = (((index % cells) + 0.5) / cells - 0.5) * scale
		const y = ((Math.floor(index / cells) + 0.5) / cells - 0.5) * scale
		return isInsideRoundedHexagon(OUTER, x, y) &&
			!isInsideRoundedHexagon(INNER, x, y)
			? 1
			: 0
	})
	return {
		grid: squareGrid(cells),
		silhouette: Float32Array.from(ring),
		lattice: fieldLattice(seed),
		mask: ring,
	}
}

export { brandRingField }
