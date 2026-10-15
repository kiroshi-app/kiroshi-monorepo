import {
	hashKey,
	type QueryClient,
	type QueryKey,
	useQueryClient,
} from "@tanstack/react-query"
import { useEffect } from "react"

import { joinedHosts, listen, onHostReconnected } from "@/lib/host"
import { isLocalEvent } from "@/lib/host/joined-hosts-listen"
import { LOCAL_HOST } from "@/lib/host/use-reachable-host"
import {
	isJoinedRowId,
	joinedRowIdOf,
} from "@/lib/spaces/joined-spaces-controller"

const reportUnheardEvent = (event: string) => (reason: unknown) => {
	console.error(`query: ${event} could not be listened to`, reason)
}

const otherHostIdsThan = (hostId: string) =>
	new Set(
		Object.keys(joinedHosts.getState().connections).filter(
			(id) => id !== hostId,
		),
	)

const namesAnotherHostThan = (hostId: string) => {
	const otherHostIds = otherHostIdsThan(hostId)
	const isOtherHost = (segment: unknown) =>
		typeof segment === "string" &&
		(segment === LOCAL_HOST ||
			otherHostIds.has(segment) ||
			(isJoinedRowId(segment) && segment !== joinedRowIdOf(hostId)))
	return (queryKey: QueryKey) => queryKey.some(isOtherHost)
}

const concernsShownSpace = (event: string, hostId: string | null) =>
	isLocalEvent(event) || hostId === joinedHosts.getState().active

export const invalidateOnHostReconnect = (queryClient: QueryClient) =>
	onHostReconnected((hostId) => {
		const namesAnotherHost = namesAnotherHostThan(hostId)
		queryClient.invalidateQueries({
			predicate: ({ meta, queryKey }) =>
				!meta?.rereadsItselfOnReconnect && !namesAnotherHost(queryKey),
		})
	})

export const useInvalidateOnHostEvent = (
	event: string,
	queryKeys: readonly QueryKey[],
) => {
	const queryClient = useQueryClient()
	const keysHash = hashKey(queryKeys)

	useEffect(() => {
		const keys: QueryKey[] = JSON.parse(keysHash)
		const invalidate = (_heard: unknown, hostId: string | null) => {
			if (!concernsShownSpace(event, hostId)) {
				return
			}
			for (const queryKey of keys) {
				void queryClient
					.cancelQueries({ queryKey })
					.then(() => queryClient.invalidateQueries({ queryKey }))
			}
		}
		const subscription = listen(event, invalidate).catch(
			reportUnheardEvent(event),
		)
		return () => {
			subscription.then((unlisten) => unlisten?.())
		}
	}, [event, keysHash, queryClient])
}
