import { useTranslation } from "react-i18next"

import {
	FullWindowContent,
	FullWindowLayout,
} from "@workspace/ui/components/full-window-layout"
import { HexagonRing } from "@workspace/ui/components/hexagon-ring"
import { Button } from "@workspace/ui/components/ui/button"

type WindowRecoveryScreenProps =
	| { reason: "out-of-memory" | "crash"; onContinue: () => void }
	| { reason: "gave-up"; onReload: () => void }

type WindowRecoveryReason = WindowRecoveryScreenProps["reason"]

const COPY_KEY = {
	"out-of-memory": "outOfMemory",
	crash: "crash",
	"gave-up": "gaveUp",
} as const satisfies Record<WindowRecoveryReason, string>

const WindowRecoveryScreen = (props: WindowRecoveryScreenProps) => {
	const { t } = useTranslation("common")
	const copy = COPY_KEY[props.reason]
	const hasGivenUp = props.reason === "gave-up"

	return (
		<FullWindowLayout
			data-slot="window-recovery-screen"
			data-tauri-drag-region="deep"
		>
			<FullWindowContent className="gap-5 p-6">
				<HexagonRing
					className="size-24"
					label={hasGivenUp ? t("windowRecovery.brand") : undefined}
				/>
				<div className="flex w-full max-w-105 flex-col gap-2 text-center">
					<h1 className="text-balance font-semibold text-[22px] text-foreground leading-7 tracking-[-0.01em]">
						{t(`windowRecovery.${copy}.title`)}
					</h1>
					<p className="text-pretty text-muted-foreground text-sm">
						{t(`windowRecovery.${copy}.description`)}
					</p>
				</div>
				<Button
					size="lg"
					autoFocus
					data-tauri-drag-region="false"
					onClick={hasGivenUp ? props.onReload : props.onContinue}
				>
					{t(`windowRecovery.${copy}.action`)}
				</Button>
			</FullWindowContent>
		</FullWindowLayout>
	)
}

export { type WindowRecoveryReason, WindowRecoveryScreen }
