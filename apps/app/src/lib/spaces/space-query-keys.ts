export const spaceQueryKeys = {
	all: ["spaces"] as const,
	list: () => [...spaceQueryKeys.all, "list"] as const,
	joined: () => [...spaceQueryKeys.all, "joined"] as const,
	joinedMembers: () => [...spaceQueryKeys.joined(), "members"] as const,
	joinedMembersOf: (joinedId: string | undefined) =>
		[...spaceQueryKeys.joinedMembers(), joinedId] as const,
	invitations: () => [...spaceQueryKeys.all, "invitations"] as const,
}
