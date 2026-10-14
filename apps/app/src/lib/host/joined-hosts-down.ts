import type { EventCallback, UnlistenFn } from "@tauri-apps/api/event"

import type { HttpHost } from "./http"
import type { JoinedHostsState, RecordJoinedHost } from "./joined-hosts"
import type { LocalHost } from "./joined-hosts-invoke"
import { createReopenPairing } from "./joined-hosts-reopens"

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
	const { leaveUnpaired, pairsWith, forgetUnpaired } = createReopenPairing()
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

	const catchUpOnSocketReopen = (id: string) => {
		if (!pairsWith(id, "relay")) {
			leaveUnpaired(id, "socket")
		}
		announceReconnectionOf(id)
	}

	const catchUpOnRelayReopen: EventCallback<JoinedSpaceReconnected> = ({
		payload: { id },
	}) => {
		const status = store.getState().connections[id]?.status
		if (status === "down") {
			leaveUnpaired(id, "relay")
			return
		}
		if (status === "up" && !pairsWith(id, "socket")) {
			announceReconnectionOf(id)
		}
	}

	const markUp = (id: string) => {
		const wasDown = isDown(id)
		record(id, { status: "up" })
		if (wasDown) {
			catchUpOnSocketReopen(id)
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
			.listen(JOINED_SPACE_RECONNECTED_EVENT, catchUpOnRelayReopen)
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
		forgetUnpaired(id)
	}

	return {
		isDown,
		markUp,
		markDown,
		hearRelayReopens,
		onReconnected,
		forgetDown,
	}
}

export type JoinedHostsDown = ReturnType<typeof createJoinedHostsDown>
