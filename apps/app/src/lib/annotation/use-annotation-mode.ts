import { useSyncExternalStore } from "react"

const TOOLBAR_HOST = "agentation-toolbar"

const CONTROLS_GROUP = '[role="group"][aria-label="Feedback controls"]'

const CONTROLS_CHANGES: MutationObserverInit = {
	subtree: true,
	childList: true,
	attributeFilter: ["aria-hidden"],
}

const findToolbarRoot = () =>
	document.querySelector(TOOLBAR_HOST)?.shadowRoot ?? null

const isAnnotationActive = () =>
	findToolbarRoot()
		?.querySelector(CONTROLS_GROUP)
		?.getAttribute("aria-hidden") === "false"

const subscribeToAnnotationMode = (onChange: () => void) => {
	const controlsObserver = new MutationObserver(onChange)
	let watchedRoot: ShadowRoot | null = null

	const watchToolbarRoot = () => {
		if (watchedRoot?.host.isConnected) return

		controlsObserver.disconnect()
		watchedRoot = findToolbarRoot()
		if (watchedRoot) {
			controlsObserver.observe(watchedRoot, CONTROLS_CHANGES)
		}
		onChange()
	}

	const pageObserver = new MutationObserver(watchToolbarRoot)
	pageObserver.observe(document.body, { childList: true, subtree: true })
	watchToolbarRoot()

	return () => {
		pageObserver.disconnect()
		controlsObserver.disconnect()
	}
}

export const useAnnotationMode = () =>
	useSyncExternalStore(subscribeToAnnotationMode, isAnnotationActive)
