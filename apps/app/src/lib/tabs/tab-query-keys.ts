export const tabQueryKeys = {
	all: ["tabs"] as const,
	ghost: () => [...tabQueryKeys.all, "ghost"] as const,
	ghostBots: (spaceId: string | null) =>
		[...tabQueryKeys.ghost(), "bots", spaceId] as const,
	ghostConversation: (conversationId: string | undefined) =>
		[...tabQueryKeys.ghost(), "conversation", conversationId] as const,
	ghostSoloThread: (spaceId: string | null, botId: string | undefined) =>
		[...tabQueryKeys.ghost(), "solo-thread", spaceId, botId] as const,
	ghostMessages: (conversationId: string | undefined) =>
		[...tabQueryKeys.ghost(), "messages", conversationId] as const,
}
