import { joinedHosts } from "./index"
import type { JoinedHostsState } from "./joined-hosts"

import { useControllerState } from "../use-controller"

export const LOCAL_HOST = "local"

const reachableHostOf = (
	host: string | null,
	{ connections }: JoinedHostsState,
): string | null => {
	if (host === null) {
		return LOCAL_HOST
	}
	const status = connections[host]?.status
	return status === "down" || status === "refused" ? null : host
}

export const joinedHostIdOf = (reachableHost: string): string | null =>
	reachableHost === LOCAL_HOST ? null : reachableHost

export const useReachableHost = (): string | null => {
	const state = useControllerState(joinedHosts)
	return reachableHostOf(state.active, state)
}

export const useReachableHostOf = (host: string | null): string | null =>
	reachableHostOf(host, useControllerState(joinedHosts))
