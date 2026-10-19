import type { JoinedSpaceMember, Member } from "../bindings"

export const hostFirst = (members: Member[]) => [
	...members.filter((member) => member.status === "host"),
	...members.filter((member) => member.status !== "host"),
]

const emailIn = (answered: Member[], userId: string) =>
	answered.find((member) => member.userId === userId)?.email ?? ""

const asMember = (
	{ userId, name, role }: JoinedSpaceMember,
	answered: Member[],
): Member => ({
	userId,
	name,
	email: emailIn(answered, userId),
	status: role === "host" ? "host" : "joined",
})

const isListedIn = (answered: Member[] | undefined) => (member: Member) =>
	answered === undefined ||
	answered.some((held) => held.userId === member.userId)

const isFirstOfItsPerson = (member: Member, index: number, members: Member[]) =>
	members.findIndex((held) => held.userId === member.userId) === index

export const joinedMembersOf = (
	roster: JoinedSpaceMember[],
	answered: Member[] | undefined,
): Member[] => {
	const held = answered ?? []
	return [
		...hostFirst(roster.map((rostered) => asMember(rostered, held)))
			.filter(isFirstOfItsPerson)
			.filter(isListedIn(answered)),
		...held.filter((member) => member.status === "pending"),
	]
}

export const fingerprintIn = (
	roster: JoinedSpaceMember[],
	userId: string,
): string | undefined =>
	roster.find((rostered) => rostered.userId === userId)?.fingerprint.join(" ")
