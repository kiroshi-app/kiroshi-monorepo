import type { InvokeArgs } from "@tauri-apps/api/core"

import { createHttpHost, type HttpHost } from "./http"
import {
	isJoinedSpaceError,
	joinRefusalNoticeOf,
	unexpectedJoinNotice,
} from "./join-refusal"
import type {
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
	reportJoinRefusal: NonNullable<JoinedHostsOptions["reportJoinRefusal"]>
}

export const describeRejection = (reason: unknown): string =>
	reason instanceof Error ? reason.message : String(reason)

export const createJoinedHostsJoin = ({
	store,
	hosts,
	sharedSpaceIds,
	down,
	record,
	join,
	fetch,
	openSocket,
	reportFailure,
	reportJoinRefusal,
}: JoinedHostsJoinOptions) => {
	const pendingJoins = new Map<string, Promise<HttpHost | null>>()

	const refuse = (id: string, failure: string): null => {
		record(id, { status: "refused", failure })
		return null
	}

	const refuseJoin = (id: string, error: JoinedSpaceError): null => {
		const notice = joinRefusalNoticeOf(error)
		reportJoinRefusal(notice)
		return refuse(id, notice.title)
	}

	const refuseRejection = (id: string, reason: unknown): null => {
		if (isJoinedSpaceError(reason)) {
			return refuseJoin(id, reason)
		}
		reportJoinRefusal(unexpectedJoinNotice())
		return refuse(id, describeRejection(reason))
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
			onUp: () => down.markUp(id),
			onDown: () => down.markDown(id),
			onReconnectFailed: () => down.endGraceAndReport(id),
			onRefused: reportFailure,
		})
		hosts.set(id, host)
		sharedSpaceIds.set(id, remoteSpaceId ?? id)
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
		return new Error(`joined host ${id}: ${failure}`)
	}

	const invokeOnceOpen = async <T>(
		id: string,
		command: string,
		args?: InvokeArgs,
	): Promise<T> => {
		const host = await openConnection(id)
		if (!host) {
			throw unreachable(id)
		}
		return host.invoke<T>(command, args)
	}

	return { openConnection, invokeOnceOpen }
}
