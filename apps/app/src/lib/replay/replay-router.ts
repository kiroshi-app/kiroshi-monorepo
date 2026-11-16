import type { AnyRouter } from "@tanstack/react-router"

export const recordAnnouncedRouters = () => {
	const announced: AnyRouter[] = []
	let latest = window.__TSR_ROUTER__
	const announce = (router: AnyRouter | undefined) => {
		latest = router
		if (router) {
			announced.push(router)
		}
	}
	announce(latest)
	Object.defineProperty(window, "__TSR_ROUTER__", {
		configurable: true,
		get: () => latest,
		set: announce,
	})
	return () =>
		announced.findLast((router) => router.state.resolvedLocation !== undefined)
}
