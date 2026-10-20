// @vitest-environment happy-dom

import { act, cleanup, render } from "@testing-library/react"
import { createElement } from "react"
import { afterEach, describe, expect, it } from "vitest"

import { AnnotationToolbar } from "./annotation-toolbar"

const settle = () => act(() => Promise.resolve())

const openPopup = (role: "dialog" | "alertdialog") => {
	const popup = document.createElement("div")
	popup.setAttribute("role", role)
	popup.setAttribute("data-open", "")
	document.body.append(popup)
	return popup
}

const closePopup = (popup: HTMLElement) => {
	popup.removeAttribute("data-open")
	popup.setAttribute("data-closed", "")
}

const findPortalHost = () => document.querySelector("[data-agentation-portal]")

const findToolbar = () => document.querySelector("agentation-toolbar")

const renderToolbar = () => render(createElement(AnnotationToolbar))

describe("AnnotationToolbar", () => {
	afterEach(() => {
		cleanup()
		document.body.innerHTML = ""
	})

	it("starts on the body, follows a popup open, then returns once it closes, across a re-render", async () => {
		const { rerender } = renderToolbar()
		await settle()
		const toolbar = findToolbar()
		expect(findPortalHost()?.parentElement).toBe(document.body)

		const dialog = openPopup("dialog")
		await settle()
		expect(findPortalHost()?.parentElement).toBe(dialog)

		closePopup(dialog)
		await settle()
		expect(findPortalHost()?.parentElement).toBe(document.body)

		rerender(createElement(AnnotationToolbar))
		await settle()
		expect(findPortalHost()?.parentElement).toBe(document.body)
		expect(findToolbar()).toBe(toolbar)
	})

	it("moves into the topmost of two stacked popups, then into the one beneath when it closes", async () => {
		renderToolbar()
		const dialog = openPopup("dialog")
		const confirmation = openPopup("alertdialog")
		await settle()
		expect(findPortalHost()?.parentElement).toBe(confirmation)

		closePopup(confirmation)
		await settle()
		expect(findPortalHost()?.parentElement).toBe(dialog)
	})
})
