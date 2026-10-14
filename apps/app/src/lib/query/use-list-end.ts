import type { UseInfiniteQueryResult } from "@tanstack/react-query"
import { useCallback, useMemo } from "react"

import type { ListEnd } from "@workspace/ui/components/list-skeleton"

type PagedRead = Pick<
	UseInfiniteQueryResult,
	"hasNextPage" | "isFetchingNextPage" | "fetchNextPage"
>

export const useListEnd = ({
	hasNextPage,
	isFetchingNextPage,
	fetchNextPage,
}: PagedRead): ListEnd => {
	const sentinelRef = useCallback(
		(sentinel: HTMLDivElement | null) => {
			if (
				!sentinel ||
				isFetchingNextPage ||
				typeof IntersectionObserver === "undefined"
			) {
				return
			}
			const observer = new IntersectionObserver((entries) => {
				if (entries.some(({ isIntersecting }) => isIntersecting)) {
					void fetchNextPage({ cancelRefetch: false })
				}
			})
			observer.observe(sentinel)
			return () => observer.disconnect()
		},
		[fetchNextPage, isFetchingNextPage],
	)

	return useMemo(
		() => ({ hasNextPage, isFetchingNextPage, sentinelRef }),
		[hasNextPage, isFetchingNextPage, sentinelRef],
	)
}
