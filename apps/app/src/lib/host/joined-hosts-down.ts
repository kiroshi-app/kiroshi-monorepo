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

type ReconnectionCatchUp = (hostId: string) => Promise<boolean>

type JoinedHostsDownOptions = {
	store: Store<JoinedHostsState>
	hosts: Map<string, HttpHost>
	local: LocalHost
	record: RecordJoinedHost
	reportListenFailure: (reason: unknown) => UnlistenFn
	reportCatchUpFailure: (reason: unknown) => void
}

export const createJoinedHostsDown = ({
	store,
	hosts,
	local,
	record,
	reportListenFailure,
	reportCatchUpFailure,
}: JoinedHostsDownOptions) => {
	const reconnectionCatchUps = new Set<ReconnectionCatchUp>()
	const reconnectionListeners = new Set<ReconnectionListener>()
	const rereadsAwaitingUp = new Set<string>()
	let isHearingRelayReopens = false

	const isDown = (id: string) =>
		store.getState().connections[id]?.status === "down"

	const isActive = (id: string) => store.getState().active === id

	const reportFailedCatchUp = (reason: unknown) => {
		reportCatchUpFailure(reason)
		return false
	}

	const hasCaughtUpWith = (id: string) =>
		Promise.all([...reconnectionCatchUps].map((catchUp) => catchUp(id))).then(
			(caughtUp) => caughtUp.every(Boolean),
			reportFailedCatchUp,
		)

	const tellListenersOf = (id: string) => {
		for (const listener of [...reconnectionListeners]) {
			listener(id)
		}
	}

	const announceReconnectionOf = async (id: string) => {
		if (!isActive(id)) {
			return
		}
		if ((await hasCaughtUpWith(id)) && isActive(id)) {
			tellListenersOf(id)
		}
	}

	const rereadOnceUp = (id: string) => {
		const status = store.getState().connections[id]?.status
		if (status === "down") {
			rereadsAwaitingUp.add(id)
			return
		}
		if (status === "up") {
			void announceReconnectionOf(id)
		}
	}

	const rereadOnRelayResync: EventCallback<JoinedSpaceReconnected> = ({
		payload: { id },
	}) => rereadOnceUp(id)

	const markUp = (id: string) => {
		record(id, { status: "up" })
		if (rereadsAwaitingUp.delete(id)) {
			void announceReconnectionOf(id)
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

	const onReconnectedFirst = (catchUp: ReconnectionCatchUp) => {
		reconnectionCatchUps.add(catchUp)
		return () => {
			reconnectionCatchUps.delete(catchUp)
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
		onReconnectedFirst,
		forgetDown,
	}
}

export type JoinedHostsDown = ReturnType<typeof createJoinedHostsDown>
