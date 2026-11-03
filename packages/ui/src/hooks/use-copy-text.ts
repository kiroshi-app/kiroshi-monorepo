"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export const COPIED_RESET_MS = 1600

export function useCopyText(text: string, resetMs = COPIED_RESET_MS) {
	const [copied, setCopied] = useState(false)
	const timer = useRef<number | undefined>(undefined)

	useEffect(
		() => () => {
			window.clearTimeout(timer.current)
		},
		[],
	)

	const copy = useCallback(async () => {
		await navigator.clipboard.writeText(text)
		setCopied(true)
		window.clearTimeout(timer.current)
		timer.current = window.setTimeout(() => setCopied(false), resetMs)
	}, [resetMs, text])

	return { copied, copy }
}
