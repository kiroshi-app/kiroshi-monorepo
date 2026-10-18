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
import type { JoinedSpacesController } from "./joined-spaces-controller"
import { spaceQueryKeys } from "./space-query-keys"

import { INVITATION_CHANGED_EVENT, type Invitation } from "../bindings"
import { isDesktopHost } from "../host"
import { joinRejectionNoticeOf } from "../host/join-refusal"
import { useInvalidateOnHostEvent } from "../query/host-invalidations"

type InvitationStatus =
	| { state: "accepting"; invitation: Invitation }
	| { state: "withdrawn" }
	| { state: "failed"; failure: SpaceInvitationFailure }

export type Invitations = {
	rows: SpaceInvitation[]
	accept: (id: string) => void
	decline: (id: string) => void
	sweepWithdrawn: () => void
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
	const stillAccepting = Object.values(statuses).flatMap((status) =>
		status.state === "accepting" &&
		!kept.some(isSameInvitation(status.invitation))
			? [status.invitation]
			: [],
	)
	return [...kept, ...stillAccepting]
}

const rowOf =
	(statuses: Statuses) =>
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
		return { ...base, state: status?.state ?? "waiting" }
	}

export const useInvitations = (
	joinedSpaces: Pick<JoinedSpacesController, "admit">,
	{ transport = invitationsTransport }: InvitationsOptions = {},
): Invitations => {
	const queryClient = useQueryClient()
	const queryKey = spaceQueryKeys.invitations()
	const [statuses, setStatuses] = useState<Statuses>({})
	const [swept, setSwept] = useState<string[]>([])

	const { data: listed = NO_INVITATIONS } = useQuery({
		queryKey,
		queryFn: isDesktopHost() ? () => readInvitations(transport) : skipToken,
		meta: NOTICED,
	})
	useInvalidateOnHostEvent(INVITATION_CHANGED_EVENT, [queryKey])

	const mark = (invitation: Invitation, status: InvitationStatus | null) =>
		setStatuses((held) => withStatus(held, invitation, status))

	const drop = (invitation: Invitation) => {
		mark(invitation, null)
		queryClient.setQueryData<Invitation[]>(queryKey, (held) =>
			held?.filter((listedOne) => !isSameInvitation(invitation)(listedOne)),
		)
	}

	const acceptRun = useMutation({
		mutationFn: (invitation: Invitation) =>
			acceptOutcomeOf(transport, invitation.id),
		onMutate: (invitation) =>
			mark(invitation, { state: "accepting", invitation }),
		onSuccess: async (outcome, invitation) => {
			if (outcome.kind === "withdrawn") {
				mark(invitation, { state: "withdrawn" })
				return
			}
			if (outcome.kind === "failed") {
				mark(invitation, { state: "failed", failure: outcome.failure })
				return
			}
			drop(invitation)
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

	const accept = acceptRun.mutate
	const decline = declineRun.mutate

	return useMemo(() => {
		const shown = shownInvitationsOf(listed, statuses, swept)
		const shownWithId = (id: string) =>
			shown.find((invitation) => invitation.instanceId === id)
		const stateOf = (invitation: Invitation) =>
			statuses[identityOf(invitation)]?.state
		const isWithdrawn = (invitation: Invitation) =>
			stateOf(invitation) === "withdrawn"

		return {
			rows: shown.map(rowOf(statuses)),
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
	}, [listed, statuses, swept, accept, decline])
}
