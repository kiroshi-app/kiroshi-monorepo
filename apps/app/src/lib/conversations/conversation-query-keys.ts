export const conversationQueryKeys = {
	all: ["conversations"] as const,
	rosters: () => [...conversationQueryKeys.all, "roster"] as const,
	roster: (spaceRowId: string, spaceId: string) =>
		[...conversationQueryKeys.rosters(), spaceRowId, spaceId] as const,
	soloStates: (spaceRowId: string, spaceId: string) =>
		[...conversationQueryKeys.all, "solo-states", spaceRowId, spaceId] as const,
	previews: () => [...conversationQueryKeys.all, "preview"] as const,
	soloThreadsIn: (spaceRowId: string) =>
		[...conversationQueryKeys.previews(), "solo-thread", spaceRowId] as const,
	soloThread: (spaceRowId: string, spaceId: string, botId: string) =>
		[
			...conversationQueryKeys.soloThreadsIn(spaceRowId),
			spaceId,
			botId,
		] as const,
}
