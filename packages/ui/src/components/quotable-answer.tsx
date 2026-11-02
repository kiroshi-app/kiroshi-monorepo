"use client"

import type { KeyboardEvent, ReactNode, SyntheticEvent } from "react"

import { cn } from "@workspace/ui/lib/utils"

export interface QuotableAnswerProps {
	children: ReactNode
	onQuote: (text: string) => void
	className?: string
}

const selectedTextWithin = (root: HTMLElement) => {
	const selection = root.ownerDocument.getSelection()
	if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
		return ""
	}

	const range = selection.getRangeAt(0)
	if (
		!root.contains(range.startContainer) ||
		!root.contains(range.endContainer)
	) {
		return ""
	}

	return selection.toString().trim()
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
