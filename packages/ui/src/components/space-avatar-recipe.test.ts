import { describe, expect, it } from "vitest"

import { oklabOf, srgbOfHex } from "@workspace/ui/components/companion-avatar"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import {
	dashArray,
	dotCentre,
	hatchPath,
	isCompact,
	markMetricsOf,
	SPACE_AVATAR_SIZES,
	spaceArcs,
	spaceInitial,
	spaceInk,
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

	it.each(Object.entries(BLOT_HUES))("keeps the hue of %s, %i", (_, hue) => {
		for (const theme of ["light", "dark"] as const)
			for (const hex of spacePalette(theme, hue).full) {
				const drift = Math.abs(((hueDegreesOf(hex) - hue + 540) % 360) - 180)
				expect(drift).toBeLessThan(4)
			}
	})

	it("darkens from ground to core in light and lightens in dark", () => {
		const lightnessOf = (hex: string) => oklabOf(srgbOfHex(hex)).lightness
		const light = spacePalette("light", BLOT_HUES.blue).full.map(lightnessOf)
		const dark = spacePalette("dark", BLOT_HUES.blue).full.map(lightnessOf)
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

describe("spaceInitial", () => {
	it("takes the first grapheme, uppercased", () => {
		expect(spaceInitial("atelier")).toBe("A")
		expect(spaceInitial("  harbour Studio")).toBe("H")
		expect(spaceInitial("\u{1F468}\u200D\u{1F4BB} lab")).toBe(
			"\u{1F468}\u200D\u{1F4BB}",
		)
		expect(spaceInitial("e\u0301tude")).toBe("E\u0301")
	})

	it("is empty for an empty or blank name", () => {
		expect(spaceInitial("")).toBe("")
		expect(spaceInitial(" \t ")).toBe("")
	})
})

describe("spaceInk", () => {
	it("draws the neutral ink of artboard F without a colour", () => {
		expect(spaceInk("light", null)).toBe("#3d3d3d")
		expect(spaceInk("dark", undefined)).toBe("#f2f2f2")
	})

	it("keeps the Space hue at L 0.36 in light and 0.96 in dark", () => {
		for (const theme of ["light", "dark"] as const) {
			const ink = spaceInk(theme, BLOT_HUES.green)
			expect(oklabOf(srgbOfHex(ink)).lightness).toBeCloseTo(
				theme === "light" ? 0.36 : 0.96,
				2,
			)
			expect(hueDegreesOf(ink)).toBeCloseTo(BLOT_HUES.green, -1)
		}
	})
})

describe("markMetricsOf", () => {
	it("draws the badge of artboard F at 48, 26 and 14", () => {
		for (const [size, diameter, centre] of [
			[48, 18, 41.52],
			[26, 12, 21.68],
			[14, 8, 11.12],
		] as const) {
			const { badge } = markMetricsOf(size)
			expect(badge.diameter).toBe(diameter)
			expect(dotCentre(size, badge.diameter)).toBeCloseTo(centre, 6)
		}
	})

	it("scales 12 from 14, 36 from 26 and 64 from 48", () => {
		expect(markMetricsOf(12).initial).toEqual({ fontSize: 8.571, weight: 700 })
		expect(markMetricsOf(36).initial).toEqual({ fontSize: 18, weight: 600 })
		expect(markMetricsOf(64).badge).toEqual({ diameter: 24, cutOut: 3.333 })
		expect(markMetricsOf(12).cross).toBeUndefined()
		expect(markMetricsOf(36).cross?.stroke).toBe(3.2)
	})
})

describe("hatchPath", () => {
	it("runs one line per spacing across the whole tile", () => {
		const lines = hatchPath(48, 6, 1.5).split("M").filter(Boolean)
		expect(lines).toHaveLength(
			Math.ceil((96 - 0.75 * Math.SQRT2) / (6 * Math.SQRT2)),
		)
		expect(lines[0]).toBe("1.061 0L0 1.061")
	})
})
