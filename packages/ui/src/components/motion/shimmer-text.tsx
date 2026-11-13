import type { ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

type ShimmerTextProps = {
	children: ReactNode
	isHeldUnderReducedMotion?: boolean
	className?: string
}

export const ShimmerText = ({
	children,
	isHeldUnderReducedMotion = false,
	className,
}: ShimmerTextProps) => (
	<span
		className={cn("inline-block shimmer-text", className)}
		data-held={isHeldUnderReducedMotion || undefined}
		data-slot="shimmer-text"
	>
		{children}
	</span>
)
