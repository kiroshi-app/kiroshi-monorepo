import { i18n } from "@workspace/ui/lib/i18n"

import { describeFailure, failureReporterIn } from "@/lib/failure-report"
import { watchWindowFocus } from "@/lib/host/index"
import { createStore } from "@/lib/store"

export type HomeEntries = {
	enter: () => void
	followWindowReturns: () => () => void
	getState: () => number
	subscribe: (listener: () => void) => () => void
}

const reportUnfollowedFocus = failureReporterIn("home-entries")

const raiseUnfollowedFocus = (reason: unknown) => {
	void reportUnfollowedFocus({
		title: i18n.t("bots:roster.previewUnreadable"),
		description: describeFailure(reason),
	})
}

export const createHomeEntries = (): HomeEntries => {
	const entries = createStore(0)
	const enter = () => entries.setState(entries.getState() + 1)

	const followWindowReturns = () => {
		let wasFocused: boolean | null = null
		const enterOnReturn = (isFocused: boolean) => {
			const hasReturned = wasFocused === false && isFocused
			wasFocused = isFocused
			if (hasReturned) {
				enter()
			}
		}
		const watch = watchWindowFocus(enterOnReturn).catch(raiseUnfollowedFocus)
		return () => {
			void watch.then((stop) => stop?.())
		}
	}

	return {
		enter,
		followWindowReturns,
		getState: entries.getState,
		subscribe: entries.subscribe,
	}
}
