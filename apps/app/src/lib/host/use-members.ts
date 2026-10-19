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
import { formatDateTime } from "@workspace/ui/lib/time-format"

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
	type MembersError,
	type SpaceInvitation,
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

const HOST_NOT_REMOVABLE: MembersError = { kind: "hostNotRemovable" }

const withdrawnNotice = (member: Member): NoticeMessage => ({
	title: i18n.t("settings:space.members.withdrawn", { email: member.email }),
	description: i18n.t("settings:space.members.withdrawnDescription"),
})

const SENT_UNTIL: Intl.DateTimeFormatOptions = { month: "long", day: "numeric" }

const sentNotice = ({ email, expiresAt }: SpaceInvitation): NoticeMessage => ({
	title: i18n.t("settings:space.members.sent", { email }),
	description: i18n.t("settings:space.members.sentDescription", {
		date: formatDateTime(Date.parse(expiresAt), SENT_UNTIL),
	}),
})

const sentInvitationIn = (answered: HostedMember[], email: string) =>
	answered.find(
		(member) =>
			member.invitation?.state === "invited" &&
			isSameEmail(member.email, email),
	)?.invitation

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

	const isJoinedHost = (member: Member | null): member is Member =>
		joinedId !== undefined && member?.status === "host"

	const memberAction = useMutation({
		mutationFn: async (run: MemberAction) => {
			if (run.action === "remove" && isJoinedHost(run.member)) {
				throw HOST_NOT_REMOVABLE
			}
			return membersAfter(transport, run, heldMembers(run.spaceId))
		},
		onSuccess: (answered, run) => {
			queryClient.setQueryData(hostQueryKeys.membersOf(run.spaceId), answered)
			const reportSentTo = (email: string) => {
				const sent = sentInvitationIn(answered, email)
				if (sent) reportSuccess(sentNotice(sent))
			}
			if (run.action === "invite") {
				setEmail("")
				reportSentTo(run.email)
			}
			if (run.action === "resend") {
				setEmail((held) => (isSameEmail(held, run.member.email) ? "" : held))
				reportSentTo(run.member.email)
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

	const inviteOf =
		(invited: string) =>
		(spaceId: string): MemberAction => {
			const expired = members.find(
				(member) => isExpired(member) && isSameEmail(member.email, invited),
			)
			return expired
				? { action: "resend", spaceId, member: expired }
				: { action: "invite", spaceId, email: invited }
		}

	const runOnWatched = (run: (spaceId: string) => MemberAction) => {
		if (watchedId) memberAction.mutate(run(watchedId))
	}

	const removalOf =
		(member: Member) =>
		(spaceId: string): MemberAction => ({ action: "remove", spaceId, member })

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
		onRemove: (member) => {
			const asked = memberOf(member.id) ?? null
			if (isJoinedHost(asked)) {
				runOnWatched(removalOf(asked))
				return
			}
			setRemoving(asked)
		},
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
			runOnWatched(removalOf(removing))
		},
		onRemoveCancel: () => setRemoving(null),
	}
}
