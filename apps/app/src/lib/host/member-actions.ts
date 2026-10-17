import type {
	InviteRefusal,
	MembersFailure,
	SpaceMember,
} from "@workspace/ui/components/space-settings-dialog/members-panel"
import { i18n } from "@workspace/ui/lib/i18n"

import { memberNameOf } from "./member-names"
import type { MembersAnswer, MembersTransport } from "./members-transport"

import type { Member, MembersError } from "../bindings"

export type MemberAction =
	| { action: "invite"; spaceId: string; email: string }
	| { action: "withdraw" | "remove"; spaceId: string; member: Member }

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

export const toSpaceMember = (member: Member): SpaceMember => ({
	id: member.userId,
	name: shownNameOf(member),
	email: member.email,
	status: member.status,
})

const withMember = (members: Member[], member: Member) => [
	...members.filter((held) => held.userId !== member.userId),
	member,
]

const dataOf = <Data>(answer: MembersAnswer<Data>): Data => {
	if (answer.status === "error") throw answer.error
	return answer.data
}

export const readMembers = async (
	transport: MembersTransport,
	spaceId: string,
): Promise<Member[]> => dataOf(await transport.list(spaceId))

export const membersAfter = async (
	transport: MembersTransport,
	run: MemberAction,
	held: Member[],
): Promise<Member[]> => {
	if (run.action === "invite") {
		return withMember(
			held,
			dataOf(await transport.invite(run.spaceId, run.email)),
		)
	}
	const send = run.action === "withdraw" ? transport.withdraw : transport.remove
	return dataOf(await send(run.spaceId, run.member.userId))
}

const membersErrorOf = (reason: unknown): MembersError | undefined =>
	reason instanceof Error ? undefined : (reason as MembersError)

export const refusalOf = (
	run: MemberAction,
	reason: unknown,
): MemberActionRefusal => {
	const error = membersErrorOf(reason)
	if (run.action === "invite") {
		const refusal = error && INVITE_REFUSALS[error.kind]
		return refusal
			? { refusal }
			: {
					failure: {
						action: "invite",
						reason: reasonOf(INVITE_REASONS, error),
						email: run.email,
					},
				}
	}
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
