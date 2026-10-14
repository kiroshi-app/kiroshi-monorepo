export const routineQueryKeys = {
	all: ["routines"] as const,
	conversation: (conversationId: string | null) =>
		[...routineQueryKeys.all, "conversation", conversationId] as const,
	list: (
		conversationId: string | null,
		leadBotId: string | null,
		host: string | null,
		spaceId: string | null,
	) =>
		[
			...routineQueryKeys.conversation(conversationId),
			leadBotId,
			host,
			spaceId,
		] as const,
	runs: () => [...routineQueryKeys.all, "runs"] as const,
	runsOf: (routineId: string | null, host: string | null) =>
		[...routineQueryKeys.runs(), routineId, host] as const,
}
