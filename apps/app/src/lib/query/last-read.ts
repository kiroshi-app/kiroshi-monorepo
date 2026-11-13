import type { UseQueryResult } from "@tanstack/react-query"

import { isUnknownCommandRefusal } from "@/lib/host/host-refused"

export const isReadErrorShown = (error: unknown): boolean =>
	!isUnknownCommandRefusal(error)

type SettledRead = Pick<
	UseQueryResult,
	"isError" | "error" | "isPending" | "isFetching" | "errorUpdatedAt"
>

export const hasLastReadFailed = ({
	isError,
	error,
	isPending,
	isFetching,
	errorUpdatedAt,
}: SettledRead): boolean =>
	isError
		? isReadErrorShown(error)
		: isPending && isFetching && errorUpdatedAt > 0

type FirstRead = Pick<
	UseQueryResult,
	"isPending" | "isFetching" | "errorUpdatedAt"
>

export const isFirstReadPending = ({
	isPending,
	isFetching,
	errorUpdatedAt,
}: FirstRead): boolean => isPending && isFetching && errorUpdatedAt === 0
