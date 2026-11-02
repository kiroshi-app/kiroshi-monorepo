import { useEffect, useRef } from "react"

import { isTypingTarget } from "@workspace/ui/lib/typing-target"

const NEXT = 1

const PREVIOUS = -1

const CONTROLS_THAT_KEEP_THEIR_KEYS =
	'button, a[href], [role="button"], [role="link"], [role="tab"], [role="switch"]'

export type SearchKeys = {
	isOpen: boolean
	onOpen: () => void
	onMove: (by: number) => void
	onEnter: () => void
}

type SearchKeyPress = (keys: SearchKeys) => void

const OPEN_PALETTE: SearchKeyPress = ({ onOpen }) => onOpen()

const KEEP_THE_CHORD: SearchKeyPress = () => undefined

const PRESS_BY_KEY = new Map<string, SearchKeyPress>([
	["ArrowDown", ({ onMove }) => onMove(NEXT)],
	["ArrowUp", ({ onMove }) => onMove(PREVIOUS)],
	["Enter", ({ onEnter }) => onEnter()],
])

const isOpeningChord = (event: KeyboardEvent) =>
	event.metaKey && event.key.toLowerCase() === "k"

const keepsItsOwnKeys = (target: EventTarget | null) =>
	target instanceof Element && target.matches(CONTROLS_THAT_KEEP_THEIR_KEYS)

const pressOf = (
	event: KeyboardEvent,
	isOpen: boolean,
): SearchKeyPress | undefined => {
	if (isOpeningChord(event)) {
		if (isOpen) return KEEP_THE_CHORD
		return isTypingTarget(event.target) ? undefined : OPEN_PALETTE
	}

	if (!isOpen) {
		return undefined
	}

	return keepsItsOwnKeys(event.target) ? undefined : PRESS_BY_KEY.get(event.key)
}

export const useSearchKeys = (keys: SearchKeys) => {
	const reach = useRef(keys)
	reach.current = keys

	useEffect(() => {
		const press = (event: KeyboardEvent) => {
			if (event.isComposing) return

			const held = reach.current
			const pressed = pressOf(event, held.isOpen)
			if (!pressed) {
				return
			}

			event.preventDefault()
			pressed(held)
		}

		window.addEventListener("keydown", press, true)
		return () => window.removeEventListener("keydown", press, true)
	}, [])
}
