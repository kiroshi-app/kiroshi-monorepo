import { useSyncExternalStore } from "react"

const OPEN_POPUP = '[role="dialog"][data-open], [role="alertdialog"][data-open]'

const POPUP_CHANGES: MutationObserverInit = {
	subtree: true,
	childList: true,
	attributeFilter: ["data-open"],
}

const findTopmostOpenPopup = () =>
	Array.from(document.querySelectorAll<HTMLElement>(OPEN_POPUP)).at(-1) ?? null

const subscribeToOpenPopups = (onChange: () => void) => {
	const popupObserver = new MutationObserver(onChange)
	popupObserver.observe(document.body, POPUP_CHANGES)
	return () => popupObserver.disconnect()
}

export const useTopmostOpenPopup = () =>
	useSyncExternalStore(subscribeToOpenPopups, findTopmostOpenPopup)
