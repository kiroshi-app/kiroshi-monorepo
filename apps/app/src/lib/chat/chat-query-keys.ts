export const chatQueryKeys = {
	all: ["chat"] as const,
	pins: (conversationId: string | null) =>
		[...chatQueryKeys.all, "pins", conversationId] as const,
}
