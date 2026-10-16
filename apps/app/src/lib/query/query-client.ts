import {
	MutationCache,
	type Query,
	QueryCache,
	QueryClient,
} from "@tanstack/react-query"

import type { NoticeMessage } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import { raiseReportedFailure } from "@/lib/failure-report"
import { isHostOffline } from "@/lib/host/host-offline"

type InlineFailure = { rendersErrorInline: true }

type NoticedFailure = {
	failureNotice: (error: unknown) => NoticeMessage
	raisedIn: string
	isSilentOn?: (error: unknown) => boolean
	raisesOncePerOutage?: true
}

export type FailureMeta = InlineFailure | NoticedFailure

type QueryMeta = FailureMeta & { rereadsItselfOnReconnect?: true }

declare module "@tanstack/react-query" {
	interface Register {
		queryMeta: QueryMeta
		mutationMeta: FailureMeta
	}
}

const MAX_JOINED_HOST_RETRIES = 1

const FIVE_MINUTES = 5 * 60 * 1000

const unlabelledFailureIn = (raisedIn: string): NoticedFailure => ({
	failureNotice: () => ({ title: i18n.t("chat:screen.notice.failed") }),
	raisedIn,
})

const noticedFailureOf = (
	error: unknown,
	meta: FailureMeta | undefined,
	cacheName: string,
): NoticedFailure | null => {
	if (meta && "rendersErrorInline" in meta) {
		return null
	}
	const noticed = meta ?? unlabelledFailureIn(cacheName)
	return noticed.isSilentOn?.(error) ? null : noticed
}

const raiseNoticedFailure = (
	error: unknown,
	{ failureNotice, raisedIn }: NoticedFailure,
) => raiseReportedFailure(failureNotice(error), { raisedIn })

const raiseFailureOf = (
	error: unknown,
	meta: FailureMeta | undefined,
	cacheName: string,
) => {
	const noticed = noticedFailureOf(error, meta, cacheName)
	if (noticed) {
		raiseNoticedFailure(error, noticed)
	}
}

const createQueryCache = (): QueryCache => {
	const noticedOutages = new WeakSet<Query<unknown, unknown>>()
	return new QueryCache({
		onError: (error, query) => {
			if (isHostOffline(error)) {
				return
			}
			const noticed = noticedFailureOf(error, query.meta, "query-cache")
			if (!noticed || noticedOutages.has(query)) {
				return
			}
			if (noticed.raisesOncePerOutage) {
				noticedOutages.add(query)
			}
			raiseNoticedFailure(error, noticed)
		},
		onSuccess: (_data, query) => {
			noticedOutages.delete(query)
		},
	})
}

const retriesAnOfflineJoinedHostOnce = (
	failureCount: number,
	error: unknown,
): boolean => failureCount < MAX_JOINED_HOST_RETRIES && isHostOffline(error)

export const createQueryClient = (): QueryClient =>
	new QueryClient({
		queryCache: createQueryCache(),
		mutationCache: new MutationCache({
			onError: (error, _variables, _result, mutation) =>
				raiseFailureOf(error, mutation.meta, "mutation-cache"),
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
