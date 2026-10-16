"use client"

import { useCallback, useState } from "react"

export const useOverflowsParent = () => {
	const [overflows, setOverflows] = useState(false)

	const contentRef = useCallback((content: HTMLElement | null) => {
		const box = content?.parentElement
		if (!content || !box) return

		const observer = new ResizeObserver(() =>
			setOverflows(content.offsetHeight > box.clientHeight),
		)
		observer.observe(content)
		observer.observe(box)

		return () => observer.disconnect()
	}, [])

	return { overflows, contentRef }
}
