import { NoticeSurface } from "@workspace/ui/components/notice-surface"
import {
	type WindowRecoveryReason,
	WindowRecoveryScreen,
} from "@workspace/ui/components/window-recovery-screen"

import { useWindowRevealOnMount } from "@/lib/host/launch-reveal"
import { useRecoveredWindowReload } from "@/lib/host/use-recovered-window-reload"

type RecoveredWindowScreenProps = {
	reason: WindowRecoveryReason
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
