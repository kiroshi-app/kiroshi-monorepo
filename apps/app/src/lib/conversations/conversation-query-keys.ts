export const conversationQueryKeys = {
	all: ["conversations"] as const,
	rosters: () => [...conversationQueryKeys.all, "roster"] as const,
	roster: (spaceRowId: string, spaceId: string) =>
		[...conversationQueryKeys.rosters(), spaceRowId, spaceId] as const,
	previews: () => [...conversationQueryKeys.all, "preview"] as const,
	soloThread: (spaceRowId: string, spaceId: string, botId: string) =>
		[
			...conversationQueryKeys.previews(),
			"solo-thread",
			spaceRowId,
			spaceId,
			botId,
		] as const,
}
