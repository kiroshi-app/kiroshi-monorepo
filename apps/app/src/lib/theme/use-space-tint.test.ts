// @vitest-environment happy-dom

import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
	BLOT_HUES,
	type BotAvatarBlot,
} from "@workspace/ui/components/companion-colour"
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

const hueOf = (colour: BotAvatarBlot) => ({
	attribute: String(BLOT_HUES[colour]),
	properties: hueStyle(BLOT_HUES[colour]),
})

const CLEARED = { attribute: null, properties: {} }

describe("useSpaceTint", () => {
	afterEach(cleanup)

	it("sets the Space hue and both themes of every role on the html element", () => {
		renderHook(useSpaceTint, { initialProps: "cyan" as BotAvatarBlot | null })

		expect(hueOnRoot()).toEqual(hueOf("cyan"))
		expect(
			hueProperties().some((name) => name.startsWith("--hue-light-")),
		).toBe(true)
		expect(hueProperties().some((name) => name.startsWith("--hue-dark-"))).toBe(
			true,
		)
	})

	it("replaces every property when the hue changes", () => {
		const { rerender } = renderHook(useSpaceTint, {
			initialProps: "cyan" as BotAvatarBlot | null,
		})

		rerender("purple")

		expect(hueOnRoot()).toEqual(hueOf("purple"))
	})

	it("removes the attribute and every property when the colour clears, then on unmount", () => {
		const { rerender, unmount } = renderHook(useSpaceTint, {
			initialProps: "cyan" as BotAvatarBlot | null,
		})

		rerender(null)

		expect(hueOnRoot()).toEqual(CLEARED)

		rerender("orange")
		unmount()

		expect(hueOnRoot()).toEqual(CLEARED)
	})
})
