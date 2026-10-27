import { useEffect } from "react"

import type { SidebarClickModifiers } from "@workspace/ui/components/sidebar-menu-row"

import type { WorkspaceTabs } from "./workspace-tabs"

import { usesCommandKey } from "../host"
import { anchorOf, inAppHrefOf } from "../links/use-external-links"

type NewTabModifiers = Pick<SidebarClickModifiers, "meta" | "ctrl" | "middle">

const PRIMARY_BUTTON = 0

const MIDDLE_BUTTON = 1

const NEW_TAB_CLICKS = ["click", "auxclick"] as const

let clickInFlight: MouseEvent | null = null

export const opensInNewTab = (modifiers: NewTabModifiers | undefined) => {
	if (!modifiers) {
		return false
	}
	const isModHeld = usesCommandKey() ? modifiers.meta : modifiers.ctrl
	return modifiers.middle || isModHeld
}

const isPointerClick = (event: MouseEvent) =>
	event.detail > 0 &&
	(event.button === PRIMARY_BUTTON || event.button === MIDDLE_BUTTON)

const isNewTabClick = (event: MouseEvent) =>
	isPointerClick(event) &&
	opensInNewTab({
		meta: event.metaKey,
		ctrl: event.ctrlKey,
		middle: event.button === MIDDLE_BUTTON,
	})

const isDispatching = (event: Event) => event.eventPhase !== Event.NONE

export const isNewTabClickInFlight = () =>
	clickInFlight !== null &&
	isDispatching(clickInFlight) &&
	isNewTabClick(clickInFlight)

const watchNewTabClicks = (openInNewTab: (href: string) => void) => {
	const interceptNewTabClick = (event: MouseEvent) => {
		clickInFlight = event
		if (!isNewTabClick(event)) {
			return
		}
		const href = inAppHrefOf(
			anchorOf(event.target)?.getAttribute("href"),
			window.location.href,
		)
		if (href === null) {
			return
		}
		event.preventDefault()
		openInNewTab(href)
	}

	for (const type of NEW_TAB_CLICKS) {
		window.addEventListener(type, interceptNewTabClick, true)
	}
	return () => {
		for (const type of NEW_TAB_CLICKS) {
			window.removeEventListener(type, interceptNewTabClick, true)
		}
	}
}

export const useNewTabClicks = (tabs: Pick<WorkspaceTabs, "openInNewTab">) => {
	useEffect(() => watchNewTabClicks(tabs.openInNewTab), [tabs.openInNewTab])
}
