export const deviceQueryKeys = {
	all: ["devices"] as const,
	list: () => [...deviceQueryKeys.all, "list"] as const,
	approval: () => [...deviceQueryKeys.all, "approval"] as const,
	identity: () => [...deviceQueryKeys.all, "identity"] as const,
}
