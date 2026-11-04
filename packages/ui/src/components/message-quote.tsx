"use client"

import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import type { MessageFrom } from "@workspace/ui/components/message"
import { Button } from "@workspace/ui/components/ui/button"
import { cn } from "@workspace/ui/lib/utils"

export interface QuotedMessage {
	author: string
	excerpt: string
	isExcerpt?: boolean
	from: MessageFrom
	onJump: () => void
}

const QUOTE_SURFACE = "bg-foreground/5 text-foreground"

const JUMP_BUTTON_RESET =
	"flex h-auto border-0 text-[length:inherit] font-[number:inherit] whitespace-normal select-auto text-inherit hover:no-underline focus-visible:ring-0 active:not-aria-[haspopup]:translate-none"

type MessageQuoteSize = "sm" | "md"

interface QuoteMetrics {
	body: string
	row: string
	glyphBox: string
	glyph: string
}

const QUOTE_SIZE = {
	sm: {
		body: "gap-1 p-1",
		row: "gap-1.5 pt-1 pr-1 pl-2.5",
		glyphBox: "",
		glyph: "size-3.5",
	},
	md: {
		body: "gap-1 p-1",
		row: "gap-3 px-[calc(0.5rem+1px)] py-2",
		glyphBox: "size-8",
		glyph: "size-4",
	},
} satisfies Record<MessageQuoteSize, QuoteMetrics>

export interface MessageQuoteProps extends Partial<QuotedMessage> {
	size?: MessageQuoteSize
	label?: string
	trailing?: ReactNode
	children?: ReactNode
	className?: string
}

export type MessageQuoteCardProps = Omit<QuotedMessage, "from">

export function MessageQuoteCard({
	author,
	excerpt,
	isExcerpt,
	onJump,
}: MessageQuoteCardProps) {
	const { t } = useTranslation("chat")
	const shown = isExcerpt ? t("reply.excerpt", { excerpt }) : excerpt

	return (
		<Button
			type="button"
			variant="link"
			data-slot="message-quote-jump"
			aria-label={t("reply.jump", { author, excerpt: shown })}
			onClick={onJump}
			className={cn(
				JUMP_BUTTON_RESET,
				"w-full min-w-0 shrink gap-2 rounded-[10px] bg-foreground/8 p-2 text-start outline-offset-2 transition-none focus-visible:[outline-style:auto]",
			)}
		>
			<Icons.Reply
				aria-hidden="true"
				className="size-3.5 shrink-0 opacity-70"
			/>
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="truncate font-semibold text-xs leading-4">
					{author}
				</span>
				<span className="truncate text-xs leading-4">{shown}</span>
			</span>
		</Button>
	)
}

export function MessageQuote({
	author,
	excerpt,
	from,
	onJump,
	size = "sm",
	label,
	trailing,
	children,
	className,
}: MessageQuoteProps) {
	const { t } = useTranslation("chat")
	const metrics = QUOTE_SIZE[size]
	const quoted = author !== undefined && from !== undefined
	const grouping = quoted
		? {
				role: "group" as const,
				"aria-label": label ?? t("reply.label", { author }),
			}
		: undefined

	return (
		<div
			{...grouping}
			data-slot="message-quote"
			data-from={from}
			data-size={size}
			className={cn(
				quoted && "w-fit max-w-full rounded-3xl",
				quoted && QUOTE_SURFACE,
				className,
			)}
		>
			<div
				className={cn(
					"flex flex-col",
					quoted && ["rounded-[inherit]", metrics.body],
				)}
			>
				{quoted ? (
					<div className={cn("flex items-center", metrics.row)}>
						<span
							className={cn(
								"flex shrink-0 items-center justify-center",
								metrics.glyphBox,
							)}
						>
							<Icons.Reply
								aria-hidden="true"
								className={cn("opacity-70", metrics.glyph)}
							/>
						</span>
						<Button
							type="button"
							variant="link"
							data-slot="message-quote-jump"
							onClick={onJump}
							className={cn(
								JUMP_BUTTON_RESET,
								"min-w-0 flex-1 flex-col items-start gap-0 rounded-md p-0 text-left transition-opacity hover:opacity-70 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-current motion-reduce:transition-none",
							)}
						>
							<span className="w-full truncate font-semibold text-xs leading-4">
								{author}
							</span>
							<span className="w-full truncate text-muted-foreground text-xs leading-4">
								{excerpt}
							</span>
						</Button>
						{trailing}
					</div>
				) : null}
				{children}
			</div>
		</div>
	)
}
