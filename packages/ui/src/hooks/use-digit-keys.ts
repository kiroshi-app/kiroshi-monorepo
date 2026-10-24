import { type RefObject, useEffect, useRef } from "react"

import { isTypingTarget } from "@workspace/ui/lib/typing-target"

export const DIGIT_KEY_LIMIT = 9

const DIGIT_CODE = /^(?:Digit|Numpad)([1-9])$/

const OVERLAY = "[aria-modal='true'], [role='menu']"

const digitOf = ({ code, metaKey, ctrlKey, altKey }: KeyboardEvent) => {
	if (metaKey || ctrlKey || altKey) return 0
	return Number(DIGIT_CODE.exec(code)?.[1] ?? 0)
}

const isInOverlayAbove = (target: EventTarget | null, surface: Node | null) => {
	const overlay = target instanceof Element ? target.closest(OVERLAY) : null
	return overlay !== null && !overlay.contains(surface)
}

type DigitKeys = {
	count: number
	surface: RefObject<HTMLElement | null>
	onDigit: (digit: number) => void
}

export const useDigitKeys = ({ count, surface, onDigit }: DigitKeys) => {
	const reach = useRef(onDigit)
	reach.current = onDigit

	useEffect(() => {
		if (count === 0) return

		const pick = (event: KeyboardEvent) => {
			const digit = digitOf(event)
			if (digit === 0 || digit > count || event.repeat) return
			if (isTypingTarget(event.target)) return
			if (isInOverlayAbove(event.target, surface.current)) return
			event.preventDefault()
			reach.current(digit)
		}

		window.addEventListener("keydown", pick, true)
		return () => window.removeEventListener("keydown", pick, true)
	}, [count, surface])
}
