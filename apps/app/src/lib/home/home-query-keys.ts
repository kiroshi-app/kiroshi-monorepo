export const homeQueryKeys = {
	all: ["home"] as const,
	agentRooms: () => [...homeQueryKeys.all, "agent-rooms"] as const,
	agentRoomsIn: (spaceId: string | null) =>
		[...homeQueryKeys.agentRooms(), spaceId] as const,
}
