// @vitest-environment happy-dom

import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import type { BotAvatarBlot } from "@workspace/ui/components/companion-colour"

import { useSpaceTint } from "./use-space-tint"

const root = () => document.documentElement

const tintOnRoot = () => ({
	attribute: root().getAttribute("data-space-tint"),
	property: root().style.getPropertyValue("--space-tint"),
})

describe("useSpaceTint", () => {
	afterEach(cleanup)

	it("follows the selected Space colour on the html element, then clears on unmount", () => {
		const { rerender, unmount } = renderHook(useSpaceTint, {
			initialProps: "cyan" as BotAvatarBlot | null,
		})

		expect(tintOnRoot()).toEqual({
			attribute: "cyan",
			property: "var(--bot-blot-cyan)",
		})

		rerender("purple")

		expect(tintOnRoot()).toEqual({
			attribute: "purple",
			property: "var(--bot-blot-purple)",
		})

		rerender(null)

		expect(tintOnRoot()).toEqual({ attribute: null, property: "" })

		rerender("cyan")
		unmount()

		expect(tintOnRoot()).toEqual({ attribute: null, property: "" })
	})
})
