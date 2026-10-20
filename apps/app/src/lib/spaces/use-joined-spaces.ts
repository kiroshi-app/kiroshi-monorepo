import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo } from "react"

import {
	createJoinedSpacesController,
	type DepartedSpace,
	hostMarksOf,
	type JoinedSpacesController,
	type JoinedSpacesState,
	openJoinedSpaceOf,
	openRowIdOf,
	switcherSpacesOf,
} from "./joined-spaces-controller"
import {
	type HostWait,
	isHostDown,
	isHostOnline,
	type OpenJoinedHost,
} from "./open-joined-host"
import type { SpacesController, SpacesState } from "./spaces-controller"
import type { Invitations } from "./use-invitations"

import type { JoinedSpace } from "../bindings"
import { isDesktopHost, joinedHosts } from "../host"
import { useController, useControllerState } from "../use-controller"
import type { RosterController } from "../bots/roster-controller"
import type { JoinedHostsState } from "../host/joined-hosts"
import { sharedMarksOf } from "../host/shared-spaces-controller"
import { useSharedSpaces } from "../host/use-shared-spaces"

export type JoinedSpaces = {
	state: JoinedSpacesState
	controller: JoinedSpacesController
	hosts: JoinedHostsState
}

export const useJoinedSpaces = (
	spaces: SpacesController,
	roster: RosterController,
): JoinedSpaces => {
	const queryClient = useQueryClient()
	const { state, controller } = useController(() =>
		createJoinedSpacesController({
			queryClient,
			spaces,
			shownThreads: roster,
		}),
	)
	const hosts = useControllerState(joinedHosts)
	useQuery({ ...controller.listQuery, enabled: isDesktopHost() })

	useEffect(
		() => (isDesktopHost() ? controller.watch() : undefined),
		[controller],
	)

	return { state, controller, hosts }
}

export const useSwitcherSpaces = (
	{ spaces, selectedSpaceId }: Pick<SpacesState, "spaces" | "selectedSpaceId">,
	{ state, hosts }: JoinedSpaces,
	invitations: Invitations,
) => {
	const { joinedSpaces, openId, departed } = state
	const { connections } = hosts
	const sharedBySpaceId = useSharedSpaces(spaces)
	return useMemo(
		() => ({
			spaces: switcherSpacesOf(spaces, joinedSpaces),
			selectedSpaceId: openRowIdOf(
				{ joinedSpaces, openId, departed },
				selectedSpaceId,
			),
			hostBySpaceId: {
				...sharedMarksOf(sharedBySpaceId),
				...hostMarksOf(joinedSpaces, connections),
			},
			invitations: invitations.rows,
			onAcceptInvitation: invitations.accept,
			onDeclineInvitation: invitations.decline,
			onRetryInvitation: invitations.accept,
			onSpaceSwitcherOpenChange: (isOpen: boolean) => {
				if (!isOpen) invitations.sweepWithdrawn()
			},
		}),
		[
			spaces,
			selectedSpaceId,
			joinedSpaces,
			openId,
			departed,
			connections,
			sharedBySpaceId,
			invitations,
		],
	)
}

const hostWaitOf = (joined: JoinedSpace): HostWait | undefined =>
	joined.state === "waitingForHost"
		? { reason: joined.wait?.reason }
		: undefined

const departedHostOf = (departed: DepartedSpace): OpenJoinedHost => ({
	spaceName: departed.space,
	hostName: departed.host,
	isOnline: false,
	isDown: false,
	departure: departed.reason,
})

export const useOpenJoinedHost = (
	selectedSpaceId: string | null,
	{ state, hosts, controller }: JoinedSpaces,
): OpenJoinedHost | null => {
	const { joinedSpaces, openId, departed } = state
	const { connections } = hosts
	return useMemo(() => {
		if (departed?.spaceId === selectedSpaceId) {
			return departedHostOf(departed)
		}
		const open = openJoinedSpaceOf(joinedSpaces, openId, selectedSpaceId)
		return open
			? {
					spaceName: open.name,
					hostName: controller.hostNameOf(open.id),
					isOnline: isHostOnline(connections[open.id]),
					isDown: isHostDown(connections[open.id]),
					hostWait: hostWaitOf(open),
				}
			: null
	}, [joinedSpaces, openId, departed, selectedSpaceId, connections, controller])
}
