import { useEffect } from "react"

import { activeTabOf } from "./tabs-model"
import { shownTabsOf, type WorkspaceTabs } from "./workspace-tabs"

import { usesCommandKey } from "../host"

type TabKeyPress = (tabs: WorkspaceTabs) => void

const activeTabIn = (tabs: WorkspaceTabs) =>
	activeTabOf(shownTabsOf(tabs.getState()))

const closeAllButActive: TabKeyPress = (tabs) =>
	tabs.closeOthers(activeTabIn(tabs).id)

const togglePinOfActive: TabKeyPress = (tabs) => {
	const { id, isPinned } = activeTabIn(tabs)
	if (isPinned) {
		tabs.unpin(id)
	} else {
		tabs.pin(id)
	}
}

const pressesWith = (mod: string) =>
	new Map<string, TabKeyPress>([
		[`${mod}+t`, (tabs) => tabs.openEmptyTab()],
		[`${mod}+w`, (tabs) => tabs.closeActive()],
		[`${mod}+shift+t`, (tabs) => tabs.reopenClosed()],
		[`${mod}+alt+w`, closeAllButActive],
		["ctrl+shift+p", togglePinOfActive],
	])

const letterOf = (event: KeyboardEvent) =>
	event.altKey && event.code.startsWith("Key")
		? event.code.slice("Key".length).toLowerCase()
		: event.key.toLowerCase()

const chordOf = (event: KeyboardEvent) =>
	[
		event.ctrlKey && "ctrl",
		event.metaKey && "meta",
		event.altKey && "alt",
		event.shiftKey && "shift",
		letterOf(event),
	]
		.filter(Boolean)
		.join("+")

export const useTabKeys = (tabs: WorkspaceTabs) => {
	useEffect(() => {
		const presses = pressesWith(usesCommandKey() ? "meta" : "ctrl")

		const press = (event: KeyboardEvent) => {
			const pressed = event.isComposing
				? undefined
				: presses.get(chordOf(event))
			if (!pressed) {
				return
			}
			event.preventDefault()
			pressed(tabs)
		}

		window.addEventListener("keydown", press, true)
		return () => window.removeEventListener("keydown", press, true)
	}, [tabs])
}
