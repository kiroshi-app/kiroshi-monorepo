import { useSyncExternalStore } from "react"

import type { LiveHtmlRect } from "@workspace/ui/components/live-html-slot"

import { subscribeToOpenPopups } from "@/lib/annotation/use-topmost-open-popup"

const TOOLTIP_CONTENT = '[data-slot="tooltip-content"]'

const OPEN_APP_SURFACE = `[data-open]:is([role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [role="presentation"]:not(:has(${TOOLTIP_CONTENT}))), [data-slot$="mention-menu"] [role="listbox"]`

const OPEN_TOOLTIP = `[data-open][role="presentation"]:has(${TOOLTIP_CONTENT})`

const hasOpenAppSurface = () =>
	document.querySelector(OPEN_APP_SURFACE) !== null

const openTooltipRects = () =>
	Array.from(document.querySelectorAll(OPEN_TOOLTIP), (tooltip) =>
		tooltip.getBoundingClientRect(),
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

export const useIsAppSurfaceOpen = (
	isUnder: (surface: LiveHtmlRect) => boolean,
) =>
	useSyncExternalStore(
		subscribeToAppSurfaces,
		() =>
			hasOpenAppSurface() ||
			openTooltipRects().some((tooltip) => isUnder(tooltip)),
	)
