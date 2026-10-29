export const hostQueryKeys = {
	all: ["host"] as const,
	members: () => [...hostQueryKeys.all, "members"] as const,
	membersOf: (spaceId: string | undefined) =>
		[...hostQueryKeys.members(), spaceId] as const,
	hosting: () => [...hostQueryKeys.all, "hosting"] as const,
	hostingOf: (spaceId: string | undefined) =>
		[...hostQueryKeys.hosting(), spaceId] as const,
	hostingStates: () => [...hostQueryKeys.all, "hostingStates"] as const,
	hostingStateOf: (spaceId: string) =>
		[...hostQueryKeys.hostingStates(), spaceId] as const,
}
