import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import {
	HUE_PRESETS,
	HUE_TONES,
	YELLOW_BAND,
} from "@workspace/ui/components/hue-tones"

import {
	hueTonesOf,
	renderColorSets,
	renderCss,
	type TokenFile,
	toSrgb,
	withBlotAliases,
	withHueColours,
} from "./render-tokens"

const read = (path: string) =>
	readFileSync(new URL(path, import.meta.url), "utf8")

const THEME_SELECTORS = new Set([":root", ".dark"])

const TINTED_FILE: TokenFile = {
	colors: {
		blue: { light: "#a0bee8" },
		ink: { light: "oklch(0.08 0 0)" },
		tint: { light: "var(--hue-light-accent, {blue})" },
		strong: { light: "color-mix(in oklab, {tint} 60%, {ink})" },
		mark: { light: "color-mix(in oklab, {strong} 40%, transparent)" },
	},
	parameters: {},
}

const topLevelRules = (css: string) => {
	const rules: { selector: string; body: string }[] = []
	let depth = 0
	let selectorStart = 0
	let bodyStart = 0
	for (let index = 0; index < css.length; index++) {
		if (css[index] === "{" && depth++ === 0) bodyStart = index + 1
		if (css[index] === "}" && --depth === 0) {
			rules.push({
				selector: css.slice(selectorStart, bodyStart - 1).trim(),
				body: css.slice(bodyStart, index),
			})
			selectorStart = index + 1
		}
	}
	return rules
}

const themeDeclarations = (css: string) =>
	topLevelRules(css)
		.flatMap(({ selector, body }) =>
			selector
				.split(",")
				.map((part) => part.trim())
				.filter((part) => THEME_SELECTORS.has(part))
				.map((theme) => ({ selector: theme, body })),
		)
		.flatMap(({ selector, body }) =>
			body
				.split(";")
				.map((declaration) => declaration.trim())
				.filter((declaration) => declaration.startsWith("--"))
				.map(
					(declaration) =>
						`${selector} ${declaration.slice(0, declaration.indexOf(":"))}`,
				),
		)

describe("tokens.json", () => {
	it("leaves every generated custom property out of the hand-written theme blocks", () => {
		const generated = new Set(themeDeclarations(read("../styles/tokens.css")))
		const handWritten = themeDeclarations(read("../styles/globals.css"))

		expect(generated.size).toBeGreaterThan(0)
		expect(
			handWritten.filter((declaration) => generated.has(declaration)),
		).toEqual([])
	})

	it("re-declares every theme block on an element carrying a hue", () => {
		expect(renderCss(TINTED_FILE)).toMatch(/^:root, \[data-hue\] \{$/m)
		expect(renderCss(TINTED_FILE)).toMatch(/^\.dark, \.dark \[data-hue\] \{$/m)
	})

	it("generates the hue module from the hue section", () => {
		const file: TokenFile = JSON.parse(read("../../tokens.json"))

		expect(HUE_PRESETS).toEqual(file.hue?.presets)
		expect(YELLOW_BAND).toEqual(file.hue?.["yellow-band"])
		expect(HUE_TONES).toEqual(hueTonesOf(file))
	})

	it("aliases each bot-blot colour set in the catalogue to the accent of its hue", () => {
		const file: TokenFile = JSON.parse(read("../../tokens.json"))
		const hued = withHueColours(file)
		const colorSets = Object.fromEntries(
			renderColorSets(withBlotAliases(hued)).map(({ name, contents }) => [
				name,
				JSON.parse(contents).colors,
			]),
		)
		const presets = Object.keys(file.hue?.presets ?? {})

		expect(presets).toHaveLength(8)
		for (const preset of presets)
			expect(colorSets[`bot-blot-${preset}`]).toEqual(
				colorSets[`hue-${preset}-accent`],
			)
		expect(renderCss(hued)).not.toMatch(/--bot-blot-(?!ink)/)
	})

	it("converts each notation to the sRGB bytes Chromium paints", () => {
		expect(toSrgb("#123456")).toEqual({
			red: 18,
			green: 52,
			blue: 86,
			alpha: 1,
		})
		expect(toSrgb("rgb(10 20 30 / 50%)")).toEqual({
			red: 10,
			green: 20,
			blue: 30,
			alpha: 0.5,
		})
		expect(toSrgb("oklch(0.6 0.25 30)")).toEqual({
			red: 241,
			green: 0,
			blue: 0,
			alpha: 1,
		})
		expect(toSrgb("oklch(0.5 0 0 / 20%)")).toEqual({
			red: 99,
			green: 99,
			blue: 99,
			alpha: 0.2,
		})
	})

	it("renders references nested in a value as custom properties", () => {
		expect(renderCss(TINTED_FILE)).toContain(
			"--strong: color-mix(in oklab, var(--tint) 60%, var(--ink));",
		)
	})

	it("paints a runtime tint with its fallback and resolves oklab mixes in the catalogue", () => {
		const lightComponents = Object.fromEntries(
			renderColorSets(TINTED_FILE).map(({ name, contents }) => [
				name,
				JSON.parse(contents).colors[0].color.components,
			]),
		)

		expect(lightComponents.tint).toEqual(lightComponents.blue)
		expect(lightComponents.strong).toEqual({
			alpha: "1.000",
			red: "0x57",
			green: "0x67",
			blue: "0x7E",
		})
		expect(lightComponents.mark).toEqual({
			...lightComponents.strong,
			alpha: "0.400",
		})
	})
})
