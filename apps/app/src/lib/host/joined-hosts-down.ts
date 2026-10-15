import type { EventCallback, UnlistenFn } from "@tauri-apps/api/event"

import type { HttpHost } from "./http"
import type { JoinedHostsState, RecordJoinedHost } from "./joined-hosts"
import type { LocalHost } from "./joined-hosts-invoke"

import {
	JOINED_SPACE_RECONNECTED_EVENT,
	type JoinedSpaceReconnected,
} from "../bindings"
import type { Store } from "../store"

type ReconnectionListener = (hostId: string) => void

type JoinedHostsDownOptions = {
	store: Store<JoinedHostsState>
	hosts: Map<string, HttpHost>
	local: LocalHost
	record: RecordJoinedHost
	reportListenFailure: (reason: unknown) => UnlistenFn
}

export const createJoinedHostsDown = ({
	store,
	hosts,
	local,
	record,
	reportListenFailure,
}: JoinedHostsDownOptions) => {
	const reconnectionListeners = new Set<ReconnectionListener>()
	const rereadsAwaitingUp = new Set<string>()
	let isHearingRelayReopens = false

	const isDown = (id: string) =>
		store.getState().connections[id]?.status === "down"

	const announceReconnectionOf = (id: string) => {
		if (store.getState().active !== id) {
			return
		}
		for (const listener of [...reconnectionListeners]) {
			listener(id)
		}
	}

	const rereadOnceUp = (id: string) => {
		const status = store.getState().connections[id]?.status
		if (status === "down") {
			rereadsAwaitingUp.add(id)
			return
		}
		if (status === "up") {
			announceReconnectionOf(id)
		}
	}

	const rereadOnRelayResync: EventCallback<JoinedSpaceReconnected> = ({
		payload: { id },
	}) => rereadOnceUp(id)

	const markUp = (id: string) => {
		record(id, { status: "up" })
		if (rereadsAwaitingUp.delete(id)) {
			announceReconnectionOf(id)
		}
	}

	const markDown = (id: string) => {
		record(id, { status: "down" })
	}

	const hearRelayReopens = () => {
		if (
			isHearingRelayReopens ||
			hosts.size === 0 ||
			reconnectionListeners.size === 0
		) {
			return
		}
		isHearingRelayReopens = true
		void local
			.listen(JOINED_SPACE_RECONNECTED_EVENT, rereadOnRelayResync)
			.catch(reportListenFailure)
	}

	const onReconnected = (listener: ReconnectionListener) => {
		reconnectionListeners.add(listener)
		hearRelayReopens()
		return () => {
			reconnectionListeners.delete(listener)
		}
	}

	const forgetDown = (id: string) => {
		rereadsAwaitingUp.delete(id)
	}

	return {
		isDown,
		markUp,
		markDown,
		markReopened: rereadOnceUp,
		hearRelayReopens,
		onReconnected,
		forgetDown,
	}
}

export type JoinedHostsDown = ReturnType<typeof createJoinedHostsDown>
