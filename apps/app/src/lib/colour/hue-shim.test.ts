import { describe, expect, it } from "vitest"

import {
	hueAfterPick,
	hueOfPreset,
	PRESET_HUES,
	presetOfHue,
} from "@/lib/colour/hue-shim"

const PRESETS = [
	["red", 42],
	["orange", 63],
	["yellow", 82],
	["green", 132],
	["cyan", 186],
	["blue", 257],
	["purple", 296],
	["pink", 358],
] as const

describe("hue shim", () => {
	it("gives each preset its hue and reads that hue back as the preset", () => {
		for (const [preset, hue] of PRESETS) {
			expect(hueOfPreset(preset)).toBe(hue)
			expect(presetOfHue(hue)).toBe(preset)
		}
	})

	it("names 0 and 359 by the distance around the circle", () => {
		expect(presetOfHue(0)).toBe("pink")
		expect(presetOfHue(359)).toBe("pink")
		expect(presetOfHue(300)).toBe("purple")
	})

	it("gives a tie to the lower preset hue", () => {
		expect(presetOfHue(20)).toBe("red")
		expect(presetOfHue(107)).toBe("yellow")
	})

	it("keeps a held hue while the preset picked is still its nearest", () => {
		expect(hueAfterPick("cyan", 210)).toBe(210)
		expect(hueAfterPick("cyan", 186)).toBe(186)
	})

	it("takes the preset hue once another preset is picked, and nothing once none is", () => {
		expect(hueAfterPick("blue", 210)).toBe(257)
		expect(hueAfterPick("blue", null)).toBe(257)
		expect(hueAfterPick(undefined, 210)).toBeNull()
	})

	it("lists the preset hues in the order companions wear them", () => {
		expect(PRESET_HUES).toEqual([42, 82, 132, 186, 257, 296, 358, 63])
	})
})
