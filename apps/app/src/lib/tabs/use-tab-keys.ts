import { useEffect } from "react"

import { activeTabOf } from "./tabs-model"
import {
	openNewWindow,
	shownTabsOf,
	type WorkspaceTabs,
} from "./workspace-tabs"

import type { FileMenuAction } from "../bindings"
import { carriesNativeMenu, usesCommandKey, watchFileMenu } from "../host"

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

const fileMenuActions: Record<FileMenuAction, TabKeyPress> = {
	newTab: (tabs) => tabs.openEmptyTab(),
	newWindow: () => {
		void openNewWindow()
	},
	reopenClosedTab: (tabs) => tabs.reopenClosed(),
	closeTab: (tabs) => tabs.closeActive(),
}

const fileMenuChordsWith = (mod: string): [string, TabKeyPress][] => [
	[`${mod}+t`, fileMenuActions.newTab],
	[`${mod}+w`, fileMenuActions.closeTab],
	[`${mod}+shift+t`, fileMenuActions.reopenClosedTab],
]

const pressesWith = (mod: string) =>
	new Map<string, TabKeyPress>([
		...(carriesNativeMenu() ? [] : fileMenuChordsWith(mod)),
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

const watchFileMenuFor = (tabs: WorkspaceTabs) => {
	const detach = watchFileMenu((action) => fileMenuActions[action](tabs)).catch(
		(reason: unknown) => {
			console.error("tabs: the File menu could not be listened to", reason)
			return undefined
		},
	)
	return () => {
		void detach.then((stop) => stop?.())
	}
}

export const useTabKeys = (tabs: WorkspaceTabs) => {
	useEffect(() => {
		if (!carriesNativeMenu()) {
			return
		}
		return watchFileMenuFor(tabs)
	}, [tabs])

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
