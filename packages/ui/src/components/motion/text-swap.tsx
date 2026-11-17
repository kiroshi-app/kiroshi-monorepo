"use client"

import { type AnimationEvent, useState } from "react"

import { ShimmerText } from "@workspace/ui/components/motion/shimmer-text"
import { cn } from "@workspace/ui/lib/utils"

type TextSwapProps = {
	text: string
	isShimmering?: boolean
	className?: string
}

type ShownText = {
	text: string
	isShimmering: boolean
}

const TextSwap = ({ text, isShimmering = false, className }: TextSwapProps) => {
	const [shown, setShown] = useState<ShownText>({ text, isShimmering })
	const [hasSwapped, setHasSwapped] = useState(false)
	const isLeaving = shown.text !== text
	if (!isLeaving && shown.isShimmering !== isShimmering)
		setShown({ text, isShimmering })
	const drawn = isLeaving ? shown : { text, isShimmering }

	const settle = (event: AnimationEvent<HTMLSpanElement>) => {
		if (event.target !== event.currentTarget || !isLeaving) return
		setShown({ text, isShimmering })
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
				<ShimmerText className="inline">{drawn.text}</ShimmerText>
			) : (
				drawn.text
			)}
		</span>
	)
}

export { TextSwap }
