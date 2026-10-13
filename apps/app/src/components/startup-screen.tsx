import { AppBootNotice } from "@workspace/ui/components/app-boot-notice"
import { AppBootScreen } from "@workspace/ui/components/app-boot-screen"
import { useCommonCopy } from "@workspace/ui/hooks/use-common-copy"

type StartupScreenProps = {
	hasFailed: boolean
	onRetry: () => void
}

export const StartupScreen = ({ hasFailed, onRetry }: StartupScreenProps) => {
	const t = useCommonCopy()

	if (hasFailed) {
		return (
			<AppBootNotice
				description={t("spaces.unavailable.description")}
				onRetry={onRetry}
				title={t("spaces.unavailable.title")}
			/>
		)
	}

	return <AppBootScreen data-tauri-drag-region="deep" />
}
