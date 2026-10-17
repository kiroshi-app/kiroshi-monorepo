import { createContext } from "react"

import type { PromptInputOffline } from "@workspace/ui/components/prompt-input"

import type { JoinedHostState } from "../host/joined-hosts"

export type OpenJoinedHost = {
	spaceName: string
	hostName: string
	isOnline: boolean
	isDown: boolean
}

export const isHostOnline = (connection: JoinedHostState | undefined) =>
	connection?.status === "up"

export const isHostDown = (connection: JoinedHostState | undefined) =>
	connection?.status === "down"

export const composerOfflineOf = (
	host: OpenJoinedHost | null,
): PromptInputOffline | undefined =>
	host?.isDown
		? { spaceName: host.spaceName, hostName: host.hostName }
		: undefined

export const OpenJoinedHostContext = createContext<OpenJoinedHost | null>(null)
