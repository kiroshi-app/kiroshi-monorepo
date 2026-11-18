import type { WindowRecoveryReason } from "@workspace/ui/components/window-recovery-screen"

import {
	commands,
	type WindowDeathReason,
	type WindowRecovery,
} from "@/lib/bindings"

const DISMISSED_RECOVERY_KEY = "dismissedWindowRecoveryAtMs"

const SCREEN_REASON = {
	outOfMemory: "out-of-memory",
	crashed: "crash",
	killed: "crash",
	unresponsive: "crash",
	unknown: "crash",
} as const satisfies Record<WindowDeathReason, WindowRecoveryReason>

export type RecoveryScreenReason = (typeof SCREEN_REASON)[WindowDeathReason]

export const recoveryScreenReasonOf = (
	recovery: WindowRecovery | null,
): RecoveryScreenReason | null =>
	recovery ? SCREEN_REASON[recovery.reason] : null

const isDismissed = (recovery: WindowRecovery) =>
	localStorage.getItem(DISMISSED_RECOVERY_KEY) === String(recovery.occurredAtMs)

export const dismissWindowRecovery = (recovery: WindowRecovery) => {
	localStorage.setItem(DISMISSED_RECOVERY_KEY, String(recovery.occurredAtMs))
}

const undismissed = (recovery: WindowRecovery | null) =>
	recovery && !isDismissed(recovery) ? recovery : null

export const readWindowRecoveryToShow = async () => {
	try {
		return undismissed(await commands.windowRecoveryRead())
	} catch (reason) {
		console.error("window recovery read at start failed", reason)
		return null
	}
}
