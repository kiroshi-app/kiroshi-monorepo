"use client"

import { type HTMLMotionProps, motion, useReducedMotion } from "motion/react"
import { useState } from "react"

import { EASE_OUT } from "@workspace/ui/lib/ease"
import { cn } from "@workspace/ui/lib/utils"

export interface DisclosureProps
	extends Omit<HTMLMotionProps<"div">, "animate" | "initial" | "transition"> {
	open: boolean
}

export function Disclosure({
	open,
	className,
	style,
	...props
}: DisclosureProps) {
	const reduce = useReducedMotion() ?? false
	const [hasFolded, setHasFolded] = useState(!open)

	if (open && hasFolded) setHasFolded(false)

	const isFlat = reduce ? !open : hasFolded

	return (
		<motion.div
			{...props}
			aria-hidden={!open}
			inert={!open}
			initial={false}
			animate={
				reduce
					? undefined
					: {
							clipPath: open ? "inset(0 0 0% 0)" : "inset(0 0 100% 0)",
							y: open ? 0 : -4,
						}
			}
			transition={{
				duration: reduce ? 0 : open ? 0.22 : 0.14,
				ease: EASE_OUT,
			}}
			onAnimationComplete={() => {
				if (!open) setHasFolded(true)
			}}
			className={cn("overflow-hidden", className)}
			style={{
				...style,
				height: isFlat ? 0 : "auto",
				pointerEvents: open ? undefined : "none",
				transformOrigin: "top",
			}}
		/>
	)
}
