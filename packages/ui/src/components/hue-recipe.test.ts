import { describe, expect, it } from "vitest"

import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import { HUE_ROLES, hueTone } from "@workspace/ui/components/hue-palette"
import {
	contrastRatio,
	HUE_THEMES,
	hueDistance,
	isInSrgb,
} from "@workspace/ui/components/hue-recipe"
import { HUE_TONES, YELLOW_BAND } from "@workspace/ui/components/hue-tones"

const EVERY_HUE = Array.from({ length: 360 }, (_, hue) => hue)

const WHITE = "#ffffff"
const DARK_CARD = "#121213"

const CYAN_BAND = EVERY_HUE.filter((hue) => hueDistance(hue, 186) <= 20)

const YELLOW_HUES = EVERY_HUE.filter(
	(hue) => hueDistance(hue, YELLOW_BAND.centre) < YELLOW_BAND.radius,
)

describe("hue recipe", () => {
	it("exports the eight presets as named hues", () => {
		expect(BLOT_HUES).toEqual({
			red: 42,
			orange: 63,
			yellow: 82,
			green: 132,
			cyan: 186,
			blue: 257,
			purple: 296,
			pink: 358,
		})
	})

	it("keeps every role of every hue inside the sRGB gamut", () => {
		for (const hue of EVERY_HUE)
			for (const theme of HUE_THEMES)
				for (const role of HUE_ROLES) {
					const tone = hueTone(hue, theme, role)
					expect(
						isInSrgb(tone.lightness, tone.chroma, tone.hue),
						`${theme} ${role} at ${hue}`,
					).toBe(true)
				}
	})

	it("holds the accent and the bubble text at their floors for every hue", () => {
		for (const hue of EVERY_HUE) {
			expect(
				contrastRatio(hueTone(hue, "light", "accent").hex, WHITE),
			).toBeGreaterThanOrEqual(4.5)
			expect(
				contrastRatio(hueTone(hue, "dark", "accent").hex, DARK_CARD),
			).toBeGreaterThanOrEqual(4.5)
			for (const theme of HUE_THEMES)
				expect(
					contrastRatio(
						hueTone(hue, theme, "bubble").hex,
						HUE_TONES[theme].bubble.contrast.with,
					),
				).toBeGreaterThanOrEqual(7)
		}
	})

	it("cuts each chroma to the sRGB edge of its hue", () => {
		expect(hueTone(186, "light", "accent").chroma).toBeCloseTo(0.088, 3)
		expect(hueTone(257, "light", "bubble").chroma).toBeCloseTo(0.063, 2)
		expect(hueTone(186, "dark", "bubble").chroma).toBeCloseTo(0.074, 2)
		expect(hueTone(82, "dark", "bubble").chroma).toBeCloseTo(0.09, 2)
	})

	it("sets the dark bubble lightness for 7.2:1 under its text", () => {
		for (const hue of EVERY_HUE) {
			const { lightness } = hueTone(hue, "dark", "bubble")
			expect(lightness).toBeGreaterThanOrEqual(0.42)
			expect(lightness).toBeLessThanOrEqual(0.45)
		}
	})

	it("applies the yellow correction at 82 and fades it out across the band", () => {
		const yellow = hueTone(82, "light", "accent")
		expect(yellow.hue).toBe(75)
		expect(yellow.lightness).toBe(0.54)
		expect(yellow.chroma).toBeCloseTo(0.115, 2)

		const outside = hueTone(
			YELLOW_BAND.centre + YELLOW_BAND.radius,
			"light",
			"accent",
		)
		expect(outside.hue).toBe(YELLOW_BAND.centre + YELLOW_BAND.radius)
		expect(outside.lightness).toBe(0.5)
	})

	it("never turns a yellow hue towards green nor darker than the base accent", () => {
		for (const hue of YELLOW_HUES) {
			const tone = hueTone(hue, "light", "accent")
			expect(tone.hue).toBeLessThanOrEqual(hue)
			expect(tone.lightness).toBeGreaterThanOrEqual(0.5)
		}
		for (const [hue, next] of YELLOW_HUES.slice(0, -1).map((hue) => [
			hue,
			hue + 1,
		])) {
			const step = Math.abs(
				hueTone(next, "light", "accent").lightness -
					hueTone(hue, "light", "accent").lightness,
			)
			expect(step).toBeLessThan(0.01)
		}
	})

	it("keeps the hue of the cyan band and lets the gamut cut set its chroma", () => {
		for (const hue of CYAN_BAND)
			for (const theme of HUE_THEMES)
				for (const role of ["bubble", "accent"] as const) {
					const tone = hueTone(hue, theme, role)
					expect(tone.hue).toBe(hue)
					expect(tone.chroma).toBeGreaterThan(0.06)
				}
	})

	it("derives the conversation icon pair from the hue in both themes", () => {
		for (const theme of HUE_THEMES) {
			const cells = Object.values(BLOT_HUES).map(
				(hue) => hueTone(hue, theme, "conversation-icon").hex,
			)
			expect(new Set(cells).size).toBe(cells.length)
		}
	})
})
