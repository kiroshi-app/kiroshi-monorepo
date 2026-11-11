"use client"

import { useSyncExternalStore } from "react"

const QUERY = "(prefers-reduced-motion: reduce)"

let media: MediaQueryList | null = null

const reducedMotionQuery = () => {
	if (media === null) media = window.matchMedia(QUERY)
	return media
}

const subscribe = (onChange: () => void) => {
	const query = reducedMotionQuery()
	query.addEventListener("change", onChange)
	return () => query.removeEventListener("change", onChange)
}

export const usePrefersReducedMotion = () =>
	useSyncExternalStore(
		subscribe,
		() => reducedMotionQuery().matches,
		() => false,
	)
