import { describe, expect, it } from "vitest"

import { hueOfPreset, presetOfHue } from "@/lib/colour/hue-shim"

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
})
