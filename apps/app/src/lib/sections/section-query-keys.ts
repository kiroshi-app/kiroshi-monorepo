export const sectionQueryKeys = {
	all: ["sections"] as const,
	lists: () => [...sectionQueryKeys.all, "list"] as const,
	list: (spaceRowId: string, spaceId: string) =>
		[...sectionQueryKeys.lists(), spaceRowId, spaceId] as const,
}
