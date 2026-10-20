import type { NoticeMessage } from "@workspace/ui/components/notice-surface"
import type {
	InviteRefusal,
	MembersFailure,
	SpaceMember,
} from "@workspace/ui/components/space-settings-dialog/members-panel"
import { i18n } from "@workspace/ui/lib/i18n"

import { memberNameOf } from "./member-names"
import type {
	HostedMember,
	MembersAnswer,
	MembersTransport,
} from "./members-transport"

import type { Member, MembersError, UnreachableReason } from "../bindings"

export type MemberAction =
	| { action: "invite"; spaceId: string; email: string }
	| {
			action: "resend" | "withdraw" | "remove"
			spaceId: string
			member: HostedMember
	  }

export type MemberActionRefusal = {
	refusal?: InviteRefusal
	failure?: MembersFailure
}

const INVITE_REFUSALS: Partial<Record<MembersError["kind"], InviteRefusal>> = {
	alreadyInvited: "invited",
	ownAccount: "self",
	notAnEmail: "malformed",
}

type FailureReasons<Action extends MembersFailure["action"]> = Partial<
	Record<
		MembersError["kind"],
		Extract<MembersFailure, { action: Action }>["reason"]
	>
>

const SHARED_REASONS = {
	notHosting: "notHosting",
	notOwner: "notOwner",
	needsSignIn: "needsSignIn",
	unreachable: "unreachable",
} as const

const INVITE_REASONS: FailureReasons<"invite"> = {
	...SHARED_REASONS,
	limitReached: "limitReached",
}

const WITHDRAW_REASONS: FailureReasons<"withdraw"> = {
	...SHARED_REASONS,
	unknownMember: "gone",
	notPending: "joined",
}

const REMOVE_REASONS: FailureReasons<"remove"> = {
	...SHARED_REASONS,
	unknownMember: "gone",
	notJoined: "pending",
	hostNotRemovable: "host",
}

const reasonOf = <Reason extends string>(
	reasons: Partial<Record<MembersError["kind"], Reason>>,
	error: MembersError | undefined,
): Reason | "generic" => (error && reasons[error.kind]) ?? "generic"

const shownNameOf = (member: Member): string | undefined =>
	member.status === "pending"
		? member.name || undefined
		: memberNameOf(member, i18n.t("chat:working.name"))

const DAY_MS = 24 * 60 * 60 * 1000

const daysLeftUntil = (moment: string) =>
	Math.max(1, Math.ceil((Date.parse(moment) - Date.now()) / DAY_MS))

type ShownStatus = Pick<SpaceMember, "status" | "expiresInDays" | "sentAt">

const shownStatusOf = ({ status, invitation }: HostedMember): ShownStatus => {
	if (!invitation) return { status }
	return invitation.state === "expired"
		? { status: "expired", sentAt: Date.parse(invitation.sentAt) }
		: { status: "pending", expiresInDays: daysLeftUntil(invitation.expiresAt) }
}

export const toSpaceMember = (member: HostedMember): SpaceMember => ({
	id: member.userId,
	name: shownNameOf(member),
	email: member.email,
	...shownStatusOf(member),
})

const withMember = (members: HostedMember[], member: HostedMember) => [
	...members.filter((held) => held.userId !== member.userId),
	member,
]

const dataOf = <Data>(answer: MembersAnswer<Data>): Data => {
	if (answer.status === "error") throw answer.error
	return answer.data
}

export type InviteAgainRefusal = { member: HostedMember; cause: unknown }

export const membersAfterInviteAgain = async (
	transport: MembersTransport,
	spaceId: string,
	member: HostedMember,
): Promise<HostedMember[]> => {
	try {
		return dataOf(await transport.inviteAgain(spaceId, member.userId))
	} catch (cause) {
		throw { member, cause } satisfies InviteAgainRefusal
	}
}

export const readMembers = async (
	transport: MembersTransport,
	spaceId: string,
): Promise<HostedMember[]> => dataOf(await transport.list(spaceId))

export const membersAfter = async (
	transport: MembersTransport,
	run: MemberAction,
	held: HostedMember[],
): Promise<HostedMember[]> => {
	if (run.action === "invite") {
		return withMember(
			held,
			dataOf(await transport.invite(run.spaceId, run.email)),
		)
	}
	const send = transport[run.action]
	return dataOf(await send(run.spaceId, run.member.userId))
}

const membersErrorOf = (reason: unknown): MembersError | undefined =>
	reason instanceof Error ? undefined : (reason as MembersError)

export const isListNotReadBack = (reason: unknown): boolean => {
	const error = membersErrorOf(reason)
	return (
		error?.kind === "unreachable" && error.reason?.kind === "listNotReadBack"
	)
}

type InviteFailure = Extract<MembersFailure, { action: "invite" }>

type InviteFailureCause = Pick<InviteFailure, "reason" | "status" | "code">

const unreachableCauseOf = (
	reason: UnreachableReason | undefined,
): InviteFailureCause => {
	if (!reason) return { reason: "unreachable" }
	switch (reason.kind) {
		case "transport":
			return { reason: reason.failure }
		case "relayStatus":
			return { reason: "relayStatus", status: reason.status }
		case "relayConflict":
			return { reason: "relayConflict", code: reason.code }
		default:
			return { reason: reason.kind }
	}
}

const inviteFailureCauseOf = (
	error: MembersError | undefined,
): InviteFailureCause =>
	error?.kind === "unreachable"
		? unreachableCauseOf(error.reason)
		: { reason: reasonOf(INVITE_REASONS, error) }

const inviteFailureOf = (
	email: string,
	error: MembersError | undefined,
): MemberActionRefusal => ({
	failure: { action: "invite", ...inviteFailureCauseOf(error), email },
})

const INVITE_AGAIN_OUTCOMES: Partial<
	Record<MembersError["kind"], "removed" | "listed">
> = {
	removedButNotInvited: "removed",
	invitedButNotListed: "listed",
}

export const inviteAgainFailureOf = ({
	member,
	cause,
}: InviteAgainRefusal): NoticeMessage => {
	const shown = toSpaceMember(member)
	const outcome = reasonOf(INVITE_AGAIN_OUTCOMES, membersErrorOf(cause))
	const copy = { name: shown.name ?? shown.email, email: shown.email }
	return {
		title: i18n.t(
			`settings:space.members.invitedAgainFailure.${outcome}.title`,
			copy,
		),
		description: i18n.t(
			`settings:space.members.invitedAgainFailure.${outcome}.description`,
			copy,
		),
	}
}

export const refusalOf = (
	run: MemberAction,
	reason: unknown,
): MemberActionRefusal => {
	const error = membersErrorOf(reason)
	if (run.action === "invite") {
		const refusal = error && INVITE_REFUSALS[error.kind]
		return refusal ? { refusal } : inviteFailureOf(run.email, error)
	}
	if (run.action === "resend") return inviteFailureOf(run.member.email, error)
	const member = toSpaceMember(run.member)
	return run.action === "withdraw"
		? {
				failure: {
					action: "withdraw",
					reason: reasonOf(WITHDRAW_REASONS, error),
					member,
				},
			}
		: {
				failure: {
					action: "remove",
					reason: reasonOf(REMOVE_REASONS, error),
					member,
				},
			}
}
