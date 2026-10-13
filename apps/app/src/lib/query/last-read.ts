import type { UseQueryResult } from "@tanstack/react-query"

type SettledRead = Pick<
	UseQueryResult,
	"isError" | "isPending" | "isFetching" | "errorUpdatedAt"
>

export const hasLastReadFailed = ({
	isError,
	isPending,
	isFetching,
	errorUpdatedAt,
}: SettledRead): boolean =>
	isError || (isPending && isFetching && errorUpdatedAt > 0)
