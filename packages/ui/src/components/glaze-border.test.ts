import { describe, expect, it } from "vitest"

import {
	COMPACT_EDGE,
	edgeWidthOf,
	GLAZE_EDGE,
	isCompactAt,
	LIP_OPACITY,
} from "@workspace/ui/components/glaze-border"

describe("glaze border", () => {
	it("goes compact under 20px", () => {
		expect([14, 16, 19, 20, 24].map(isCompactAt)).toEqual([
			true,
			true,
			true,
			false,
			false,
		])
	})

	it("draws the edge a fortieth of the side, never under 1px, from 20px", () => {
		expect([24, 40, 64].map(edgeWidthOf)).toEqual([1, 1, 1.6])
	})

	it("draws the compact edge a twentieth of the side", () => {
		expect(edgeWidthOf(14)).toBeCloseTo(0.7)
	})

	it("keeps the measured colours in both themes", () => {
		expect(GLAZE_EDGE).toEqual({
			light: { colour: "#000000", opacity: 0.08 },
			dark: { colour: "#ffffff", opacity: 0.1 },
		})
		expect(COMPACT_EDGE).toEqual({
			light: { colour: "#000000", opacity: 0.1 },
			dark: { colour: "#ffffff", opacity: 0.12 },
		})
		expect(LIP_OPACITY).toEqual({ light: 0.55, dark: 0.22 })
	})
})
