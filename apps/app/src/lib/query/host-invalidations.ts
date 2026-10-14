import {
	hashKey,
	type QueryClient,
	type QueryKey,
	useQueryClient,
} from "@tanstack/react-query"
import { useEffect } from "react"

import { listen, onHostReconnected } from "@/lib/host"

const reportUnheardEvent = (event: string) => (reason: unknown) => {
	console.error(`query: ${event} could not be listened to`, reason)
}

export const invalidateOnHostReconnect = (queryClient: QueryClient) =>
	onHostReconnected(() => {
		queryClient.invalidateQueries({
			predicate: ({ meta }) => !meta?.rereadsItselfOnReconnect,
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
		const invalidate = () => {
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
