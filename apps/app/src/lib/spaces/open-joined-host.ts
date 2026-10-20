import { createContext } from "react"

import type { PromptInputOffline } from "@workspace/ui/components/prompt-input"

import type { DepartureReason } from "./joined-spaces-controller"

import type { JoinedSpaceWaitReason } from "../bindings"
import type { JoinedHostState } from "../host/joined-hosts"

export type OpenJoinedHost = {
	spaceName: string
	hostName: string
	isOnline: boolean
	isDown: boolean
	departure?: DepartureReason
	hostWait?: HostWait
}

export type HostWait = { reason?: JoinedSpaceWaitReason }

type SpaceAccess = {
	reason: DepartureReason | "offline"
	waitReason?: JoinedSpaceWaitReason
}

export const spaceAccessOf = (
	host: OpenJoinedHost | null,
): SpaceAccess | undefined => {
	if (host?.departure) return { reason: host.departure }
	if (host?.hostWait) {
		return { reason: "offline", waitReason: host.hostWait.reason }
	}
	return undefined
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
