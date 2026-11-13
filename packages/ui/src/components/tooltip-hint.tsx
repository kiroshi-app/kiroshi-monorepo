"use client"

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"
import {
	type ComponentProps,
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

type TooltipHintVariant = "hint" | "card"

const BUBBLE: Record<TooltipHintVariant, string> = {
	hint: cn("break-words", STILL_UNDER_REDUCED_MOTION),
	card: cn("break-words py-3", STILL_UNDER_REDUCED_MOTION),
}

type TooltipHintSide = "top" | "right" | "bottom" | "left"

type TooltipHintSideOffset = ComponentProps<typeof TooltipContent>["sideOffset"]

type SharedBubble = {
	content: ReactNode
	side: TooltipHintSide
	sideOffset: TooltipHintSideOffset
	variant: TooltipHintVariant
}

const SharedBubbleContext = createContext<
	TooltipPrimitive.Handle<SharedBubble> | undefined
>(undefined)

type TooltipHintProps = {
	content: ReactNode
	children: ReactElement
	side?: TooltipHintSide
	sideOffset?: TooltipHintSideOffset
	variant?: TooltipHintVariant
}

const TooltipHint = ({
	content,
	children,
	side = "top",
	sideOffset,
	variant = "hint",
}: TooltipHintProps) => {
	const sharedBubble = useContext(SharedBubbleContext)

	if (sharedBubble) {
		return (
			<TooltipPrimitive.Trigger
				closeDelay={HINT_CLOSE_GRACE_MS}
				data-slot="tooltip-trigger"
				delay={HOVER_INTENT_DELAY_MS}
				disabled={!content}
				handle={sharedBubble}
				payload={{ content, side, sideOffset, variant }}
				render={children}
			/>
		)
	}

	return (
		<Tooltip>
			<TooltipTrigger delay={HOVER_INTENT_DELAY_MS} render={children} />
			{content ? (
				<TooltipContent
					className={BUBBLE[variant]}
					role="tooltip"
					side={side}
					sideOffset={sideOffset}
				>
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
						className={BUBBLE[payload?.variant ?? "hint"]}
						role="tooltip"
						side={payload?.side}
						sideOffset={payload?.sideOffset}
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
