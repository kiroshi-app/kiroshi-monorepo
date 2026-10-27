// @vitest-environment happy-dom

import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { hueStyle } from "@workspace/ui/components/hue-palette"

import { useSpaceTint } from "./use-space-tint"

const root = () => document.documentElement

const hueProperties = () =>
	Array.from(root().style).filter((property) => property.startsWith("--hue-"))

const hueOnRoot = () => ({
	attribute: root().getAttribute("data-hue"),
	properties: Object.fromEntries(
		hueProperties().map((property) => [
			property,
			root().style.getPropertyValue(property),
		]),
	),
})

const expectedHueOf = (hue: number) => ({
	attribute: String(hue),
	properties: hueStyle(hue),
})

const CLEARED = { attribute: null, properties: {} }

describe("useSpaceTint", () => {
	afterEach(cleanup)

	it("sets the Space hue and both themes of every role on the html element", () => {
		renderHook(useSpaceTint, { initialProps: 186 as number | null })

		expect(hueOnRoot()).toEqual(expectedHueOf(186))
		expect(
			hueProperties().some((name) => name.startsWith("--hue-light-")),
		).toBe(true)
		expect(hueProperties().some((name) => name.startsWith("--hue-dark-"))).toBe(
			true,
		)
	})

	it("writes a hue outside the presets on the root unchanged", () => {
		renderHook(useSpaceTint, { initialProps: 210 as number | null })

		expect(hueOnRoot()).toEqual(expectedHueOf(210))
	})

	it("keeps a hue of 0 on the root", () => {
		renderHook(useSpaceTint, { initialProps: 0 as number | null })

		expect(hueOnRoot()).toEqual(expectedHueOf(0))
	})

	it("replaces every property when the hue changes", () => {
		const { rerender } = renderHook(useSpaceTint, {
			initialProps: 186 as number | null,
		})

		rerender(296)

		expect(hueOnRoot()).toEqual(expectedHueOf(296))
	})

	it("removes the attribute and every property when the colour clears, then on unmount", () => {
		const { rerender, unmount } = renderHook(useSpaceTint, {
			initialProps: 186 as number | null,
		})

		rerender(null)

		expect(hueOnRoot()).toEqual(CLEARED)

		rerender(63)
		unmount()

		expect(hueOnRoot()).toEqual(CLEARED)
	})
})
