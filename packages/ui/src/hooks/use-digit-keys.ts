import { useEffect, useRef } from "react"

import { isTypingTarget } from "@workspace/ui/lib/typing-target"

export const DIGIT_KEY_LIMIT = 9

const bareDigitOf = ({
	key,
	metaKey,
	ctrlKey,
	altKey,
	shiftKey,
}: KeyboardEvent) => {
	if (metaKey || ctrlKey || altKey || shiftKey) return 0
	const digit = Number(key)
	if (!Number.isInteger(digit)) return 0
	return digit >= 1 && digit <= DIGIT_KEY_LIMIT ? digit : 0
}

type DigitKeys = {
	count: number
	onDigit: (digit: number) => void
}

export const useDigitKeys = ({ count, onDigit }: DigitKeys) => {
	const reach = useRef(onDigit)
	reach.current = onDigit

	useEffect(() => {
		if (count === 0) return

		const pick = (event: KeyboardEvent) => {
			const digit = bareDigitOf(event)
			if (digit === 0 || digit > count || isTypingTarget(event.target)) return
			event.preventDefault()
			reach.current(digit)
		}

		window.addEventListener("keydown", pick, true)
		return () => window.removeEventListener("keydown", pick, true)
	}, [count])
}
