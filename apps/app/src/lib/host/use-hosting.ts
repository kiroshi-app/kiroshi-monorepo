import {
	skipToken,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query"
import { useRef } from "react"

import type { NoticeMessage } from "@workspace/ui/components/notice-surface"
import type { SpaceHosting } from "@workspace/ui/components/space-settings-dialog"

import { hostQueryKeys } from "./host-query-keys"
import {
	type HostedSpace,
	type HostingAttempt,
	type HostingTransport,
	hostingFailureOf,
	hostingTransport,
	isFailureToReport,
	stopFailureOf,
} from "./hosting-transport"
import { isDesktopHost } from "./index"

import { HOSTING_CHANGED_EVENT, type HostingState } from "../bindings"
import { failureReporterIn } from "../failure-report"
import { useInvalidateOnHostEvent } from "../query/host-invalidations"

export type HostingProps = {
	hosting: SpaceHosting
	onHost: () => void
	onStopHosting: () => void
}

type HostingOptions = {
	transport?: HostingTransport
	reportFailure?: (message: NoticeMessage) => void
}

const SPACE_HOSTING: Record<HostingState["kind"], SpaceHosting> = {
	off: "off",
	connecting: "connecting",
	online: "online",
	failed: "off",
	needsSignIn: "signed-out",
}

const RAISED_IN = "use-hosting"

const NO_SPACE: HostedSpace = { id: "", name: "" }

const reportInHosting = failureReporterIn(RAISED_IN)

export const useHosting = (
	openSpace: HostedSpace | null,
	{
		transport = hostingTransport,
		reportFailure = reportInHosting,
	}: HostingOptions = {},
): HostingProps | undefined => {
	const queryClient = useQueryClient()
	const attempt = useRef<HostingAttempt | null>(null)
	const watchedSpace = isDesktopHost() ? openSpace : null
	const namedSpace = watchedSpace ?? NO_SPACE

	const settle = (space: HostedSpace, next: HostingState) => {
		const previous = queryClient.getQueryData<HostingState>(
			hostQueryKeys.hostingOf(space.id),
		)
		if (
			next.kind === "failed" &&
			isFailureToReport(previous, next, attempt.current)
		) {
			reportFailure(hostingFailureOf(space, next.failure))
		}
		return next
	}

	const { data: hosting } = useQuery({
		queryKey: hostQueryKeys.hostingOf(watchedSpace?.id),
		queryFn: watchedSpace
			? async ({ signal }) => {
					const read = await transport.read(watchedSpace.id)
					return signal.aborted ? read : settle(watchedSpace, read)
				}
			: skipToken,
		meta: {
			failureNotice: () => hostingFailureOf(namedSpace),
			raisedIn: RAISED_IN,
		},
	})
	useInvalidateOnHostEvent(HOSTING_CHANGED_EVENT, [hostQueryKeys.hosting()])

	const startAttempt = () => {
		attempt.current = { isReported: false }
		return attempt.current
	}

	const endAttempt = (started: HostingAttempt | undefined) => {
		if (attempt.current === started) attempt.current = null
	}

	const keepAnswer = (answered: HostingState, space: HostedSpace) =>
		queryClient.setQueryData(
			hostQueryKeys.hostingOf(space.id),
			settle(space, answered),
		)

	const start = useMutation({
		mutationFn: (space: HostedSpace) => transport.start(space.id),
		onMutate: startAttempt,
		onSuccess: keepAnswer,
		onSettled: (_answered, _error, _space, started) => endAttempt(started),
		meta: {
			failureNotice: () => hostingFailureOf(namedSpace),
			raisedIn: RAISED_IN,
		},
	})

	const stop = useMutation({
		mutationFn: (space: HostedSpace) => transport.stop(space.id),
		onMutate: startAttempt,
		onSuccess: keepAnswer,
		onSettled: (_answered, _error, _space, started) => endAttempt(started),
		meta: {
			failureNotice: () => stopFailureOf(namedSpace),
			raisedIn: RAISED_IN,
		},
	})

	if (!watchedSpace || !hosting) return undefined
	return {
		hosting: SPACE_HOSTING[hosting.kind],
		onHost: () => start.mutate(watchedSpace),
		onStopHosting: () => stop.mutate(watchedSpace),
	}
}
