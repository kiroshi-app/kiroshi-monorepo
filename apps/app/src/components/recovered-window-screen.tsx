import { NoticeSurface } from "@workspace/ui/components/notice-surface"
import { WindowRecoveryScreen } from "@workspace/ui/components/window-recovery-screen"

import { useWindowRevealOnMount } from "@/lib/host/launch-reveal"
import { useRecoveredWindowReload } from "@/lib/host/use-recovered-window-reload"
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
	const reloadWindow = useRecoveredWindowReload()

	return (
		<>
			{reason === "gave-up" ? (
				<WindowRecoveryScreen onReload={reloadWindow} reason={reason} />
			) : (
				<WindowRecoveryScreen onContinue={onContinue} reason={reason} />
			)}
			<NoticeSurface />
		</>
	)
}
