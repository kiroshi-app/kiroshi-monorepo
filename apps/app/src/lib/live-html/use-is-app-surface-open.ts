import { useSyncExternalStore } from "react"

import type { LiveHtmlRect } from "@workspace/ui/components/live-html-slot"

import { subscribeToOpenPopups } from "@/lib/annotation/use-topmost-open-popup"

type IsUnder = (surface: LiveHtmlRect) => boolean

const TOOLTIP_CONTENT = '[data-slot="tooltip-content"]'

const OPEN_APP_SURFACE = `[data-open]:is([role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [role="presentation"]:not(:has(${TOOLTIP_CONTENT}))), [data-slot$="mention-menu"] [role="listbox"]`

const OPEN_TOOLTIP = `[data-open][role="presentation"]:has(${TOOLTIP_CONTENT})`

const hasOpenAppSurface = () =>
	document.querySelector(OPEN_APP_SURFACE) !== null

const hasOpenTooltipOver = (isUnder: IsUnder) =>
	Array.from(document.querySelectorAll(OPEN_TOOLTIP)).some((tooltip) =>
		isUnder(tooltip.getBoundingClientRect()),
	)

const subscribeToAppSurfaces = (onChange: () => void) => {
	let checkOncePositioned = 0
	const stopListening = subscribeToOpenPopups(() => {
		onChange()
		cancelAnimationFrame(checkOncePositioned)
		checkOncePositioned = requestAnimationFrame(onChange)
	})
	return () => {
		cancelAnimationFrame(checkOncePositioned)
		stopListening()
	}
}

export const useIsAppSurfaceOpen = (isUnder: IsUnder) =>
	useSyncExternalStore(
		subscribeToAppSurfaces,
		() => hasOpenAppSurface() || hasOpenTooltipOver(isUnder),
	)
