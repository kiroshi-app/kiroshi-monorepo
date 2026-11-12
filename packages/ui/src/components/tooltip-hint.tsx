"use client"

import type { ReactElement, ReactNode } from "react"

import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@workspace/ui/components/ui/tooltip"
import { cn } from "@workspace/ui/lib/utils"

const HOVER_INTENT_DELAY_MS = 120

const STILL_UNDER_REDUCED_MOTION = "motion-reduce:animate-none!"

type TooltipHintSide = "top" | "right" | "bottom" | "left"

type TooltipHintProps = {
	content: ReactNode
	children: ReactElement
	side?: TooltipHintSide
}

const TooltipHint = ({ content, children, side = "top" }: TooltipHintProps) => (
	<Tooltip>
		<TooltipTrigger delay={HOVER_INTENT_DELAY_MS} render={children} />
		{content ? (
			<TooltipContent
				className={cn("break-words", STILL_UNDER_REDUCED_MOTION)}
				role="tooltip"
				side={side}
			>
				{content}
			</TooltipContent>
		) : null}
	</Tooltip>
)

type TooltipHintProviderProps = {
	children: ReactNode
}

const TooltipHintProvider = ({ children }: TooltipHintProviderProps) => (
	<TooltipProvider delay={HOVER_INTENT_DELAY_MS}>{children}</TooltipProvider>
)

export {
	HOVER_INTENT_DELAY_MS,
	TooltipHint,
	TooltipHintProvider,
	type TooltipHintSide,
}
