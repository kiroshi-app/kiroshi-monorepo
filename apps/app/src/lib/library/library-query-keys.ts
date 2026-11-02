export const libraryQueryKeys = {
	all: ["library"] as const,
	itemsOf: (spaceId: string) =>
		[...libraryQueryKeys.all, "items", spaceId] as const,
	excerptOf: (spaceId: string, name: string, modifiedAt: number) =>
		[...libraryQueryKeys.all, "excerpt", spaceId, name, modifiedAt] as const,
	documentOf: (spaceId: string, name: string) =>
		[...libraryQueryKeys.all, "document", spaceId, name] as const,
}
