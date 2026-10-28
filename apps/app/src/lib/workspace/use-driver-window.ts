import { useEffect, useState } from "react"

import { currentWindowLabel, watchLiveWindows } from "../host"
import { MAIN_WINDOW_LABEL } from "../tabs/tabs-mirror"

const SECONDARY_WINDOW_LABEL = /^window-\d+$/

const firstSecondaryAmong = (labels: string[]): string | null =>
	labels.filter((label) => SECONDARY_WINDOW_LABEL.test(label)).sort()[0] ?? null

const drivingWindowAmong = (labels: string[]): string | null =>
	labels.includes(MAIN_WINDOW_LABEL)
		? MAIN_WINDOW_LABEL
		: firstSecondaryAmong(labels)

const logUnreadWindows = (reason: unknown) => {
	console.error("driver window: the open windows could not be read", reason)
}

export const useDriverWindow = (isMainWindow: boolean): boolean => {
	const [isTakingOver, setTakingOver] = useState(false)

	useEffect(() => {
		if (isMainWindow) {
			return
		}
		const watching = watchLiveWindows({
			report: (labels) =>
				setTakingOver(drivingWindowAmong(labels) === currentWindowLabel()),
			onError: logUnreadWindows,
		}).catch((reason: unknown) => {
			logUnreadWindows(reason)
			return () => undefined
		})
		return () => {
			void watching.then((stop) => stop())
		}
	}, [isMainWindow])

	return isMainWindow || isTakingOver
}
