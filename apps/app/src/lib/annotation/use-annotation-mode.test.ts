// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { useAnnotationMode } from "./use-annotation-mode"

const ANNOTATION_CHORD: KeyboardEventInit = {
	key: "F",
	metaKey: true,
	shiftKey: true,
}

const press = (init: KeyboardEventInit) => {
	act(() => {
		document.body.dispatchEvent(
			new KeyboardEvent("keydown", {
				bubbles: true,
				cancelable: true,
				...init,
			}),
		)
	})
}

const pressPrevented = (init: KeyboardEventInit) => {
	const consume = (event: Event) => event.preventDefault()
	document.addEventListener("keydown", consume, { once: true })
	press(init)
}

describe("useAnnotationMode", () => {
	afterEach(cleanup)

	it("starts with annotation mode off", () => {
		const { result } = renderHook(useAnnotationMode)

		expect(result.current).toBe(false)
	})

	it("turns annotation mode on with Cmd+Shift+F and off with Escape", () => {
		const { result } = renderHook(useAnnotationMode)

		press(ANNOTATION_CHORD)
		expect(result.current).toBe(true)

		press({ key: "Escape" })
		expect(result.current).toBe(false)
	})

	it("turns annotation mode off on a second Cmd+Shift+F", () => {
		const { result } = renderHook(useAnnotationMode)

		press(ANNOTATION_CHORD)
		press(ANNOTATION_CHORD)

		expect(result.current).toBe(false)
	})

	it("stays on when the toolbar consumed the Escape for one of its own layers", () => {
		const { result } = renderHook(useAnnotationMode)

		press(ANNOTATION_CHORD)
		pressPrevented({ key: "Escape" })

		expect(result.current).toBe(true)
	})

	it("ignores Cmd+F, Cmd+Shift+Option+F and a chord typed mid composition", () => {
		const { result } = renderHook(useAnnotationMode)

		press({ key: "f", metaKey: true })
		press({ ...ANNOTATION_CHORD, altKey: true })
		press({ ...ANNOTATION_CHORD, isComposing: true })

		expect(result.current).toBe(false)
	})
})
