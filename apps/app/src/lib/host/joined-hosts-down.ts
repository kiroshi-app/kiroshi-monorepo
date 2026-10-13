import type { EventCallback, UnlistenFn } from "@tauri-apps/api/event"

import type { HttpHost } from "./http"
import type {
	JoinedHostsOptions,
	JoinedHostsState,
	RecordJoinedHost,
} from "./joined-hosts"
import type { LocalHost } from "./joined-hosts-invoke"
import { createReopenPairing } from "./joined-hosts-reopens"

import {
	JOINED_SPACE_RECONNECTED_EVENT,
	type JoinedSpaceReconnected,
} from "../bindings"
import type { Store } from "../store"

export const LONGEST_DOWN_GRACE = 3000

type JoinedHostsDownOptions = Pick<
	JoinedHostsOptions,
	"reportHostDown" | "endHostDown"
> & {
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
	reportHostDown,
	endHostDown,
}: JoinedHostsDownOptions) => {
	const downNotices = new Map<string, string>()
	const downGraces = new Map<string, ReturnType<typeof setTimeout>>()
	const reconnectionListeners = new Set<() => void>()
	const { leaveUnpaired, pairsWith, forgetUnpaired } = createReopenPairing()
	let isHearingRelayReopens = false

	const isDown = (id: string) =>
		store.getState().connections[id]?.status === "down"

	const reportIfActiveDown = (id: string) => {
		if (
			store.getState().active === id &&
			isDown(id) &&
			!downGraces.has(id) &&
			!downNotices.has(id)
		) {
			downNotices.set(id, reportHostDown())
		}
	}

	const endDownGrace = (id: string) => {
		clearTimeout(downGraces.get(id))
		downGraces.delete(id)
	}

	const endGraceAndReport = (id: string) => {
		endDownGrace(id)
		reportIfActiveDown(id)
	}

	const startDownGrace = (id: string) => {
		downGraces.set(
			id,
			setTimeout(() => endGraceAndReport(id), LONGEST_DOWN_GRACE),
		)
	}

	const endDownNotice = (id: string) => {
		const noticeId = downNotices.get(id)
		if (noticeId) {
			endHostDown(noticeId)
			downNotices.delete(id)
		}
	}

	const announceReconnectionOf = (id: string) => {
		if (store.getState().active !== id) {
			return
		}
		for (const listener of [...reconnectionListeners]) {
			listener()
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
		endDownGrace(id)
		endDownNotice(id)
		if (wasDown) {
			catchUpOnSocketReopen(id)
		}
	}

	const markDown = (id: string) => {
		record(id, { status: "down" })
		startDownGrace(id)
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

	const onReconnected = (listener: () => void) => {
		reconnectionListeners.add(listener)
		hearRelayReopens()
		return () => {
			reconnectionListeners.delete(listener)
		}
	}

	const forgetDown = (id: string) => {
		forgetUnpaired(id)
		endDownGrace(id)
		endDownNotice(id)
	}

	return {
		isDown,
		reportIfActiveDown,
		endGraceAndReport,
		endDownNotice,
		markUp,
		markDown,
		hearRelayReopens,
		onReconnected,
		forgetDown,
	}
}

export type JoinedHostsDown = ReturnType<typeof createJoinedHostsDown>
