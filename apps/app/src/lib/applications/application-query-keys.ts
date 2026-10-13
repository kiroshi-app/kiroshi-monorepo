export const applicationQueryKeys = {
	all: ["applications"] as const,
	conversationInstalls: (conversationId: string | null) =>
		[
			...applicationQueryKeys.all,
			"conversation-installs",
			conversationId,
		] as const,
}
