import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react"

import { i18n } from "@workspace/ui/lib/i18n"

import type {
	Application,
	ApplicationInstall,
	ApplicationPort,
} from "./application-port"
import type { ReopenedScope } from "./session-reopening"

import { raiseReportedFailure } from "../failure-report"
import type { Space } from "../conversations/store-contract"
import { isHostOffline } from "../host/host-offline"
import { useHostReconnections } from "../host/use-host-reconnections"

export type ConversationApplications = {
	port: ApplicationPort
	curated: Application[]
	spaces: Space[]
	onOpen: (scope: ReopenedScope, server?: string) => void
}

export const ConversationApplicationsContext =
	createContext<ConversationApplications | null>(null)

type InstallsRead = {
	conversationId: string
	installs: ApplicationInstall[]
}

const NO_INSTALLS: ApplicationInstall[] = []

const landedRead =
	(conversationId: string, installs: ApplicationInstall[]) =>
	(current: InstallsRead | null): InstallsRead | null =>
		installs.length === 0 && (current?.installs.length ?? 0) === 0
			? current
			: { conversationId, installs }

export const useConversationInstalls = (
	conversationId: string | null,
): ApplicationInstall[] => {
	const port = useContext(ConversationApplicationsContext)?.port
	const [read, setRead] = useState<InstallsRead | null>(null)
	const reads = useRef(0)

	const reload = useCallback(() => {
		if (!port || !conversationId) {
			return
		}
		reads.current += 1
		const ticket = reads.current

		port.installs(conversationId).then(
			(installs) => {
				if (ticket === reads.current) {
					setRead(landedRead(conversationId, installs))
				}
			},
			(reason) => {
				if (ticket !== reads.current) {
					return
				}
				console.error("applications: installs could not be read", reason)
				setRead(landedRead(conversationId, NO_INSTALLS))
				if (!isHostOffline(reason)) {
					raiseReportedFailure(
						{
							title: i18n.t("chat:applicationInstall.unreadable"),
						},
						{ raisedIn: "use-conversation-installs" },
					)
				}
			},
		)
	}, [port, conversationId])

	useEffect(reload, [reload])

	useHostReconnections(reload)

	useEffect(() => {
		if (!port) {
			return
		}
		let isListening = true

		const listening = port
			.onInstalled((installed) => {
				if (isListening && installed.conversationId === conversationId) {
					reload()
				}
			})
			.catch((reason) => {
				console.error("applications: installs could not be listened to", reason)
				return () => undefined
			})

		return () => {
			isListening = false
			void listening.then((unsubscribe) => unsubscribe())
		}
	}, [port, conversationId, reload])

	return read?.conversationId === conversationId ? read.installs : NO_INSTALLS
}
