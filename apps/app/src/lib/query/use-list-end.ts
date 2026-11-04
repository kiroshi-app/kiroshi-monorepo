import { useCallback, useMemo, useState } from "react"

import type { ListEnd } from "@workspace/ui/components/list-skeleton"

export type ListEndRead = {
	hasMore: boolean
	isLoading: boolean
	loadMore: () => Promise<boolean>
	rootMargin?: string
}

type RequestPhase = "armed" | "requesting" | "stalled"

const SCROLLING_OVERFLOW = /auto|scroll/

const scrollContainerOf = (element: Element): Element | null => {
	const parent = element.parentElement
	if (!parent) {
		return null
	}
	return SCROLLING_OVERFLOW.test(getComputedStyle(parent).overflowY)
		? parent
		: scrollContainerOf(parent)
}

export const useListEnd = ({
	hasMore,
	isLoading,
	loadMore,
	rootMargin,
}: ListEndRead): ListEnd => {
	const [phase, setPhase] = useState<RequestPhase>("armed")

	const sentinelRef = useCallback(
		(sentinel: HTMLDivElement | null) => {
			if (
				!sentinel ||
				!hasMore ||
				isLoading ||
				phase === "requesting" ||
				typeof IntersectionObserver === "undefined"
			) {
				return
			}
			const requestPage = () => {
				setPhase("requesting")
				void loadMore().then((hasLanded) =>
					setPhase(hasLanded ? "armed" : "stalled"),
				)
			}
			let wasWithinReach = phase === "stalled"
			const observer = new IntersectionObserver(
				(entries) => {
					const isWithinReach = entries.some(
						({ isIntersecting }) => isIntersecting,
					)
					const isEnteringReach = isWithinReach && !wasWithinReach
					wasWithinReach = isWithinReach
					if (isEnteringReach) {
						requestPage()
					}
				},
				{ root: scrollContainerOf(sentinel), rootMargin },
			)
			observer.observe(sentinel)
			return () => observer.disconnect()
		},
		[hasMore, isLoading, loadMore, phase, rootMargin],
	)

	return useMemo(
		() => ({
			hasNextPage: hasMore,
			isFetchingNextPage: isLoading,
			sentinelRef,
		}),
		[hasMore, isLoading, sentinelRef],
	)
}
