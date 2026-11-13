import type { InvokeArgs } from "@tauri-apps/api/core"

import type { NoticeMessage } from "@workspace/ui/components/notice-surface"

import { hostOfflineOf, isHostOffline } from "./host-offline"
import {
	createHttpHost,
	type HostRefusal,
	type HttpHost,
	isTimeout,
	refusalKindOf,
} from "./http"
import {
	isJoinedSpaceError,
	type JoinedSpaceNaming,
	joinRefusalNoticeOf,
	unexpectedJoinNotice,
} from "./join-refusal"
import type {
	JoinedHostState,
	JoinedHostsOptions,
	JoinedHostsState,
	RecordJoinedHost,
} from "./joined-hosts"
import type { JoinedHostsDown } from "./joined-hosts-down"

import type {
	commands,
	JoinedSpaceConnection,
	JoinedSpaceError,
} from "../bindings"
import { describeFailure, type ReporterFacts } from "../failure-report"
import type { Store } from "../store"

export type JoinOutcome = Awaited<
	ReturnType<typeof commands.joinedSpaceConnect>
>

type JoinedHostsJoinOptions = Pick<
	JoinedHostsOptions,
	"join" | "fetch" | "openSocket" | "reportFailure"
> & {
	store: Store<JoinedHostsState>
	hosts: Map<string, HttpHost>
	sharedSpaceIds: Map<string, string>
	down: JoinedHostsDown
	record: RecordJoinedHost
	attachHost: (id: string, host: HttpHost) => void
	reportJoinRefusal: NonNullable<JoinedHostsOptions["reportJoinRefusal"]>
	isOnScreen: (id: string) => boolean
	namingOf: (id: string) => JoinedSpaceNaming
}

const JOIN_COMMAND = "joined_space_connect"

type RefusedJoin = Extract<JoinedHostState, { status: "refused" }>

const refusalFactsOf = (id: string): ReporterFacts => ({
	command: JOIN_COMMAND,
	space: id,
})

const logJoinFailure = (id: string, reason: unknown) => {
	console.warn(
		[
			"joined-hosts: couldn't connect a joined space",
			`space: ${id}`,
			`reason: ${describeFailure(reason)}`,
		].join(" | "),
	)
}

const logOutdatedHost = (id: string, { command, message }: HostRefusal) => {
	console.warn(
		[
			"joined-hosts: a joined space off screen runs an older host",
			`space: ${id}`,
			`command: ${command}`,
			`reason: ${message}`,
		].join(" | "),
	)
}

const waitReasonOf = (error: JoinedSpaceError) =>
	error.kind === "waitingForHost" ? { wait: error.reason } : {}

const isReportedJoinError = (error: JoinedSpaceError) =>
	!isHostOffline(error) && error.kind !== "waitingForHost"

const settledBefore = <T>(
	pending: Promise<T>,
	signal: AbortSignal,
): Promise<T> =>
	new Promise((resolve, reject) => {
		const abandon = () => reject(signal.reason)
		if (signal.aborted) {
			abandon()
			return
		}
		signal.addEventListener("abort", abandon, { once: true })
		pending
			.then(resolve, reject)
			.finally(() => signal.removeEventListener("abort", abandon))
	})

export const createJoinedHostsJoin = ({
	store,
	hosts,
	sharedSpaceIds,
	down,
	record,
	attachHost,
	join,
	fetch,
	openSocket,
	reportFailure,
	reportJoinRefusal,
	isOnScreen,
	namingOf,
}: JoinedHostsJoinOptions) => {
	const pendingJoins = new Map<string, Promise<HttpHost | null>>()
	const reportedRefusals = new Set<string>()

	const reportRefusalOnce = (
		id: string,
		notice: NoticeMessage,
		facts: ReporterFacts,
	) => {
		if (reportedRefusals.has(id) || !isOnScreen(id)) {
			return
		}
		reportedRefusals.add(id)
		reportJoinRefusal(notice, facts)
	}

	const markUp = (id: string) => {
		reportedRefusals.delete(id)
		down.markUp(id)
	}

	const refuse = (id: string, refusal: Omit<RefusedJoin, "status">): null => {
		record(id, { status: "refused", ...refusal })
		return null
	}

	const refuseJoin = (id: string, error: JoinedSpaceError): null => {
		const notice = joinRefusalNoticeOf(error, namingOf(id))
		logJoinFailure(id, error)
		if (isReportedJoinError(error)) {
			reportRefusalOnce(id, notice, refusalFactsOf(id))
		}
		return refuse(id, { failure: notice.title, ...waitReasonOf(error) })
	}

	const refuseRejection = (id: string, reason: unknown): null => {
		if (isJoinedSpaceError(reason)) {
			return refuseJoin(id, reason)
		}
		logJoinFailure(id, reason)
		reportRefusalOnce(
			id,
			unexpectedJoinNotice(namingOf(id)),
			refusalFactsOf(id),
		)
		return refuse(id, { failure: describeFailure(reason) })
	}

	const isOutdatedOffScreen = (id: string, refusal: HostRefusal) =>
		refusalKindOf(refusal) === "unknownCommand" &&
		store.getState().active !== id

	const reportRefusal = (id: string, refusal: HostRefusal) => {
		if (isOutdatedOffScreen(id, refusal)) {
			logOutdatedHost(id, refusal)
			return
		}
		reportFailure(refusal)
	}

	const openHost = (
		id: string,
		{ hostUrl, token, remoteSpaceId }: JoinedSpaceConnection,
	) => {
		const host = createHttpHost({
			host: hostUrl,
			token,
			fetch,
			openSocket,
			onUp: () => markUp(id),
			onDown: () => down.markDown(id),
			onReopened: () => down.markReopened(id),
			onRefused: (refusal) => reportRefusal(id, refusal),
		})
		hosts.set(id, host)
		sharedSpaceIds.set(id, remoteSpaceId ?? id)
		attachHost(id, host)
		host.openEvents()
		down.hearRelayReopens()
		return host
	}

	const settleJoin = (id: string, outcome: JoinOutcome) =>
		outcome.status === "ok"
			? openHost(id, outcome.data)
			: refuseJoin(id, outcome.error)

	const startJoin = async (id: string): Promise<HttpHost | null> => {
		record(id, { status: "connecting" })
		try {
			return settleJoin(id, await join(id))
		} catch (reason) {
			return refuseRejection(id, reason)
		} finally {
			pendingJoins.delete(id)
		}
	}

	const openConnection = (id: string): Promise<HttpHost | null> => {
		const opened = hosts.get(id)
		if (opened) {
			return Promise.resolve(opened)
		}
		const pending = pendingJoins.get(id) ?? startJoin(id)
		pendingJoins.set(id, pending)
		return pending
	}

	const unreachable = (id: string) => {
		const connection = store.getState().connections[id]
		const failure =
			connection?.status === "refused" ? connection.failure : "unreachable"
		return hostOfflineOf(`joined host ${id}: ${failure}`)
	}

	const goOffline = (id: string, reason: unknown): never => {
		down.markDown(id)
		throw hostOfflineOf(describeFailure(reason))
	}

	const openConnectionBefore = async (id: string, signal?: AbortSignal) => {
		if (!signal) {
			return openConnection(id)
		}
		try {
			return await settledBefore(openConnection(id), signal)
		} catch (reason) {
			if (isTimeout(reason)) {
				goOffline(id, reason)
			}
			throw reason
		}
	}

	const invokeOnceOpen = async <T>(
		id: string,
		command: string,
		args?: InvokeArgs,
		signal?: AbortSignal,
	): Promise<T> => {
		const host = await openConnectionBefore(id, signal)
		if (!host) {
			throw unreachable(id)
		}
		return host.invoke<T>(command, args, signal)
	}

	return { openConnection, invokeOnceOpen }
}
