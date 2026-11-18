import { WindowRecoveryScreen } from "@workspace/ui/components/window-recovery-screen"

import { useWindowRevealOnMount } from "@/lib/host/launch-reveal"
import type { RecoveryScreenReason } from "@/lib/host/window-recovery"

type RecoveredWindowScreenProps = {
	reason: RecoveryScreenReason
	onContinue: () => void
}

export const RecoveredWindowScreen = ({
	reason,
	onContinue,
}: RecoveredWindowScreenProps) => {
	useWindowRevealOnMount()

	return <WindowRecoveryScreen onContinue={onContinue} reason={reason} />
}
