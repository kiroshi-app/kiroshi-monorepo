import type { WindowRecoveryReason } from "@workspace/ui/components/window-recovery-screen"

import {
	commands,
	type WindowDeathReason,
	type WindowRecovery,
} from "@/lib/bindings"

const SHOWN_RECOVERY_KEY = "shownWindowRecoveryAtMs"

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

const hasBeenShown = (recovery: WindowRecovery) =>
	localStorage.getItem(SHOWN_RECOVERY_KEY) === String(recovery.occurredAtMs)

const recordAsShown = (recovery: WindowRecovery) => {
	localStorage.setItem(SHOWN_RECOVERY_KEY, String(recovery.occurredAtMs))
}

export const readWindowRecoveryToShow = async () => {
	try {
		const recovery = await commands.windowRecoveryRead()
		if (!recovery || hasBeenShown(recovery)) {
			return null
		}
		recordAsShown(recovery)
		return recovery
	} catch (reason) {
		console.error("window recovery read at start failed", reason)
		return null
	}
}
