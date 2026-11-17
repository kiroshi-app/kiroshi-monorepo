"use client"

import { type AnimationEvent, useState } from "react"

import { ShimmerText } from "@workspace/ui/components/motion/shimmer-text"
import { cn } from "@workspace/ui/lib/utils"

type TextSwapProps = {
	text: string
	isShimmering?: boolean
	isHeldUnderReducedMotion?: boolean
	className?: string
}

type ShownText = {
	text: string
	isShimmering: boolean
	isHeldUnderReducedMotion: boolean
}

const TextSwap = ({
	text,
	isShimmering = false,
	isHeldUnderReducedMotion = false,
	className,
}: TextSwapProps) => {
	const current = { text, isShimmering, isHeldUnderReducedMotion }
	const [shown, setShown] = useState<ShownText>(current)
	const [hasSwapped, setHasSwapped] = useState(false)
	const isLeaving = shown.text !== text
	if (
		!isLeaving &&
		(shown.isShimmering !== isShimmering ||
			shown.isHeldUnderReducedMotion !== isHeldUnderReducedMotion)
	)
		setShown(current)
	const drawn = isLeaving ? shown : current

	const settle = (event: AnimationEvent<HTMLSpanElement>) => {
		if (event.target !== event.currentTarget || !isLeaving) return
		setShown(current)
		setHasSwapped(true)
	}

	return (
		<span
			className={cn("text-swap", className)}
			data-phase={isLeaving ? "exit" : hasSwapped ? "enter" : undefined}
			data-slot="text-swap"
			key={drawn.text}
			onAnimationEnd={settle}
		>
			{drawn.isShimmering ? (
				<ShimmerText
					className="inline"
					isHeldUnderReducedMotion={drawn.isHeldUnderReducedMotion}
				>
					{drawn.text}
				</ShimmerText>
			) : (
				drawn.text
			)}
		</span>
	)
}

export { TextSwap }
