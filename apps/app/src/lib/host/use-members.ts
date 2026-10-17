import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
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
import {
	type MemberAction,
	type MemberActionRefusal,
	membersAfter,
	refusalOf,
	toSpaceMember,
} from "./member-actions"
import { heldMembersOf, membersQueryOf, NO_MEMBERS } from "./members-query"
import { type MembersTransport, membersTransport } from "./members-transport"

import { HOSTING_MEMBERS_CHANGED_EVENT, type Member } from "../bindings"
import { useInvalidateOnHostEvent } from "../query/host-invalidations"
import { isFirstReadPending } from "../query/last-read"

export type MembersProps = Pick<
	MembersPanelProps,
	| "members"
	| "isPending"
	| "email"
	| "onEmailChange"
	| "onInvite"
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
}

const NOT_REFUSED: MemberActionRefusal = {}

const withdrawnNotice = (member: Member): NoticeMessage => ({
	title: i18n.t("settings:space.members.withdrawn", { email: member.email }),
})

const hostFirst = (members: Member[]) => [
	...members.filter((member) => member.status === "host"),
	...members.filter((member) => member.status !== "host"),
]

export const useMembers = (
	openSpace: HostedSpace | null,
	isHosted: boolean,
	{
		transport = membersTransport,
		reportSuccess = raiseTransientNotice,
	}: MembersOptions = {},
): MembersProps | undefined => {
	const queryClient = useQueryClient()
	const [email, setEmail] = useState("")
	const [removing, setRemoving] = useState<Member | null>(null)
	const shownSpace = isDesktopHost() ? openSpace : null
	const watchedId = isHosted ? shownSpace?.id : undefined

	const membersRead = useQuery(membersQueryOf(watchedId, transport))
	const { data: members = NO_MEMBERS } = membersRead
	useInvalidateOnHostEvent(HOSTING_MEMBERS_CHANGED_EVENT, [
		hostQueryKeys.members(),
	])

	const memberAction = useMutation({
		mutationFn: (run: MemberAction) =>
			membersAfter(transport, run, heldMembersOf(queryClient, run.spaceId)),
		onSuccess: (answered, run) => {
			queryClient.setQueryData(hostQueryKeys.membersOf(run.spaceId), answered)
			if (run.action === "invite") setEmail("")
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

	const runOnWatched = (run: (spaceId: string) => MemberAction) => {
		if (watchedId) memberAction.mutate(run(watchedId))
	}

	if (!shownSpace) return undefined
	return {
		members: isHosted ? hostFirst(members).map(toSpaceMember) : [],
		isPending: isFirstReadPending(membersRead),
		email,
		onEmailChange: (typed) => {
			setEmail(typed)
			if (refusal) memberAction.reset()
		},
		onInvite: (invited) =>
			runOnWatched((spaceId) => ({
				action: "invite",
				spaceId,
				email: invited,
			})),
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
