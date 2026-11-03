"use client"

import type { KeyboardEvent, ReactNode, SyntheticEvent } from "react"

import { selectedTextWithin } from "@workspace/ui/components/message-selection"
import { cn } from "@workspace/ui/lib/utils"

export interface QuotableAnswerProps {
	children: ReactNode
	onQuote: (text: string) => void
	className?: string
}

export const QuotableAnswer = ({
	children,
	onQuote,
	className,
}: QuotableAnswerProps) => {
	const quoteSelection = (event: SyntheticEvent<HTMLDivElement>) => {
		const text = selectedTextWithin(event.currentTarget)
		if (text) onQuote(text)
	}

	const quoteOnShiftRelease = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key === "Shift") quoteSelection(event)
	}

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: the listeners only read a text selection the browser already grants
		<div
			data-slot="quotable-answer"
			onPointerUp={quoteSelection}
			onKeyUp={quoteOnShiftRelease}
			className={cn("selection:bg-primary/30", className)}
		>
			{children}
		</div>
	)
}
