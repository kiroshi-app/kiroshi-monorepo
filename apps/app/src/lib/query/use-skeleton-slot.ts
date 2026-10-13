import { createElement, Fragment, type ReactNode } from "react"

import { useSkeletonTiming } from "@workspace/ui/hooks/use-skeleton-timing"

const AWAITED_SLOT = createElement(Fragment)

export const useSkeletonSlot = (
	isPending: boolean,
	skeleton: ReactNode,
): ReactNode => {
	const phase = useSkeletonTiming(isPending)
	if (phase === "skeleton") return skeleton
	return phase === "delay" ? AWAITED_SLOT : undefined
}
