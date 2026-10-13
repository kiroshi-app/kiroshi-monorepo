export const spaceQueryKeys = {
	all: ["spaces"] as const,
	list: () => [...spaceQueryKeys.all, "list"] as const,
	joined: () => [...spaceQueryKeys.all, "joined"] as const,
}
