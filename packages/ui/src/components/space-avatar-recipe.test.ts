import { describe, expect, it } from "vitest"

import {
	BLOT_COLOURS,
	oklabOf,
	srgbOfHex,
} from "@workspace/ui/components/companion-avatar"
import { BLOT_TINTS } from "@workspace/ui/components/companion-colour"
import {
	dashArray,
	isCompact,
	SPACE_AVATAR_SIZES,
	spaceArcs,
	spacePalette,
	superellipsePerimeter,
} from "@workspace/ui/components/space-avatar-recipe"

const hueDegreesOf = (hex: string) => {
	const { a, b } = oklabOf(srgbOfHex(hex))
	return (Math.atan2(b, a) * 180) / Math.PI
}

const chromaOf = (hex: string) => {
	const { a, b } = oklabOf(srgbOfHex(hex))
	return Math.hypot(a, b)
}

describe("spaceArcs", () => {
	it("draws the same anchor and radii for the same id", () => {
		expect(spaceArcs("space-studio")).toEqual(spaceArcs("space-studio"))
	})

	it("places each arc inside its range", () => {
		const { radii } = spaceArcs("space-studio")
		expect(radii[0]).toBeGreaterThanOrEqual(0.36)
		expect(radii[0]).toBeLessThanOrEqual(0.42)
		expect(radii[1]).toBeGreaterThanOrEqual(0.64)
		expect(radii[1]).toBeLessThanOrEqual(0.76)
		expect(radii[2]).toBeGreaterThanOrEqual(0.92)
		expect(radii[2]).toBeLessThanOrEqual(1.08)
	})

	it("anchors on all four corners, 0.02 s outside them", () => {
		const anchors = new Set(
			Array.from({ length: 64 }, (_, index) => {
				const { anchor } = spaceArcs(`space-${index}`)
				return `${anchor.x} ${anchor.y}`
			}),
		)
		expect([...anchors].sort()).toEqual(
			["-0.02 -0.02", "1.02 -0.02", "1.02 1.02", "-0.02 1.02"].sort(),
		)
	})
})

describe("spacePalette", () => {
	it("draws Personal in the fixed greys", () => {
		expect(spacePalette("light", null).compact[2]).toBe("#636363")
		expect(spacePalette("dark", null).compact[2]).toBe("#b7b7b7")
		for (const hex of spacePalette("light", null).full)
			expect(chromaOf(hex)).toBeLessThan(1e-3)
	})

	it.each(BLOT_TINTS)("keeps the hue of the %s blot", (colour) => {
		const hue = hueDegreesOf(BLOT_COLOURS[colour])
		for (const theme of ["light", "dark"] as const)
			for (const hex of spacePalette(theme, colour).full) {
				const drift = Math.abs(((hueDegreesOf(hex) - hue + 540) % 360) - 180)
				expect(drift).toBeLessThan(4)
			}
	})

	it("darkens from ground to core in light and lightens in dark", () => {
		const lightnessOf = (hex: string) => oklabOf(srgbOfHex(hex)).lightness
		const light = spacePalette("light", "blue").full.map(lightnessOf)
		const dark = spacePalette("dark", "blue").full.map(lightnessOf)
		expect([...light].sort((a, b) => b - a)).toEqual(light)
		expect([...dark].sort((a, b) => a - b)).toEqual(dark)
	})
})

describe("recipe", () => {
	it("goes compact under 20px", () => {
		expect(SPACE_AVATAR_SIZES.filter(isCompact)).toEqual([12, 14])
	})

	it("cuts an outline into at least eight dashes", () => {
		const [dash = "", gap = ""] = dashArray(
			superellipsePerimeter(6, 5.25),
			1.5,
		).split(" ")
		const period = Number(dash) + Number(gap)
		expect(Number(dash) / period).toBeCloseTo(0.55, 2)
		expect(
			Math.round(superellipsePerimeter(6, 5.25) / period),
		).toBeGreaterThanOrEqual(8)
	})
})
