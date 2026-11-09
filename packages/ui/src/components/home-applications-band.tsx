"use client"

import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import { ApplicationMark } from "@workspace/ui/components/plugin-settings/application-mark"
import { Button } from "@workspace/ui/components/ui/button"

const SHOWN_MARKS = 5

type HomeApplicationsBandProps = {
	agentName: string
	marks: string[]
	onDismiss: () => void
}

const HomeApplicationsBand = ({
	agentName,
	marks,
	onDismiss,
}: HomeApplicationsBandProps) => {
	const { t } = useTranslation("chat")

	return (
		<div
			className="flex items-center gap-3 p-3"
			data-slot="home-applications-band"
		>
			<p className="min-w-0 grow basis-0 text-compact text-muted-foreground leading-4">
				{t("home.band.connect", { name: agentName })}
			</p>
			<span aria-hidden="true" className="flex shrink-0 items-center gap-1">
				{marks.slice(0, SHOWN_MARKS).map((mark) => (
					<ApplicationMark key={mark} mark={mark} size="xs" />
				))}
			</span>
			<Button
				aria-label={t("home.band.dismiss")}
				className="relative size-5 rounded-sm text-faint-foreground transition-none after:absolute after:-inset-0.5 [&_svg:not([class*='size-'])]:size-3.5"
				onClick={onDismiss}
				size="icon-xs"
				variant="ghost"
			>
				<Icons.Close />
			</Button>
		</div>
	)
}

export { HomeApplicationsBand, type HomeApplicationsBandProps }
