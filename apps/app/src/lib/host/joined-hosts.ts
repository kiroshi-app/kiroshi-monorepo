import type { UnlistenFn } from "@tauri-apps/api/event"

import type { NoticeMessage } from "@workspace/ui/components/notice-surface"

import type { HostRefusal, HostSocket, HttpHost } from "./http"
import { createJoinedHostsDown } from "./joined-hosts-down"
import { createJoinedHostsInvoke, type LocalHost } from "./joined-hosts-invoke"
import { createJoinedHostsJoin, type JoinOutcome } from "./joined-hosts-join"
import { createJoinedHostsListen } from "./joined-hosts-listen"

import {
	describeFailure,
	failureReporterIn,
	type ReporterFacts,
} from "../failure-report"
import { createStore } from "../store"

export { LOCAL_COMMANDS } from "./joined-hosts-invoke"
export { JOINED_SPACE_CHANGED_EVENT } from "./joined-hosts-listen"

export type JoinedHostState =
	| { status: "connecting" }
	| { status: "up" }
	| { status: "down" }
	| { status: "refused"; failure: string }

export type JoinedHostsState = {
	active: string | null
	connections: Record<string, JoinedHostState>
}

export type RecordJoinedHost = (id: string, state: JoinedHostState) => void

export type JoinedHostsOptions = {
	local: LocalHost
	join: (id: string) => Promise<JoinOutcome>
	fetch: typeof fetch
	openSocket: (url: string) => HostSocket
	reportFailure: (refusal: HostRefusal) => void
	reportJoinRefusal?: (notice: NoticeMessage, facts: ReporterFacts) => void
}

export const createJoinedHosts = ({
	local,
	join,
	fetch,
	openSocket,
	reportFailure,
	reportJoinRefusal = failureReporterIn("joined-hosts"),
}: JoinedHostsOptions) => {
	const store = createStore<JoinedHostsState>({ active: null, connections: {} })
	const hosts = new Map<string, HttpHost>()
	const sharedSpaceIds = new Map<string, string>()
	let requested: string | null = null

	const record: RecordJoinedHost = (id, state) => {
		const current = store.getState()
		store.setState({
			...current,
			connections: { ...current.connections, [id]: state },
		})
	}

	const reportListenFailure = (reason: unknown): UnlistenFn => {
		reportFailure({ message: describeFailure(reason) })
		return () => undefined
	}

	const activeHost = (): HttpHost | undefined => {
		const { active } = store.getState()
		return active ? hosts.get(active) : undefined
	}

	const { attachHost, detachHost, listen, listenToActiveHost } =
		createJoinedHostsListen({
			local,
			hosts,
			activeHostId: () => store.getState().active,
			reportListenFailure,
		})
	const down = createJoinedHostsDown({
		store,
		hosts,
		local,
		record,
		reportListenFailure,
	})
	const { openConnection, invokeOnceOpen } = createJoinedHostsJoin({
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
	})
	const { invoke, invokeOn, invokeOnThisComputer } = createJoinedHostsInvoke({
		store,
		hosts,
		sharedSpaceIds,
		local,
		isDown: down.isDown,
		invokeOnceOpen,
		reportFailure,
	})
	const activeSpaceId = (): string | null => {
		const { active } = store.getState()
		return active ? (sharedSpaceIds.get(active) ?? null) : null
	}

	const setActive = (active: string | null) => {
		const previous = store.getState().active
		if (previous === active) {
			return
		}
		store.setState({ ...store.getState(), active })
	}

	const activate = async (
		id: string | null,
		sharedSpaceId?: string,
	): Promise<void> => {
		requested = id
		if (id === null) {
			setActive(null)
			return
		}
		sharedSpaceIds.set(id, sharedSpaceId ?? id)
		const previous = store.getState().active
		const opening = openConnection(id)
		setActive(id)
		const host = await opening
		if (requested !== id) {
			return
		}
		if (!host) {
			setActive(previous)
		}
	}

	const forget = (id: string) => {
		detachHost(id)
		hosts.get(id)?.close()
		hosts.delete(id)
		sharedSpaceIds.delete(id)
		down.forgetDown(id)
		const { [id]: _forgotten, ...connections } = store.getState().connections
		store.setState({ ...store.getState(), connections })
		if (requested === id) {
			void activate(null)
		}
	}

	const fileSrc = (path: string): string =>
		(activeHost() ?? local).fileSrc(path)

	return {
		getState: store.getState,
		subscribe: store.subscribe,
		connect: async (id: string) => {
			await openConnection(id)
		},
		activate,
		forget,
		invoke,
		invokeOn,
		invokeOnThisComputer,
		activeSpaceId,
		listen,
		listenToActiveHost,
		onReconnected: down.onReconnected,
		fileSrc,
	}
}

export type JoinedHosts = ReturnType<typeof createJoinedHosts>
