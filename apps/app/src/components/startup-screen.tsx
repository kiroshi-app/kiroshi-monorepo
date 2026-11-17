import { AppBootNotice } from "@workspace/ui/components/app-boot-notice"
import { AppBootScreen } from "@workspace/ui/components/app-boot-screen"
import { useCommonCopy } from "@workspace/ui/hooks/use-common-copy"

import { useWindowRevealOnMount } from "@/lib/host/launch-reveal"

type StartupScreenProps = {
	hasFailed: boolean
	isExiting: boolean
	onExitComplete: () => void
	onRetry: () => void
}

export const StartupScreen = ({
	hasFailed,
	isExiting,
	onExitComplete,
	onRetry,
}: StartupScreenProps) => {
	const t = useCommonCopy()
	useWindowRevealOnMount()

	if (hasFailed && !isExiting) {
		return (
			<AppBootNotice
				description={t("spaces.unavailable.description")}
				onRetry={onRetry}
				title={t("spaces.unavailable.title")}
			/>
		)
	}

	return (
		<AppBootScreen
			data-tauri-drag-region="deep"
			isExiting={isExiting}
			onExitComplete={onExitComplete}
		/>
	)
}
