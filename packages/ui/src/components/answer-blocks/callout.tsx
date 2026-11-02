import type { ReactNode } from "react"

import { type Icon, Icons } from "@workspace/ui/components/icons"
import { cn } from "@workspace/ui/lib/utils"

type CalloutTone = "note" | "warning"

type CalloutProps = {
	tone: CalloutTone
	title: string
	children: ReactNode
	className?: string
}

type CalloutToneLook = {
	icon: Icon
	surface: string
	ink: string
}

const TONES: Record<CalloutTone, CalloutToneLook> = {
	note: {
		icon: Icons.Info,
		surface:
			"border-primary-strong/16 bg-primary-strong/5 dark:bg-primary-strong/8",
		ink: "text-primary-strong",
	},
	warning: {
		icon: Icons.Alert,
		surface: "border-warning/20 bg-warning/5 dark:bg-warning/8",
		ink: "text-warning",
	},
}

const Callout = ({ tone, title, children, className }: CalloutProps) => {
	const { icon: ToneIcon, surface, ink } = TONES[tone]

	return (
		<div
			role="note"
			data-slot="callout"
			data-tone={tone}
			className={cn(
				"flex w-full min-w-0 gap-3 rounded-control border p-3",
				surface,
				className,
			)}
		>
			<span
				aria-hidden="true"
				className={cn("flex h-6 w-5 shrink-0 items-center justify-center", ink)}
			>
				<ToneIcon className="size-4.5" />
			</span>
			<div className="flex min-w-0 flex-1 flex-col gap-0.5 text-reading leading-6 wrap-anywhere">
				<p className="font-semibold">{title}</p>
				<div className="text-muted-foreground">{children}</div>
			</div>
		</div>
	)
}

export { Callout, type CalloutProps, type CalloutTone }
