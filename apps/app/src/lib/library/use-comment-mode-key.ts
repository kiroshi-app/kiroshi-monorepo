import { useEffect, useEffectEvent } from "react"

import { isTypingTarget } from "@workspace/ui/lib/typing-target"

const COMMENT_KEY = "c"

const isBareCommentKey = (event: KeyboardEvent) =>
	event.key.toLowerCase() === COMMENT_KEY &&
	!event.metaKey &&
	!event.ctrlKey &&
	!event.altKey &&
	!event.isComposing &&
	!event.repeat

export const useCommentModeKey = (isListening: boolean, toggle: () => void) => {
	const toggleNow = useEffectEvent(toggle)
	useEffect(() => {
		if (!isListening) {
			return
		}
		const press = (event: KeyboardEvent) => {
			if (!isBareCommentKey(event) || isTypingTarget(event.target)) {
				return
			}
			event.preventDefault()
			toggleNow()
		}
		window.addEventListener("keydown", press)
		return () => window.removeEventListener("keydown", press)
	}, [isListening])
}
