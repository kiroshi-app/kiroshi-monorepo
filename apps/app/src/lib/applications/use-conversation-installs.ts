import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query"
import { createContext, useContext, useEffect } from "react"

import { i18n } from "@workspace/ui/lib/i18n"

import type {
	Application,
	ApplicationInstall,
	ApplicationPort,
} from "./application-port"
import { applicationQueryKeys } from "./application-query-keys"
import type { ReopenedScope } from "./session-reopening"

import type { Space } from "../conversations/store-contract"
import { isHostOffline } from "../host/host-offline"

export type ConversationApplications = {
	port: ApplicationPort
	curated: Application[]
	spaces: Space[]
	onOpen: (scope: ReopenedScope, server?: string) => void
}

export const ConversationApplicationsContext =
	createContext<ConversationApplications | null>(null)

const NO_INSTALLS: ApplicationInstall[] = []

const useRereadOnInstall = (port: ApplicationPort | undefined) => {
	const queryClient = useQueryClient()

	useEffect(() => {
		if (!port) {
			return
		}
		const listening = port
			.onInstalled(({ conversationId }) => {
				queryClient.invalidateQueries({
					queryKey: applicationQueryKeys.conversationInstalls(conversationId),
				})
			})
			.catch((reason) => {
				console.error("applications: installs could not be listened to", reason)
				return () => undefined
			})

		return () => {
			void listening.then((unsubscribe) => unsubscribe())
		}
	}, [port, queryClient])
}

export const useConversationInstalls = (
	conversationId: string | null,
): ApplicationInstall[] => {
	const port = useContext(ConversationApplicationsContext)?.port
	const { data = NO_INSTALLS, isError } = useQuery({
		queryKey: applicationQueryKeys.conversationInstalls(conversationId),
		queryFn:
			port && conversationId ? () => port.installs(conversationId) : skipToken,
		meta: {
			failureNotice: () => ({
				title: i18n.t("chat:applicationInstall.unreadable"),
			}),
			raisedIn: "use-conversation-installs",
			isSilentOn: isHostOffline,
		},
	})

	useRereadOnInstall(port)

	return isError ? NO_INSTALLS : data
}
