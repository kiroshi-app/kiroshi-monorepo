import { MutationObserver, type QueryClient } from "@tanstack/react-query"

import type { FailureMeta } from "./query-client"

const PRESENTED_BY_CALLER: FailureMeta = { rendersErrorInline: true }

export const runMutation = <Result>(
	queryClient: QueryClient,
	write: () => Promise<Result>,
	meta: FailureMeta = PRESENTED_BY_CALLER,
): Promise<Result> =>
	new MutationObserver<Result, Error, void>(queryClient, {
		mutationFn: write,
		meta,
	}).mutate()
