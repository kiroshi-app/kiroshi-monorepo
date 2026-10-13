import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query"

import type { NoticeMessage } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import { raiseReportedFailure } from "@/lib/failure-report"
import { isHostOffline } from "@/lib/host/host-offline"

type InlineFailure = { rendersErrorInline: true }

type NoticedFailure = { failureNotice: () => NoticeMessage; raisedIn: string }

export type FailureMeta = InlineFailure | NoticedFailure

declare module "@tanstack/react-query" {
	interface Register {
		queryMeta: FailureMeta
		mutationMeta: FailureMeta
	}
}

const MAX_JOINED_HOST_RETRIES = 1

const FIVE_MINUTES = 5 * 60 * 1000

const unlabelledFailureIn = (raisedIn: string): NoticedFailure => ({
	failureNotice: () => ({ title: i18n.t("chat:screen.notice.failed") }),
	raisedIn,
})

const raiseFailureOf = (meta: FailureMeta | undefined, cacheName: string) => {
	if (meta && "rendersErrorInline" in meta) {
		return
	}
	const { failureNotice, raisedIn } = meta ?? unlabelledFailureIn(cacheName)
	raiseReportedFailure(failureNotice(), { raisedIn })
}

const retriesAnOfflineJoinedHostOnce = (
	failureCount: number,
	error: unknown,
): boolean => failureCount < MAX_JOINED_HOST_RETRIES && isHostOffline(error)

export const createQueryClient = (): QueryClient =>
	new QueryClient({
		queryCache: new QueryCache({
			onError: (_error, query) => raiseFailureOf(query.meta, "query-cache"),
		}),
		mutationCache: new MutationCache({
			onError: (_error, _variables, _result, mutation) =>
				raiseFailureOf(mutation.meta, "mutation-cache"),
		}),
		defaultOptions: {
			queries: {
				// Reads are Tauri invokes, so the browser online flag says nothing about whether they can run.
				networkMode: "always",
				// A local invoke fails the same way twice, only a joined host that dropped offline may answer on a second try.
				retry: retriesAnOfflineJoinedHostOnce,
				// Focusing the window is no signal of change: host events and reconnects drive refetches.
				refetchOnWindowFocus: false,
				// Host events, reconnects and space switches invalidate, so time alone never makes a read stale.
				staleTime: Number.POSITIVE_INFINITY,
				// Keeps a screen's data warm across a quick back-and-forth without holding every visited domain forever.
				gcTime: FIVE_MINUTES,
			},
			mutations: {
				// Writes are Tauri invokes, so the browser online flag says nothing about whether they can run.
				networkMode: "always",
				// A write is not known to be idempotent, so it never replays on its own.
				retry: false,
			},
		},
	})
