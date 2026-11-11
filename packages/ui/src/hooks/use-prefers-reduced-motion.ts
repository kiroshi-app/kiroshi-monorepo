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

const prefersReducedMotion = () => reducedMotionQuery().matches

export const usePrefersReducedMotion = () =>
	useSyncExternalStore(subscribe, prefersReducedMotion, () => false)
