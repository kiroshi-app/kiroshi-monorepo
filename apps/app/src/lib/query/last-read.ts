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

type FirstRead = Pick<
	UseQueryResult,
	"isPending" | "isFetching" | "errorUpdatedAt"
>

export const isFirstReadPending = ({
	isPending,
	isFetching,
	errorUpdatedAt,
}: FirstRead): boolean => isPending && isFetching && errorUpdatedAt === 0
