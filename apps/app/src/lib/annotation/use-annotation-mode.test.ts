// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { useAnnotationMode } from "./use-annotation-mode"

const mountToolbar = (isActive: boolean) => {
	const host = document.createElement("agentation-toolbar")
	const controls = document.createElement("div")
	controls.setAttribute("role", "group")
	controls.setAttribute("aria-label", "Feedback controls")
	controls.setAttribute("aria-hidden", String(!isActive))
	host.attachShadow({ mode: "open" }).append(controls)
	document.body.append(host)
	return controls
}

const settle = () => act(() => Promise.resolve())

describe("useAnnotationMode", () => {
	afterEach(() => {
		cleanup()
		document.body.innerHTML = ""
	})

	it("stays hidden before the toolbar has attached its shadow root", () => {
		const { result } = renderHook(useAnnotationMode)

		expect(result.current).toBe(false)
	})

	it("shows once a toolbar mounted later reports annotation mode active", async () => {
		const { result } = renderHook(useAnnotationMode)

		mountToolbar(true)
		await settle()

		expect(result.current).toBe(true)
	})

	it("follows the controls going active, then inactive", async () => {
		const controls = mountToolbar(false)
		const { result } = renderHook(useAnnotationMode)
		expect(result.current).toBe(false)

		controls.setAttribute("aria-hidden", "false")
		await settle()
		expect(result.current).toBe(true)

		controls.setAttribute("aria-hidden", "true")
		await settle()
		expect(result.current).toBe(false)
	})

	it("stays visible when an Escape only closes one of the toolbar layers", async () => {
		const controls = mountToolbar(true)
		const layer = document.createElement("div")
		layer.setAttribute("data-active", "true")
		controls.append(layer)
		const { result } = renderHook(useAnnotationMode)

		layer.setAttribute("data-active", "false")
		await settle()

		expect(result.current).toBe(true)
	})

	it("hides when the toolbar unmounts", async () => {
		mountToolbar(true)
		const { result } = renderHook(useAnnotationMode)

		document.querySelector("agentation-toolbar")?.remove()
		await settle()

		expect(result.current).toBe(false)
	})
})
