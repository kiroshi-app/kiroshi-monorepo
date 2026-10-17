import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo } from "react"

import {
	createJoinedSpacesController,
	hostMarksOf,
	type JoinedSpacesController,
	type JoinedSpacesState,
	openJoinedSpaceOf,
	openRowIdOf,
	switcherSpacesOf,
} from "./joined-spaces-controller"
import {
	isHostDown,
	isHostOnline,
	type OpenJoinedHost,
} from "./open-joined-host"
import type { SpacesController, SpacesState } from "./spaces-controller"
import type { Invitations } from "./use-invitations"

import { isDesktopHost, joinedHosts } from "../host"
import { useController, useControllerState } from "../use-controller"
import type { JoinedHostsState } from "../host/joined-hosts"
import { sharedMarksOf } from "../host/shared-spaces-controller"
import { useSharedSpaces } from "../host/use-shared-spaces"

export type JoinedSpaces = {
	state: JoinedSpacesState
	controller: JoinedSpacesController
	hosts: JoinedHostsState
}

export const useJoinedSpaces = (spaces: SpacesController): JoinedSpaces => {
	const queryClient = useQueryClient()
	const { state, controller } = useController(() =>
		createJoinedSpacesController({ queryClient, spaces }),
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
	const { joinedSpaces, openId } = state
	const { connections } = hosts
	const sharedBySpaceId = useSharedSpaces(spaces)
	return useMemo(
		() => ({
			spaces: switcherSpacesOf(spaces, joinedSpaces),
			selectedSpaceId: openRowIdOf({ joinedSpaces, openId }, selectedSpaceId),
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
			connections,
			sharedBySpaceId,
			invitations,
		],
	)
}

export const useOpenJoinedHost = (
	selectedSpaceId: string | null,
	{ state, hosts, controller }: JoinedSpaces,
): OpenJoinedHost | null => {
	const { joinedSpaces, openId } = state
	const { connections } = hosts
	return useMemo(() => {
		const open = openJoinedSpaceOf(joinedSpaces, openId, selectedSpaceId)
		return open
			? {
					spaceName: open.name,
					hostName: controller.hostNameOf(open.id),
					isOnline: isHostOnline(connections[open.id]),
					isDown: isHostDown(connections[open.id]),
				}
			: null
	}, [joinedSpaces, openId, selectedSpaceId, connections, controller])
}
