import type { EventCallback, UnlistenFn } from "@tauri-apps/api/event"

import type { HttpHost } from "./http"
import type { LocalHost } from "./joined-hosts-invoke"

import {
	INVITATION_CHANGED_EVENT,
	JOINED_SPACE_REMOVED_EVENT,
} from "../bindings"

export type Listen = HttpHost["listen"]

type Route = (event: string) => Listen

type Subscription = {
	event: string
	handler: EventCallback<unknown>
	route: Route
	source: Listen
	unlisten: UnlistenFn
}

export const JOINED_SPACE_CHANGED_EVENT = "joined-space://changed"

const LOCAL_EVENTS: ReadonlySet<string> = new Set([
	"host://presence",
	"hosting://changed",
	JOINED_SPACE_CHANGED_EVENT,
	JOINED_SPACE_REMOVED_EVENT,
	INVITATION_CHANGED_EVENT,
	"window-maximize-button",
	"notification://activated",
	"user://first-run-done",
	"companion://created",
	"companion://seed-refused",
	"account://changed",
	"agent://sign-in-started",
])

const unheard: Listen = async () => () => undefined

type JoinedHostsListenOptions = {
	local: LocalHost
	activeHost: () => HttpHost | undefined
	reportListenFailure: (reason: unknown) => UnlistenFn
}

export const createJoinedHostsListen = ({
	local,
	activeHost,
	reportListenFailure,
}: JoinedHostsListenOptions) => {
	const subscriptions = new Set<Subscription>()

	const listenerFor = (event: string): Listen => {
		const joined = LOCAL_EVENTS.has(event) ? undefined : activeHost()
		return joined ? joined.listen : local.listen
	}

	const relocate = (subscription: Subscription) => {
		const source = subscription.route(subscription.event)
		if (source === subscription.source) {
			return
		}
		subscription.unlisten()
		subscription.source = source
		const attached = source(subscription.event, subscription.handler).catch(
			reportListenFailure,
		)
		subscription.unlisten = () => {
			attached.then((unlisten) => unlisten())
		}
		attached.then((unlisten) => {
			if (subscription.source === source && subscriptions.has(subscription)) {
				subscription.unlisten = unlisten
			}
		})
	}

	const relocateAll = () => {
		for (const subscription of subscriptions) {
			relocate(subscription)
		}
	}

	const routedListen =
		(route: Route): Listen =>
		async (event, handler) => {
			const source = route(event)
			const subscription: Subscription = {
				event,
				handler: handler as EventCallback<unknown>,
				route,
				source,
				unlisten: await source(event, handler),
			}
			subscriptions.add(subscription)
			relocate(subscription)
			return () => {
				subscriptions.delete(subscription)
				subscription.unlisten()
			}
		}

	const listen = routedListen(listenerFor)

	const listenToActiveHost = routedListen(() => activeHost()?.listen ?? unheard)

	return { relocateAll, listen, listenToActiveHost }
}
