import { revealWindow } from "./index"

const LATE_REVEAL_MS = 3000

const reportRevealFailure = (reason: unknown) => {
	console.error("reveal at start failed", reason)
}

const showWindow = () => {
	try {
		revealWindow().catch(reportRevealFailure)
	} catch (reason) {
		reportRevealFailure(reason)
	}
}

let hasShownWindow = false
let disarmSafetyNet = () => {}

export const showLaunchedWindowOnce = () => {
	if (hasShownWindow) {
		return
	}
	hasShownWindow = true
	disarmSafetyNet()
	showWindow()
}

const showWindowLate = () => {
	console.error(
		`the startup screen did not show the window within ${LATE_REVEAL_MS} ms of the launch, showing it anyway`,
	)
	showLaunchedWindowOnce()
}

export const armLaunchRevealSafetyNet = () => {
	disarmSafetyNet()
	hasShownWindow = false
	const lateReveal = setTimeout(showWindowLate, LATE_REVEAL_MS)
	window.addEventListener("error", showLaunchedWindowOnce)
	window.addEventListener("unhandledrejection", showLaunchedWindowOnce)
	disarmSafetyNet = () => {
		clearTimeout(lateReveal)
		window.removeEventListener("error", showLaunchedWindowOnce)
		window.removeEventListener("unhandledrejection", showLaunchedWindowOnce)
	}
}
