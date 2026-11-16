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

const TOOLTIP_OPEN_DELAY_MS = 600

const TOOLTIP_GROUPING_WINDOW_MS = 400

const HINT_CLOSE_GRACE_MS = 80

const STILL_UNDER_REDUCED_MOTION = "motion-reduce:animate-none!"

const BUBBLE = cn(
	"max-w-[min(var(--container-xs),var(--available-width))] wrap-anywhere",
	STILL_UNDER_REDUCED_MOTION,
)

type TooltipHintSide = "top" | "right" | "bottom" | "left"

type TooltipHintSideOffset = ComponentProps<typeof TooltipContent>["sideOffset"]

type SharedBubble = {
	content: ReactNode
	side: TooltipHintSide
	sideOffset: TooltipHintSideOffset
}

const SharedBubbleContext = createContext<
	TooltipPrimitive.Handle<SharedBubble> | undefined
>(undefined)

type TooltipHintProps = {
	content: ReactNode
	children: ReactElement
	side?: TooltipHintSide
	sideOffset?: TooltipHintSideOffset
}

const TooltipHint = ({
	content,
	children,
	side = "top",
	sideOffset,
}: TooltipHintProps) => {
	const sharedBubble = useContext(SharedBubbleContext)

	if (sharedBubble) {
		return (
			<TooltipPrimitive.Trigger
				closeDelay={HINT_CLOSE_GRACE_MS}
				data-slot="tooltip-trigger"
				delay={TOOLTIP_OPEN_DELAY_MS}
				disabled={!content}
				handle={sharedBubble}
				payload={{ content, side, sideOffset }}
				render={children}
			/>
		)
	}

	return (
		<Tooltip>
			<TooltipTrigger delay={TOOLTIP_OPEN_DELAY_MS} render={children} />
			{content ? (
				<TooltipContent
					className={BUBBLE}
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
		<TooltipProvider
			delay={TOOLTIP_OPEN_DELAY_MS}
			timeout={TOOLTIP_GROUPING_WINDOW_MS}
		>
			<SharedBubbleContext.Provider value={sharedBubble}>
				{children}
			</SharedBubbleContext.Provider>
			<TooltipPrimitive.Root handle={sharedBubble}>
				{({ payload }) => (
					<TooltipContent
						className={BUBBLE}
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
	TOOLTIP_GROUPING_WINDOW_MS,
	TOOLTIP_OPEN_DELAY_MS,
	TooltipHint,
	TooltipHintProvider,
	type TooltipHintSide,
}
