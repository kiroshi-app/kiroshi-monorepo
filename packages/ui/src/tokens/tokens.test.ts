import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import {
	renderColorSets,
	renderCss,
	type TokenFile,
	toSrgb,
} from "./render-tokens"

const read = (path: string) =>
	readFileSync(new URL(path, import.meta.url), "utf8")

const THEME_SELECTORS = [":root", ".dark"]

const TINTED_FILE: TokenFile = {
	colors: {
		blue: { light: "#a0bee8" },
		ink: { light: "oklch(0.08 0 0)" },
		tint: { light: "var(--space-tint, {blue})" },
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
		.filter(({ selector }) => THEME_SELECTORS.includes(selector))
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
