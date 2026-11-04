import type { UseInfiniteQueryResult } from "@tanstack/react-query"
import { useCallback } from "react"

import type { ListEnd } from "@workspace/ui/components/list-skeleton"

import { useListEnd } from "./use-list-end"

type PagedRead = Pick<
	UseInfiniteQueryResult,
	"hasNextPage" | "isFetchingNextPage" | "fetchNextPage"
>

export const useInfiniteListEnd = ({
	hasNextPage,
	isFetchingNextPage,
	fetchNextPage,
}: PagedRead): ListEnd => {
	const loadMore = useCallback(
		() =>
			fetchNextPage({ cancelRefetch: false }).then(({ isError }) => !isError),
		[fetchNextPage],
	)

	return useListEnd({
		hasMore: hasNextPage,
		isLoading: isFetchingNextPage,
		loadMore,
	})
}
