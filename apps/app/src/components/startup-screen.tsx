import { AppBootNotice } from "@workspace/ui/components/app-boot-notice"
import {
	type AppBootAgent,
	AppBootScreen,
} from "@workspace/ui/components/app-boot-screen"
import { useCommonCopy } from "@workspace/ui/hooks/use-common-copy"

import type { Bot } from "@/lib/bindings"
import { useWindowRevealOnMount } from "@/lib/host/use-window-reveal-on-mount"

type StartupScreenProps = {
	agents: Bot[]
	hasFailed: boolean
	isExiting: boolean
	onExitComplete: () => void
	onRetry: () => void
}

const launchAgentOf = ({ id, name, avatarBlot }: Bot): AppBootAgent => ({
	id,
	name,
	hue: avatarBlot,
})

export const StartupScreen = ({
	agents,
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
			agents={agents.map(launchAgentOf)}
			data-tauri-drag-region="deep"
			isExiting={isExiting}
			onExitComplete={onExitComplete}
		/>
	)
}
