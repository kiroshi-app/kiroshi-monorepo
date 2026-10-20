// @vitest-environment happy-dom

import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
	useWorkspaceShortcuts,
	type WorkspaceShortcuts,
} from "./use-workspace-shortcuts"

const REMOVED_CHORDS: KeyboardEventInit[] = [
	{ key: "b", metaKey: true },
	{ key: "b", ctrlKey: true },
	{ key: "d" },
	{ key: "D", shiftKey: true },
	{ key: "Backspace", metaKey: true },
]

const mounted = (isEnabled = true, selectedBotId: string | null = null) => {
	const shortcuts: WorkspaceShortcuts = {
		isEnabled,
		selectedBotId,
		onOpenUserSettings: vi.fn(),
		onStartConversation: vi.fn(),
	}
	renderHook(useWorkspaceShortcuts, { initialProps: shortcuts })
	return shortcuts
}

const pressOn = (target: EventTarget, init: KeyboardEventInit) => {
	const event = new KeyboardEvent("keydown", {
		bubbles: true,
		cancelable: true,
		...init,
	})
	target.dispatchEvent(event)
	return event
}

const fieldOf = (markup: string) => {
	const holder = document.createElement("div")
	holder.innerHTML = markup
	document.body.append(holder)
	return holder.firstElementChild as HTMLElement
}

describe("useWorkspaceShortcuts", () => {
	afterEach(() => {
		cleanup()
		document.body.innerHTML = ""
	})

	it("opens the user settings on Cmd+comma", () => {
		const shortcuts = mounted()

		const event = pressOn(document.body, { key: ",", metaKey: true })

		expect(shortcuts.onOpenUserSettings).toHaveBeenCalledTimes(1)
		expect(shortcuts.onStartConversation).not.toHaveBeenCalled()
		expect(event.defaultPrevented).toBe(true)
	})

	it("leaves Cmd+Shift+F to the annotation toolbar", () => {
		const shortcuts = mounted()

		const event = pressOn(document.body, {
			key: "f",
			metaKey: true,
			shiftKey: true,
		})

		expect(shortcuts.onOpenUserSettings).not.toHaveBeenCalled()
		expect(shortcuts.onStartConversation).not.toHaveBeenCalled()
		expect(event.defaultPrevented).toBe(false)
	})

	it("starts an empty conversation on Cmd+N with no companion selected", () => {
		const shortcuts = mounted()

		const event = pressOn(document.body, { key: "n", metaKey: true })

		expect(shortcuts.onStartConversation).toHaveBeenCalledTimes(1)
		expect(shortcuts.onStartConversation).toHaveBeenCalledWith([])
		expect(shortcuts.onOpenUserSettings).not.toHaveBeenCalled()
		expect(event.defaultPrevented).toBe(true)
	})

	it("seats the selected companion in the conversation Cmd+N starts", () => {
		const shortcuts = mounted(true, "atlas")

		const event = pressOn(document.body, { key: "n", metaKey: true })

		expect(shortcuts.onStartConversation).toHaveBeenCalledTimes(1)
		expect(shortcuts.onStartConversation).toHaveBeenCalledWith(["atlas"])
		expect(shortcuts.onOpenUserSettings).not.toHaveBeenCalled()
		expect(event.defaultPrevented).toBe(true)
	})

	it.each([
		"<input />",
		"<textarea></textarea>",
		"<div contenteditable='true'><span>draft</span></div>",
	])("fires nothing while typing in %s", (markup) => {
		const shortcuts = mounted()
		const field = fieldOf(markup)
		const target = field.firstElementChild ?? field

		pressOn(target, { key: ",", metaKey: true })
		pressOn(target, { key: "n", metaKey: true })

		expect(shortcuts.onOpenUserSettings).not.toHaveBeenCalled()
		expect(shortcuts.onStartConversation).not.toHaveBeenCalled()
	})

	it("fires nothing while an overlay holds the keyboard", () => {
		const shortcuts = mounted(false)

		pressOn(document.body, { key: ",", metaKey: true })
		pressOn(document.body, { key: "n", metaKey: true })

		expect(shortcuts.onOpenUserSettings).not.toHaveBeenCalled()
		expect(shortcuts.onStartConversation).not.toHaveBeenCalled()
	})

	it.each(REMOVED_CHORDS)("does nothing on the removed chord %o", (init) => {
		const shortcuts = mounted()

		const event = pressOn(document.body, init)

		expect(shortcuts.onOpenUserSettings).not.toHaveBeenCalled()
		expect(shortcuts.onStartConversation).not.toHaveBeenCalled()
		expect(event.defaultPrevented).toBe(false)
	})
})
