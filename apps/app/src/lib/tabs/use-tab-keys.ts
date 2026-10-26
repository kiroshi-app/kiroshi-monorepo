import { useEffect } from "react"

import type { WorkspaceTabs } from "./workspace-tabs"

import { usesCommandKey } from "../host"

type TabKeyPress = (tabs: WorkspaceTabs) => void

const PRESS_BY_KEY = new Map<string, TabKeyPress>([
	["t", (tabs) => tabs.openEmptyTab()],
	["w", (tabs) => tabs.closeActive()],
])

const isModOnly = (event: KeyboardEvent) => {
	const isModHeld = usesCommandKey() ? event.metaKey : event.ctrlKey
	const isOtherModHeld = usesCommandKey() ? event.ctrlKey : event.metaKey
	return isModHeld && !isOtherModHeld && !event.altKey && !event.shiftKey
}

const pressOf = (event: KeyboardEvent) =>
	event.isComposing || !isModOnly(event)
		? undefined
		: PRESS_BY_KEY.get(event.key.toLowerCase())

export const useTabKeys = (tabs: WorkspaceTabs) => {
	useEffect(() => {
		const press = (event: KeyboardEvent) => {
			const pressed = pressOf(event)
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
