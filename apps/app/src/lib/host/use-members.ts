import {
	skipToken,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query"
import { useState } from "react"

import {
	type NoticeMessage,
	raiseTransientNotice,
} from "@workspace/ui/components/notice-surface"
import type { MembersPanelProps } from "@workspace/ui/components/space-settings-dialog/members-panel"
import { i18n } from "@workspace/ui/lib/i18n"

import { hostQueryKeys } from "./host-query-keys"
import type { HostedSpace } from "./hosting-transport"
import { isDesktopHost } from "./index"
import { fingerprintIn, hostFirst, joinedMembersOf } from "./joined-members"
import {
	type MemberAction,
	type MemberActionRefusal,
	membersAfter,
	readMembers,
	refusalOf,
	toSpaceMember,
} from "./member-actions"
import {
	type HostedMember,
	isExpired,
	isSameEmail,
	type MembersTransport,
	membersTransport,
} from "./members-transport"

import {
	HOSTING_MEMBERS_CHANGED_EVENT,
	JOINED_SPACE_MEMBERS_CHANGED_EVENT,
	type Member,
} from "../bindings"
import { useInvalidateOnHostEvent } from "../query/host-invalidations"
import { isFirstReadPending } from "../query/last-read"
import {
	joinedSpaceMembersQueryOf,
	membersReadFailure,
	NO_JOINED_MEMBERS,
} from "../spaces/joined-space-members"
import { spaceQueryKeys } from "../spaces/space-query-keys"

export type MembersProps = Pick<
	MembersPanelProps,
	| "members"
	| "isPending"
	| "email"
	| "onEmailChange"
	| "onInvite"
	| "blockedBy"
	| "refusal"
	| "failure"
	| "removing"
	| "onRemove"
	| "onWithdraw"
	| "onRemoveConfirm"
	| "onRemoveCancel"
>

type MembersOptions = {
	transport?: MembersTransport
	reportSuccess?: (message: NoticeMessage) => void
	joinedId?: string
	isHostOffline?: boolean
	isSignedOut?: boolean
}

const NO_MEMBERS: HostedMember[] = []

const NOT_REFUSED: MemberActionRefusal = {}

const withdrawnNotice = (member: Member): NoticeMessage => ({
	title: i18n.t("settings:space.members.withdrawn", { email: member.email }),
})

const inviteBlockerOf = (
	isSignedOut: boolean,
	joinedId: string | undefined,
): MembersProps["blockedBy"] =>
	isSignedOut && !joinedId ? "signedOut" : undefined

export const useMembers = (
	openSpace: HostedSpace | null,
	isHosted: boolean,
	{
		transport = membersTransport,
		reportSuccess = raiseTransientNotice,
		joinedId,
		isHostOffline = false,
		isSignedOut = false,
	}: MembersOptions = {},
): MembersProps | undefined => {
	const queryClient = useQueryClient()
	const [email, setEmail] = useState("")
	const [removing, setRemoving] = useState<Member | null>(null)
	const shownSpace = isDesktopHost() ? openSpace : null
	const watchedId = isHosted ? shownSpace?.id : undefined

	const readId = isHostOffline ? undefined : watchedId
	const hostRead = useQuery({
		queryKey: hostQueryKeys.membersOf(watchedId),
		queryFn: readId ? () => readMembers(transport, readId) : skipToken,
		meta: { failureNotice: membersReadFailure, raisedIn: "use-members" },
	})
	const rosterRead = useQuery(joinedSpaceMembersQueryOf(watchedId && joinedId))
	const { data: roster = NO_JOINED_MEMBERS } = rosterRead
	const members = joinedId
		? joinedMembersOf(roster, hostRead.data)
		: hostFirst(hostRead.data ?? NO_MEMBERS)
	const rowOf = (member: Member) => ({
		...toSpaceMember(member),
		fingerprint: fingerprintIn(roster, member.userId),
	})
	useInvalidateOnHostEvent(HOSTING_MEMBERS_CHANGED_EVENT, [
		hostQueryKeys.members(),
	])
	useInvalidateOnHostEvent(JOINED_SPACE_MEMBERS_CHANGED_EVENT, [
		spaceQueryKeys.joinedMembers(),
	])

	const heldMembers = (spaceId: string) =>
		queryClient.getQueryData<HostedMember[]>(
			hostQueryKeys.membersOf(spaceId),
		) ?? NO_MEMBERS

	const memberAction = useMutation({
		mutationFn: (run: MemberAction) =>
			membersAfter(transport, run, heldMembers(run.spaceId)),
		onSuccess: (answered, run) => {
			queryClient.setQueryData(hostQueryKeys.membersOf(run.spaceId), answered)
			if (run.action === "invite") setEmail("")
			if (run.action === "resend") {
				setEmail((held) => (isSameEmail(held, run.member.email) ? "" : held))
			}
			if (run.action === "withdraw") reportSuccess(withdrawnNotice(run.member))
		},
		meta: { rendersErrorInline: true },
	})

	const ownRun =
		memberAction.variables?.spaceId === watchedId
			? memberAction.variables
			: null
	const { refusal, failure } =
		ownRun && memberAction.isError
			? refusalOf(ownRun, memberAction.error)
			: NOT_REFUSED

	const memberOf = (userId: string) =>
		members.find((member) => member.userId === userId)

	const expiredOf = (email: string) =>
		members.find(
			(member) => isExpired(member) && isSameEmail(member.email, email),
		)

	const inviteOf =
		(invited: string) =>
		(spaceId: string): MemberAction => {
			const expired = expiredOf(invited)
			return expired
				? { action: "resend", spaceId, member: expired }
				: { action: "invite", spaceId, email: invited }
		}

	const runOnWatched = (run: (spaceId: string) => MemberAction) => {
		if (watchedId) memberAction.mutate(run(watchedId))
	}

	if (!shownSpace) return undefined
	return {
		members: isHosted ? members.map(rowOf) : [],
		isPending: isFirstReadPending(joinedId ? rosterRead : hostRead),
		email,
		onEmailChange: (typed) => {
			setEmail(typed)
			if (refusal) memberAction.reset()
		},
		onInvite: (invited) => runOnWatched(inviteOf(invited)),
		blockedBy: inviteBlockerOf(isSignedOut, joinedId),
		refusal,
		failure,
		removing: removing ? toSpaceMember(removing) : null,
		onRemove: (member) => setRemoving(memberOf(member.id) ?? null),
		onWithdraw: (member) => {
			const withdrawn = memberOf(member.id)
			if (withdrawn) {
				runOnWatched((spaceId) => ({
					action: "withdraw",
					spaceId,
					member: withdrawn,
				}))
			}
		},
		onRemoveConfirm: () => {
			if (!removing) return
			setRemoving(null)
			runOnWatched((spaceId) => ({
				action: "remove",
				spaceId,
				member: removing,
			}))
		},
		onRemoveCancel: () => setRemoving(null),
	}
}
