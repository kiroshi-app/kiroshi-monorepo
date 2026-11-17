import {
	hashKey,
	type Query,
	type QueryKey,
	type UseQueryOptions,
	type UseQueryResult,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query"

import {
	type HostRefused,
	isHostRefused,
	isUnknownCommandRefusal,
} from "@/lib/host/host-refused"

export const isReadErrorShown = (error: unknown): boolean =>
	!isUnknownCommandRefusal(error)

type AnsweredRead = Query<unknown, unknown>

const lastRefusalByRead = new WeakMap<AnsweredRead, HostRefused>()

export const recordLastAnswer = (read: AnsweredRead, error: unknown) => {
	if (isHostRefused(error) && isUnknownCommandRefusal(error)) {
		lastRefusalByRead.set(read, error)
		return
	}
	lastRefusalByRead.delete(read)
}

type PendingRead<TData> = Extract<UseQueryResult<TData>, { isPending: true }>

const stillRefused = <TData>(
	read: PendingRead<TData>,
	refusal: HostRefused,
): UseQueryResult<TData> => ({
	...read,
	error: refusal,
	status: "error",
	fetchStatus: "idle",
	isError: true,
	isLoadingError: true,
	isPending: false,
	isLoading: false,
	isInitialLoading: false,
	isFetching: false,
})

export const useLastRead = <
	TQueryFnData,
	TData = TQueryFnData,
	TQueryKey extends QueryKey = QueryKey,
>(
	options: UseQueryOptions<TQueryFnData, Error, TData, TQueryKey>,
): UseQueryResult<TData> => {
	const answeredReads = useQueryClient().getQueryCache()
	const read = useQuery(options)
	if (!read.isPending) {
		return read
	}
	const answered = answeredReads.get<unknown, unknown>(
		hashKey(options.queryKey),
	)
	const refusal = answered && lastRefusalByRead.get(answered)
	return refusal ? stillRefused(read, refusal) : read
}

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
