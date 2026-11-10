import { createStore } from "@/lib/store"

export type HomeEntries = {
	enter: () => void
	followWindowReturns: () => () => void
	getState: () => number
	subscribe: (listener: () => void) => () => void
}

export const createHomeEntries = (): HomeEntries => {
	const entries = createStore(0)
	const enter = () => entries.setState(entries.getState() + 1)
	const enterOnReturn = () => {
		if (document.visibilityState === "visible") {
			enter()
		}
	}

	return {
		enter,
		followWindowReturns: () => {
			document.addEventListener("visibilitychange", enterOnReturn)
			return () =>
				document.removeEventListener("visibilitychange", enterOnReturn)
		},
		getState: entries.getState,
		subscribe: entries.subscribe,
	}
}
