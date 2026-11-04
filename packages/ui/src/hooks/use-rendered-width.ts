"use client"

import { useCallback, useRef, useSyncExternalStore } from "react"

const NO_OP = () => {}

const getServerSnapshot = () => null

export const useRenderedWidth = (element: HTMLElement | null) => {
	const renderedWidth = useRef<number | null>(null)

	const subscribe = useCallback(
		(onChange: () => void) => {
			if (!element) return NO_OP

			const observer = new ResizeObserver(() => {
				const next = Math.round(element.getBoundingClientRect().width)
				if (next === renderedWidth.current) return
				renderedWidth.current = next
				onChange()
			})
			observer.observe(element)

			return () => observer.disconnect()
		},
		[element],
	)

	const getSnapshot = useCallback(() => renderedWidth.current, [])

	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
