import { useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"

import { routineQueryKeys } from "./routine-query-keys"
import { routinesTransport } from "./routines-transport"

export const useRoutineAnnouncements = (conversationId: string | null) => {
	const queryClient = useQueryClient()

	useEffect(() => {
		if (!conversationId) {
			return
		}

		const listening = routinesTransport
			.onChanged((changed) => {
				if (changed.conversationId !== conversationId) {
					return
				}
				queryClient.invalidateQueries({
					queryKey: routineQueryKeys.conversation(conversationId),
				})
				queryClient.invalidateQueries({ queryKey: routineQueryKeys.runs() })
			})
			.catch((reason) => {
				console.error(
					"routines panel: routine changes could not be listened to",
					reason,
				)
				return () => undefined
			})

		return () => {
			void listening.then((unsubscribe) => unsubscribe())
		}
	}, [conversationId, queryClient])
}
