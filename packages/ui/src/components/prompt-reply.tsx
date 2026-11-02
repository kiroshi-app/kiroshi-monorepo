"use client"

import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import {
	MessageQuote,
	type QuotedMessage,
} from "@workspace/ui/components/message-quote"
import { Button } from "@workspace/ui/components/ui/button"
import { cn } from "@workspace/ui/lib/utils"

export interface ReplyQuote extends QuotedMessage {
	onDismiss: () => void
}

export interface PromptReplyProps {
	quote?: ReplyQuote
	children: ReactNode
	className?: string
}

export function PromptReply({ quote, children, className }: PromptReplyProps) {
	const { t } = useTranslation("chat")

	return (
		<MessageQuote
			author={quote?.author}
			excerpt={quote?.excerpt}
			from={quote?.from}
			onJump={quote?.onJump}
			size="md"
			className={cn("w-full", quote && "rounded-[29px]", className)}
			trailing={
				quote ? (
					<Button
						type="button"
						variant="ghost"
						size="icon"
						aria-label={t("reply.dismiss")}
						onClick={quote.onDismiss}
						className="size-8 rounded-full text-muted-foreground hover:text-foreground"
					>
						<Icons.Close />
					</Button>
				) : undefined
			}
		>
			{children}
		</MessageQuote>
	)
}
