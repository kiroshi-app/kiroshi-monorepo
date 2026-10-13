import { invoke, listen } from "./index"

import {
	HOSTING_MEMBERS_CHANGED_EVENT,
	type Member,
	type MembersChanged,
	type MembersError,
} from "../bindings"

export type MembersAnswer<Data> =
	| { status: "ok"; data: Data }
	| { status: "error"; error: MembersError }

export type MembersTransport = {
	list: (spaceId: string) => Promise<MembersAnswer<Member[]>>
	invite: (spaceId: string, email: string) => Promise<MembersAnswer<Member>>
	withdraw: (
		spaceId: string,
		userId: string,
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

export const membersTransport: MembersTransport = {
	list: (spaceId) => answerOf(invoke<Member[]>("hosting_members", { spaceId })),
	invite: (spaceId, email) =>
		answerOf(invoke<Member>("hosting_invite_member", { spaceId, email })),
	withdraw: (spaceId, userId) =>
		answerOf(
			invoke<Member[]>("hosting_withdraw_invitation", { spaceId, userId }),
		),
	remove: (spaceId, userId) =>
		answerOf(invoke<Member[]>("hosting_remove_member", { spaceId, userId })),
	onChanged: (listener) =>
		listen<MembersChanged>(HOSTING_MEMBERS_CHANGED_EVENT, (event) =>
			listener(event.payload),
		),
}
