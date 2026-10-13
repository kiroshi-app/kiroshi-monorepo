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
import {
	type MemberAction,
	type MemberActionRefusal,
	membersAfter,
	readMembers,
	refusalOf,
	toSpaceMember,
} from "./member-actions"
import { type MembersTransport, membersTransport } from "./members-transport"

import { HOSTING_MEMBERS_CHANGED_EVENT, type Member } from "../bindings"
import { useInvalidateOnHostEvent } from "../query/host-invalidations"

export type MembersProps = Pick<
	MembersPanelProps,
	| "members"
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

const NO_MEMBERS: Member[] = []

const NOT_REFUSED: MemberActionRefusal = {}

const readFailure = (): NoticeMessage => ({
	title: i18n.t("settings:rail.members"),
	description: i18n.t("settings:space.transfer.reason.generic"),
})

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

	const { data: members = NO_MEMBERS } = useQuery({
		queryKey: hostQueryKeys.membersOf(watchedId),
		queryFn: watchedId ? () => readMembers(transport, watchedId) : skipToken,
		meta: { failureNotice: readFailure, raisedIn: "use-members" },
	})
	useInvalidateOnHostEvent(HOSTING_MEMBERS_CHANGED_EVENT, [
		hostQueryKeys.members(),
	])

	const heldMembers = (spaceId: string) =>
		queryClient.getQueryData<Member[]>(hostQueryKeys.membersOf(spaceId)) ??
		NO_MEMBERS

	const act = useMutation({
		mutationFn: (run: MemberAction) =>
			membersAfter(transport, run, heldMembers(run.spaceId)),
		onSuccess: (answered, run) => {
			queryClient.setQueryData(hostQueryKeys.membersOf(run.spaceId), answered)
			if (run.action === "invite") setEmail("")
			if (run.action === "withdraw") reportSuccess(withdrawnNotice(run.member))
		},
		meta: { rendersErrorInline: true },
	})

	const ownRun = act.variables?.spaceId === watchedId ? act.variables : null
	const { refusal, failure } =
		ownRun && act.isError ? refusalOf(ownRun, act.error) : NOT_REFUSED

	const memberOf = (userId: string) =>
		members.find((member) => member.userId === userId)

	const runOnWatched = (run: (spaceId: string) => MemberAction) => {
		if (watchedId) act.mutate(run(watchedId))
	}

	if (!shownSpace) return undefined
	return {
		members: isHosted ? hostFirst(members).map(toSpaceMember) : [],
		email,
		onEmailChange: (typed) => {
			setEmail(typed)
			if (refusal) act.reset()
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
