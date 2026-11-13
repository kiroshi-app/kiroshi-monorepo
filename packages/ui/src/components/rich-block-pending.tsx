"use client"

import { useTranslation } from "react-i18next"

import { ConversationIcons } from "@workspace/ui/components/icons"
import { ShimmerText } from "@workspace/ui/components/motion/shimmer-text"
import { cn } from "@workspace/ui/lib/utils"

type RichBlockPendingProps = {
	title: string
	className?: string
}

const FIELD_WIDTHS = ["w-24", "w-18", "w-30"] as const

const RichBlockPending = ({ title, className }: RichBlockPendingProps) => {
	const { t } = useTranslation("chat")

	return (
		<section
			data-slot="rich-block-pending"
			aria-busy="true"
			aria-label={title}
			className={cn(
				"not-typeset flex w-full flex-col overflow-hidden rounded-control border border-foreground/10",
				className,
			)}
		>
			<header className="flex h-11 items-center gap-2.5 border-foreground/10 border-b px-3">
				<span className="flex size-5 shrink-0 items-center justify-center rounded-sm bg-primary/15 text-primary">
					<ConversationIcons.ChartLine aria-hidden="true" className="size-3" />
				</span>
				<span className="truncate font-semibold text-foreground text-sm">
					{title}
				</span>
				<ShimmerText className="truncate text-compact">
					{t("richBlock.building")}
				</ShimmerText>
			</header>
			<div
				aria-hidden="true"
				className="grid grid-cols-[minmax(0,1fr)_minmax(0,236px)] gap-5 p-3"
			>
				<div className="flex flex-col gap-10 pt-1">
					{FIELD_WIDTHS.map((width) => (
						<span key={width} className="flex flex-col gap-3">
							<span
								className={cn("h-2.5 rounded-full bg-foreground/8", width)}
							/>
							<span className="h-1 w-full rounded-full bg-foreground/8" />
						</span>
					))}
				</div>
				<div className="flex min-h-50 flex-col gap-3 rounded-control bg-foreground/4 p-3">
					<span className="h-2.5 w-27 rounded-full bg-foreground/8" />
					<span className="h-7 w-37 rounded-lg bg-foreground/8" />
					<span className="mt-1 h-1.5 w-full rounded-full bg-foreground/8" />
					<span className="h-1.5 w-42 rounded-full bg-foreground/8" />
				</div>
			</div>
		</section>
	)
}

export { RichBlockPending, type RichBlockPendingProps }
