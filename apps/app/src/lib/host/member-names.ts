import type { JoinedSpaceMember } from "../bindings"

type NamedMember = { name: string | null }

export const hostAmong = (
	members: readonly JoinedSpaceMember[],
): JoinedSpaceMember | undefined =>
	members.find((member) => member.role === "host")

export const authorAmong = (
	members: readonly JoinedSpaceMember[],
	authorAccountId: string | null,
): JoinedSpaceMember | undefined =>
	authorAccountId === null
		? hostAmong(members)
		: members.find((member) => member.userId === authorAccountId)

export const memberNameOf = (
	member: NamedMember | undefined,
	unnamed: string,
): string => member?.name || unnamed
