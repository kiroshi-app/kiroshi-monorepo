import type { EventCallback } from "@tauri-apps/api/event"

import type { HostSocket } from "./http"
import { createJoinedHosts } from "./joined-hosts"

import {
	JOINED_SPACE_RECONNECTED_EVENT,
	type JoinedSpaceReconnected,
} from "../bindings"

const FAKE_HOST_URL = "http://192.168.1.30:45367"

const relayHandlers = new Set<EventCallback<JoinedSpaceReconnected>>()

const sockets: HostSocket[] = []

const downHostIds = new Set<string>()

const answerNull = async () =>
	new Response("null", { headers: { "content-type": "application/json" } })

const fakeJoinedHosts = createJoinedHosts({
	local: {
		invoke: (async () => null) as never,
		listen: async (event, handler) => {
			if (event !== JOINED_SPACE_RECONNECTED_EVENT) {
				return () => undefined
			}
			const heard = handler as EventCallback<JoinedSpaceReconnected>
			relayHandlers.add(heard)
			return () => {
				relayHandlers.delete(heard)
			}
		},
		fileSrc: (path) => path,
	},
	join: async (id) =>
		downHostIds.has(id)
			? { status: "error", error: { kind: "hostOffline", id } }
			: {
					status: "ok",
					data: {
						id,
						hostUrl: FAKE_HOST_URL,
						token: "joined",
						remoteSpaceId: null,
						name: id,
					},
				},
	fetch: answerNull,
	openSocket: () => {
		const socket: HostSocket = {
			onopen: null,
			onmessage: null,
			onclose: null,
			close: () => undefined,
		}
		sockets.push(socket)
		return socket
	},
	reportFailure: () => undefined,
})

export const fakeHostModule = {
	joinedHosts: fakeJoinedHosts,
	invoke: fakeJoinedHosts.invoke,
	listen: fakeJoinedHosts.listen,
	listenToActiveHost: fakeJoinedHosts.listenToActiveHost,
	activeJoinedSpaceId: fakeJoinedHosts.activeSpaceId,
	onHostReconnected: fakeJoinedHosts.onReconnected,
}

export const joinFakeHost = async (id: string) => {
	await fakeJoinedHosts.activate(id)
	const socket = sockets[sockets.length - 1]
	socket?.onopen?.call(socket as WebSocket, new Event("open"))
}

export const leaveFakeHost = async (id: string) => {
	await fakeJoinedHosts.activate(null)
	fakeJoinedHosts.forget(id)
}

export const reopenFakeRelay = (id: string) => {
	for (const handler of [...relayHandlers]) {
		handler({ event: JOINED_SPACE_RECONNECTED_EVENT, id: 0, payload: { id } })
	}
}

export const takeFakeHostDown = (id: string) => {
	downHostIds.add(id)
}
