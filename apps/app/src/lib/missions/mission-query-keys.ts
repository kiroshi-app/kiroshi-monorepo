export const missionQueryKeys = {
	all: ["missions"] as const,
	conversations: () => [...missionQueryKeys.all, "conversation"] as const,
	conversation: (conversationId: string | null, host: string | null) =>
		[...missionQueryKeys.conversations(), conversationId, host] as const,
	spaceFeeds: () => [...missionQueryKeys.all, "space-feed"] as const,
	spaceFeed: (spaceId: string | null, host: string | null) =>
		[...missionQueryKeys.spaceFeeds(), spaceId, host] as const,
	details: () => [...missionQueryKeys.all, "detail"] as const,
	detailsOf: (missionId: string) =>
		[...missionQueryKeys.details(), missionId] as const,
	detail: (missionId: string, host: string | null) =>
		[...missionQueryKeys.detailsOf(missionId), host] as const,
	marks: () => [...missionQueryKeys.all, "marks"] as const,
	marksOf: (source: string | null) =>
		[...missionQueryKeys.marks(), source] as const,
}
