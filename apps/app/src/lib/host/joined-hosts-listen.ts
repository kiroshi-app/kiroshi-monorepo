import type { Event, UnlistenFn } from "@tauri-apps/api/event"

import type { HttpHost } from "./http"
import type { LocalHost } from "./joined-hosts-invoke"

import {
	DEVICE_APPROVAL_CHANGED_EVENT,
	DEVICE_APPROVAL_REQUESTED_EVENT,
	DEVICE_APPROVAL_SETTLED_EVENT,
	INVITATION_CHANGED_EVENT,
	JOINED_SPACE_MEMBERS_CHANGED_EVENT,
	JOINED_SPACE_REMOVED_EVENT,
} from "../bindings"

export type Listen = HttpHost["listen"]

export type HostEventCallback<T> = (
	event: Event<T>,
	hostId: string | null,
) => void

type Deliver = (event: Event<unknown>, hostId: string) => void

type Subscription = {
	event: string
	deliver: Deliver
	attachments: Map<string, Promise<UnlistenFn>>
}

export const JOINED_SPACE_CHANGED_EVENT = "joined-space://changed"

const LOCAL_EVENTS: ReadonlySet<string> = new Set([
	"host://presence",
	"hosting://changed",
	JOINED_SPACE_CHANGED_EVENT,
	JOINED_SPACE_REMOVED_EVENT,
	JOINED_SPACE_MEMBERS_CHANGED_EVENT,
	INVITATION_CHANGED_EVENT,
	DEVICE_APPROVAL_CHANGED_EVENT,
	DEVICE_APPROVAL_REQUESTED_EVENT,
	DEVICE_APPROVAL_SETTLED_EVENT,
	"window-maximize-button",
	"notification://activated",
	"user://first-run-done",
	"companion://created",
	"companion://seed-refused",
	"account://changed",
	"agent://sign-in-started",
])

type JoinedHostsListenOptions = {
	local: LocalHost
	hosts: ReadonlyMap<string, HttpHost>
	activeHostId: () => string | null
	reportListenFailure: (reason: unknown) => UnlistenFn
}

export const isLocalEvent = (event: string) => LOCAL_EVENTS.has(event)

const stopOnceAttached = (attaching: Promise<UnlistenFn>) => {
	void attaching.then((unlisten) => unlisten())
}

export const createJoinedHostsListen = ({
	local,
	hosts,
	activeHostId,
	reportListenFailure,
}: JoinedHostsListenOptions) => {
	const subscriptions = new Set<Subscription>()

	const attach = (subscription: Subscription, id: string, host: HttpHost) => {
		const heard = (event: Event<unknown>) => {
			if (subscriptions.has(subscription)) {
				subscription.deliver(event, id)
			}
		}
		subscription.attachments.set(
			id,
			host.listen(subscription.event, heard).catch(reportListenFailure),
		)
	}

	const attachHost = (id: string, host: HttpHost) => {
		for (const subscription of subscriptions) {
			attach(subscription, id, host)
		}
	}

	const detachHost = (id: string) => {
		for (const { attachments } of subscriptions) {
			const attaching = attachments.get(id)
			attachments.delete(id)
			if (attaching) {
				stopOnceAttached(attaching)
			}
		}
	}

	const listenToJoinedHosts = (event: string, deliver: Deliver): UnlistenFn => {
		const subscription: Subscription = {
			event,
			deliver,
			attachments: new Map(),
		}
		subscriptions.add(subscription)
		for (const [id, host] of hosts) {
			attach(subscription, id, host)
		}
		return () => {
			subscriptions.delete(subscription)
			subscription.attachments.forEach(stopOnceAttached)
		}
	}

	const listen = async <T>(
		event: string,
		handler: HostEventCallback<T>,
	): Promise<UnlistenFn> => {
		const stopLocal = await local.listen<T>(event, (heard) =>
			handler(heard, null),
		)
		if (isLocalEvent(event)) {
			return stopLocal
		}
		const stopJoined = listenToJoinedHosts(event, handler as Deliver)
		return () => {
			stopLocal()
			stopJoined()
		}
	}

	const listenToActiveHost = async <T>(
		event: string,
		handler: HostEventCallback<T>,
	): Promise<UnlistenFn> =>
		listenToJoinedHosts(event, (heard, id) => {
			if (activeHostId() === id) {
				handler(heard as Event<T>, id)
			}
		})

	return { attachHost, detachHost, listen, listenToActiveHost }
}
