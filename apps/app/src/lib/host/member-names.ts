import type { Member } from "../bindings"

export const hostAmong = (members: readonly Member[]): Member | undefined =>
	members.find((member) => member.status === "host")

export const authorAmong = (
	members: readonly Member[],
	authorAccountId: string | null,
): Member | undefined =>
	authorAccountId === null
		? hostAmong(members)
		: members.find((member) => member.userId === authorAccountId)

export const memberNameOf = (
	member: Member | undefined,
	unnamed: string,
): string => member?.name || unnamed
