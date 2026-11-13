"use client"

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"
import {
	createContext,
	type ReactElement,
	type ReactNode,
	useContext,
	useState,
} from "react"

import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@workspace/ui/components/ui/tooltip"
import { cn } from "@workspace/ui/lib/utils"

const HOVER_INTENT_DELAY_MS = 120

const HINT_CLOSE_GRACE_MS = 80

const STILL_UNDER_REDUCED_MOTION = "motion-reduce:animate-none!"

const BUBBLE = cn("break-words", STILL_UNDER_REDUCED_MOTION)

type TooltipHintSide = "top" | "right" | "bottom" | "left"

type SharedBubble = {
	content: ReactNode
	side: TooltipHintSide
}

const SharedBubbleContext = createContext<
	TooltipPrimitive.Handle<SharedBubble> | undefined
>(undefined)

type TooltipHintProps = {
	content: ReactNode
	children: ReactElement
	side?: TooltipHintSide
}

const TooltipHint = ({ content, children, side = "top" }: TooltipHintProps) => {
	const sharedBubble = useContext(SharedBubbleContext)

	if (sharedBubble) {
		return (
			<TooltipPrimitive.Trigger
				closeDelay={HINT_CLOSE_GRACE_MS}
				data-slot="tooltip-trigger"
				delay={HOVER_INTENT_DELAY_MS}
				disabled={!content}
				handle={sharedBubble}
				payload={{ content, side }}
				render={children}
			/>
		)
	}

	return (
		<Tooltip>
			<TooltipTrigger delay={HOVER_INTENT_DELAY_MS} render={children} />
			{content ? (
				<TooltipContent className={BUBBLE} role="tooltip" side={side}>
					{content}
				</TooltipContent>
			) : null}
		</Tooltip>
	)
}

type TooltipHintProviderProps = {
	children: ReactNode
}

const TooltipHintProvider = ({ children }: TooltipHintProviderProps) => {
	const [sharedBubble] = useState(() =>
		TooltipPrimitive.createHandle<SharedBubble>(),
	)

	return (
		<TooltipProvider delay={HOVER_INTENT_DELAY_MS}>
			<SharedBubbleContext.Provider value={sharedBubble}>
				{children}
			</SharedBubbleContext.Provider>
			<TooltipPrimitive.Root handle={sharedBubble}>
				{({ payload }) => (
					<TooltipContent
						className={BUBBLE}
						role="tooltip"
						side={payload?.side}
					>
						{payload?.content}
					</TooltipContent>
				)}
			</TooltipPrimitive.Root>
		</TooltipProvider>
	)
}

export {
	HOVER_INTENT_DELAY_MS,
	TooltipHint,
	TooltipHintProvider,
	type TooltipHintSide,
}
