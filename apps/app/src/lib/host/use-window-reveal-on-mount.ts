import { useEffect } from "react"

import { revealWindow } from "./index"

const reportRevealFailure = (reason: unknown) => {
	console.error("reveal at start failed", reason)
}

const revealStartedWindow = () => {
	try {
		revealWindow().catch(reportRevealFailure)
	} catch (reason) {
		reportRevealFailure(reason)
	}
}

export const useWindowRevealOnMount = () => {
	useEffect(revealStartedWindow, [])
}
