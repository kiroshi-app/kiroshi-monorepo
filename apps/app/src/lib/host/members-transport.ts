import { invoke, listen } from "./index"

import {
	HOSTING_MEMBERS_CHANGED_EVENT,
	type Member,
	type MembersChanged,
	type MembersError,
	type SpaceMembers,
} from "../bindings"

export type MembersAnswer<Data> =
	| { status: "ok"; data: Data }
	| { status: "error"; error: MembersError }

export type MembersTransport = {
	list: (spaceId: string) => Promise<MembersAnswer<Member[]>>
	invite: (spaceId: string, email: string) => Promise<MembersAnswer<Member>>
	withdraw: (
		spaceId: string,
		invitationId: string,
	) => Promise<MembersAnswer<Member[]>>
	remove: (spaceId: string, userId: string) => Promise<MembersAnswer<Member[]>>
	onChanged: (
		listener: (changed: MembersChanged) => void,
	) => Promise<() => void>
}

const answerOf = <Data>(call: Promise<Data>): Promise<MembersAnswer<Data>> =>
	call.then(
		(data) => ({ status: "ok", data }),
		(error: unknown) => {
			if (error instanceof Error) throw error
			return { status: "error", error: error as MembersError }
		},
	)

export const membersOf = ({ members, invitations }: SpaceMembers): Member[] => [
	...members,
	...invitations
		.filter((invitation) => invitation.state === "invited")
		.map((invitation) => ({
			userId: invitation.id,
			name: null,
			email: invitation.email,
			status: "pending" as const,
		})),
]

const invitedOf = (email: string, listed: SpaceMembers): Member => {
	const invited = membersOf(listed).find(
		(member) => member.status === "pending" && member.email === email,
	)
	if (!invited) throw new Error(`the invitation of ${email} did not read back`)
	return invited
}

export const membersTransport: MembersTransport = {
	list: (spaceId) =>
		answerOf(
			invoke<SpaceMembers>("hosting_members", { spaceId }).then(membersOf),
		),
	invite: (spaceId, email) =>
		answerOf(
			invoke<SpaceMembers>("hosting_invite_member", { spaceId, email }).then(
				(listed) => invitedOf(email.trim().toLowerCase(), listed),
			),
		),
	withdraw: (spaceId, invitationId) =>
		answerOf(
			invoke<SpaceMembers>("hosting_withdraw_invitation", {
				spaceId,
				invitationId,
			}).then(membersOf),
		),
	remove: (spaceId, userId) =>
		answerOf(
			invoke<SpaceMembers>("hosting_remove_member", { spaceId, userId }).then(
				membersOf,
			),
		),
	onChanged: (listener) =>
		listen<MembersChanged>(HOSTING_MEMBERS_CHANGED_EVENT, (event) =>
			listener(event.payload),
		),
}
