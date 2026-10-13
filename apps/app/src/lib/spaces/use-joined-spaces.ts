import { useEffect, useMemo } from "react"

import type { SpaceInvitationCallbacks } from "@workspace/ui/components/space-invitations"

import {
	createInvitationsController,
	type InvitationsController,
	type InvitationsState,
	invitationRowsOf,
} from "./invitations-controller"
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
	const { state, controller } = useController(() =>
		createJoinedSpacesController({ spaces }),
	)
	const hosts = useControllerState(joinedHosts)

	useEffect(
		() => (isDesktopHost() ? controller.watch() : undefined),
		[controller],
	)

	return { state, controller, hosts }
}

export type Invitations = {
	state: InvitationsState
	controller: InvitationsController
}

export const useInvitations = (
	joinedSpaces: JoinedSpacesController,
): Invitations => {
	const { state, controller } = useController(() =>
		createInvitationsController({ joinedSpaces }),
	)

	useEffect(
		() => (isDesktopHost() ? controller.watch() : undefined),
		[controller],
	)

	return { state, controller }
}

const invitationCallbacksOf = (
	controller: InvitationsController,
): Required<SpaceInvitationCallbacks> => ({
	onAcceptInvitation: (id) => {
		void controller.accept(id)
	},
	onDeclineInvitation: (id) => {
		void controller.decline(id)
	},
	onRetryInvitation: (id) => {
		void controller.accept(id)
	},
})

const sweepOnCloseOf =
	(controller: InvitationsController) => (isOpen: boolean) => {
		if (!isOpen) controller.sweepWithdrawn()
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
			invitations: invitationRowsOf(invitations.state),
			...invitationCallbacksOf(invitations.controller),
			onSpaceSwitcherOpenChange: sweepOnCloseOf(invitations.controller),
		}),
		[
			spaces,
			selectedSpaceId,
			joinedSpaces,
			openId,
			connections,
			sharedBySpaceId,
			invitations.state,
			invitations.controller,
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
					hostEmail: controller.hostEmailOf(open.id),
					isOnline: isHostOnline(connections[open.id]),
					isDown: isHostDown(connections[open.id]),
				}
			: null
	}, [joinedSpaces, openId, selectedSpaceId, connections, controller])
}
