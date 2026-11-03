export const tabQueryKeys = {
	all: ["tabs"] as const,
	ghost: () => [...tabQueryKeys.all, "ghost"] as const,
	ghostBots: (spaceId: string | null) =>
		[...tabQueryKeys.ghost(), "bots", spaceId] as const,
	ghostConversations: (spaceId: string | null) =>
		[...tabQueryKeys.ghost(), "conversations", spaceId] as const,
}
