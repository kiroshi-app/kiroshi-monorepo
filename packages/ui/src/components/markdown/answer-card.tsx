import type { ReactNode } from "react"

import { IconSwap } from "@workspace/ui/components/icon-swap"
import { Icons } from "@workspace/ui/components/icons"
import { MARKDOWN_ESCAPED_BLOCK_CLASS } from "@workspace/ui/components/markdown/prose"
import { Button } from "@workspace/ui/components/ui/button"
import { cn } from "@workspace/ui/lib/utils"

type AnswerCardProps = {
	slot: string
	children: ReactNode
}

type AnswerCardLabelFont = "sans" | "mono"

type AnswerCardHeaderProps = {
	label?: string
	labelFont?: AnswerCardLabelFont
	children: ReactNode
}

type AnswerCardActionProps = {
	icon: ReactNode
	isDone?: boolean
	doneAnnouncement?: string
	name?: string
	onPress: () => void
	children: string
}

const ANSWER_CARD_CLASS = `${MARKDOWN_ESCAPED_BLOCK_CLASS} my-4 overflow-hidden rounded-[1rem] ring-1 ring-border`

const ANSWER_CARD_HEADER_CLASS =
	"flex h-10 items-center justify-between gap-2 border-answer-card-divider border-b ps-1.5 pe-1"

const ANSWER_CARD_LABEL_CLASS =
	"min-w-0 truncate ps-2 text-muted-foreground text-xs"

const AnswerCard = ({ slot, children }: AnswerCardProps) => (
	<div data-slot={slot} className={ANSWER_CARD_CLASS}>
		{children}
	</div>
)

const AnswerCardHeader = ({
	label,
	labelFont = "sans",
	children,
}: AnswerCardHeaderProps) => (
	<div
		data-slot="markdown-answer-card-header"
		className={ANSWER_CARD_HEADER_CLASS}
	>
		<span
			data-slot="markdown-answer-card-label"
			className={cn(
				ANSWER_CARD_LABEL_CLASS,
				labelFont === "mono" && "font-mono",
			)}
		>
			{label}
		</span>
		<span className="flex shrink-0 items-center">{children}</span>
	</div>
)

const AnswerCardAction = ({
	icon,
	isDone = false,
	doneAnnouncement,
	name,
	onPress,
	children,
}: AnswerCardActionProps) => (
	<>
		<Button aria-label={name} variant="ghost" size="xs" onClick={onPress}>
			<IconSwap
				icon={icon}
				isSwapped={isDone}
				swappedIcon={<Icons.Check className="size-3.5" />}
			/>
			{children}
		</Button>
		{doneAnnouncement ? (
			<span aria-live="polite" className="sr-only">
				{isDone ? doneAnnouncement : ""}
			</span>
		) : null}
	</>
)

export { AnswerCard, AnswerCardAction, AnswerCardHeader }
