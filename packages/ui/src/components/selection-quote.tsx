"use client"

import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import { cn } from "@workspace/ui/lib/utils"

export interface SelectionQuoteProps {
	agentName: string
	text: string
	onRemove: () => void
	className?: string
}

export const SelectionQuote = ({
	agentName,
	text,
	onRemove,
	className,
}: SelectionQuoteProps) => {
	const { t } = useTranslation("chat")

	return (
		<div
			role="group"
			aria-label={t("selectionQuote.group", { name: agentName })}
			data-slot="selection-quote"
			className={cn(
				"flex items-center gap-2 rounded-control border border-foreground/10 bg-background p-2 dark:bg-foreground/4",
				className,
			)}
		>
			<span
				aria-hidden="true"
				className="flex size-8 shrink-0 items-center justify-center rounded-md bg-foreground/8 text-muted-foreground"
			>
				<Icons.Quote className="size-4" />
			</span>
			<div className="flex min-w-0 flex-1 flex-col">
				<span className="truncate font-medium text-muted-foreground text-xs leading-4">
					{t("selectionQuote.label", { name: agentName })}
				</span>
				<span
					data-slot="selection-quote-text"
					className="line-clamp-2 wrap-break-word text-compact text-foreground leading-4.5"
				>
					{text}
				</span>
			</div>
			<button
				type="button"
				aria-label={t("selectionQuote.remove")}
				onClick={onRemove}
				className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-offset-2"
			>
				<Icons.Close aria-hidden="true" className="size-3" />
			</button>
		</div>
	)
}
