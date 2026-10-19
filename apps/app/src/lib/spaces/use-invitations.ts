import {
	skipToken,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query"
import { useMemo, useState } from "react"

import type {
	SpaceInvitation,
	SpaceInvitationFailure,
} from "@workspace/ui/components/space-invitations"

import {
	acceptOutcomeOf,
	declineOutcomeOf,
	type InvitationsTransport,
	invitationsTransport,
	readInvitations,
	refusalNoticeOf,
} from "./invitations-transport"
import { heldJoinedMembersOf } from "./joined-space-members"
import type {
	JoinedSpacesController,
	JoinedSpacesState,
} from "./joined-spaces-controller"
import { spaceQueryKeys } from "./space-query-keys"
import { useJoinLinks } from "./use-join-links"

import {
	INVITATION_CHANGED_EVENT,
	type Invitation,
	type JoinedSpace,
	type JoinedSpaceError,
} from "../bindings"
import { isDesktopHost } from "../host"
import { useControllerState } from "../use-controller"
import { joinRejectionNoticeOf } from "../host/join-refusal"
import { hostAmong } from "../host/member-names"
import { useInvalidateOnHostEvent } from "../query/host-invalidations"

type InvitationStatus =
	| { state: "accepting"; invitation: Invitation }
	| { state: "admitted"; invitation: Invitation; joinedId: string }
	| { state: "withdrawn" }
	| { state: "expired" }
	| { state: "failed"; failure: SpaceInvitationFailure }

export type Invitations = {
	rows: SpaceInvitation[]
	accept: (id: string) => void
	decline: (id: string) => void
	sweepWithdrawn: () => void
}

type AdmittingSpaces = Pick<JoinedSpacesController, "admit" | "subscribe"> & {
	getState: () => Pick<JoinedSpacesState, "joinedSpaces">
}

type InvitationsOptions = {
	transport?: InvitationsTransport
}

const NO_INVITATIONS: Invitation[] = []

const RAISED_IN = "use-invitations"

const NOTICED = { failureNotice: refusalNoticeOf, raisedIn: RAISED_IN }

const ACCEPT_NOTICED = {
	failureNotice: joinRejectionNoticeOf,
	raisedIn: RAISED_IN,
}

const NO_INVITATION: JoinedSpaceError = {
	kind: "noInvitation",
	inviterEmail: null,
}

const isListedIn = (
	invitations: Invitation[] | undefined,
	invitationId: string,
) => invitations?.some((invitation) => invitation.id === invitationId) ?? false

const identityOf = ({ instanceId, invitedAt }: Invitation) =>
	`${instanceId}@${invitedAt}`

const isSameInvitation = (left: Invitation) => (right: Invitation) =>
	identityOf(left) === identityOf(right)

type Statuses = Record<string, InvitationStatus>

const withStatus = (
	statuses: Statuses,
	invitation: Invitation,
	status: InvitationStatus | null,
): Statuses => {
	const { [identityOf(invitation)]: _previous, ...others } = statuses
	return status ? { ...others, [identityOf(invitation)]: status } : others
}

const shownInvitationsOf = (
	listed: Invitation[],
	statuses: Statuses,
	swept: string[],
) => {
	const kept = listed.filter(
		(invitation) => !swept.includes(identityOf(invitation)),
	)
	const stillHeld = Object.values(statuses).flatMap((status) =>
		(status.state === "accepting" || status.state === "admitted") &&
		!kept.some(isSameInvitation(status.invitation))
			? [status.invitation]
			: [],
	)
	return [...kept, ...stillHeld]
}

const expiryOf = (invitation: Invitation) => Date.parse(invitation.expiresAt)

const hasExpired = (invitation: Invitation, now: number) =>
	expiryOf(invitation) <= now

const isWaitingSpace = (joinedId: string) => (joined: JoinedSpace) =>
	joined.id === joinedId && joined.state === "waitingForHost"

const isAdmittedOnline =
	(statuses: Statuses, joinedSpaces: JoinedSpace[]) =>
	(invitation: Invitation) => {
		const status = statuses[identityOf(invitation)]
		return (
			status?.state === "admitted" &&
			!joinedSpaces.some(isWaitingSpace(status.joinedId))
		)
	}

const rowOf =
	(
		statuses: Statuses,
		now: number,
		hostNameOf: (joinedId: string) => string | undefined,
	) =>
	(invitation: Invitation): SpaceInvitation => {
		const status = statuses[identityOf(invitation)]
		const base = {
			id: invitation.instanceId,
			name: invitation.instanceName,
			hostEmail: invitation.inviterEmail,
		}
		if (status?.state === "failed") {
			return { ...base, state: "failed", failure: status.failure }
		}
		if (status?.state === "admitted") {
			const hostName = hostNameOf(status.joinedId)
			return { ...base, state: "hostOffline", ...(hostName && { hostName }) }
		}
		if (status?.state === "expired" || hasExpired(invitation, now)) {
			return { ...base, state: "expired", expiresAt: expiryOf(invitation) }
		}
		return { ...base, state: status?.state ?? "waiting" }
	}

export const useInvitations = (
	joinedSpaces: AdmittingSpaces,
	{ transport = invitationsTransport }: InvitationsOptions = {},
): Invitations => {
	const queryClient = useQueryClient()
	const { joinedSpaces: joined } = useControllerState(joinedSpaces)
	const queryKey = spaceQueryKeys.invitations()
	const [statuses, setStatuses] = useState<Statuses>({})
	const [swept, setSwept] = useState<string[]>([])

	const { data: listed = NO_INVITATIONS, refetch } = useQuery({
		queryKey,
		queryFn: isDesktopHost() ? () => readInvitations(transport) : skipToken,
		meta: NOTICED,
	})
	useInvalidateOnHostEvent(INVITATION_CHANGED_EVENT, [queryKey])

	const mark = (invitation: Invitation, status: InvitationStatus | null) =>
		setStatuses((held) => withStatus(held, invitation, status))

	const unlist = (invitation: Invitation) =>
		queryClient.setQueryData<Invitation[]>(queryKey, (held) =>
			held?.filter((listedOne) => !isSameInvitation(invitation)(listedOne)),
		)

	const drop = (invitation: Invitation) => {
		mark(invitation, null)
		unlist(invitation)
	}

	const acceptRun = useMutation({
		mutationFn: (invitation: Invitation) =>
			acceptOutcomeOf(transport, invitation.id),
		onMutate: (invitation) =>
			mark(invitation, { state: "accepting", invitation }),
		onSuccess: async (outcome, invitation) => {
			if (outcome.kind === "withdrawn" || outcome.kind === "expired") {
				mark(invitation, { state: outcome.kind })
				return
			}
			if (outcome.kind === "failed") {
				mark(invitation, { state: "failed", failure: outcome.failure })
				return
			}
			unlist(invitation)
			mark(invitation, {
				state: "admitted",
				invitation,
				joinedId: outcome.joined.id,
			})
			await joinedSpaces.admit(outcome.joined)
		},
		onError: (_reason, invitation) => mark(invitation, null),
		meta: ACCEPT_NOTICED,
	})

	const declineRun = useMutation({
		mutationFn: (invitation: Invitation) =>
			declineOutcomeOf(transport, invitation.id),
		onSuccess: (outcome, invitation) =>
			outcome.kind === "declined"
				? drop(invitation)
				: mark(invitation, { state: "withdrawn" }),
		onError: (_reason, invitation) => mark(invitation, null),
		meta: NOTICED,
	})

	const linkRun = useMutation({
		mutationFn: async (invitationId: string) => {
			if (isListedIn(queryClient.getQueryData(queryKey), invitationId)) return
			const refreshed = await refetch()
			if (refreshed.isError || isListedIn(refreshed.data, invitationId)) return
			throw NO_INVITATION
		},
		meta: ACCEPT_NOTICED,
	})
	useJoinLinks(transport, linkRun.mutate)

	const accept = acceptRun.mutate
	const decline = declineRun.mutate

	return useMemo(() => {
		const isGone = isAdmittedOnline(statuses, joined)
		const shown = shownInvitationsOf(listed, statuses, swept).filter(
			(invitation) => !isGone(invitation),
		)
		const hostNameOf = (joinedId: string) =>
			hostAmong(heldJoinedMembersOf(queryClient, joinedId))?.name ?? undefined
		const shownWithId = (id: string) =>
			shown.find((invitation) => invitation.instanceId === id)
		const stateOf = (invitation: Invitation) =>
			statuses[identityOf(invitation)]?.state
		const isWithdrawn = (invitation: Invitation) =>
			stateOf(invitation) === "withdrawn"

		return {
			rows: shown.map(rowOf(statuses, Date.now(), hostNameOf)),
			accept: (id) => {
				const invitation = shownWithId(id)
				if (invitation && stateOf(invitation) !== "accepting") {
					accept(invitation)
				}
			},
			decline: (id) => {
				const invitation = shownWithId(id)
				if (invitation) decline(invitation)
			},
			sweepWithdrawn: () => {
				const withdrawn = shown.filter(isWithdrawn)
				if (withdrawn.length === 0) return
				setSwept((held) => [...held, ...withdrawn.map(identityOf)])
				setStatuses((held) =>
					withdrawn.reduce(
						(kept, invitation) => withStatus(kept, invitation, null),
						held,
					),
				)
			},
		}
	}, [listed, statuses, swept, joined, queryClient, accept, decline])
}
