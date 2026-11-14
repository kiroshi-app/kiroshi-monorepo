export const libraryQueryKeys = {
	all: ["library"] as const,
	itemsOf: (spaceId: string) =>
		[...libraryQueryKeys.all, "items", spaceId] as const,
	documentsOf: (spaceId: string) =>
		[...libraryQueryKeys.itemsOf(spaceId), "documents"] as const,
	excerptOf: (spaceId: string, name: string, modifiedAt: number) =>
		[...libraryQueryKeys.all, "excerpt", spaceId, name, modifiedAt] as const,
	imageOf: (spaceId: string, name: string, modifiedAt: number) =>
		[...libraryQueryKeys.all, "image", spaceId, name, modifiedAt] as const,
	boardSummaryOf: (spaceId: string, name: string, modifiedAt: number) =>
		[
			...libraryQueryKeys.all,
			"boardSummary",
			spaceId,
			name,
			modifiedAt,
		] as const,
	documentOf: (spaceId: string, name: string) =>
		[...libraryQueryKeys.all, "document", spaceId, name] as const,
	commentThreadsOf: (spaceId: string, name: string | undefined) =>
		[...libraryQueryKeys.all, "commentThreads", spaceId, name] as const,
	imageSave: () => [...libraryQueryKeys.all, "imageSave"] as const,
}
