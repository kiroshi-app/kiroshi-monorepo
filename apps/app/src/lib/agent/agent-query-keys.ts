export const agentQueryKeys = {
	all: ["agent"] as const,
	pendingQuestionsIn: (spaceRowId: string | null) =>
		[...agentQueryKeys.all, "pending-questions", spaceRowId] as const,
}
