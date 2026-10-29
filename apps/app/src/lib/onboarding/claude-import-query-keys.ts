export const claudeImportQueryKeys = {
	all: ["claude-import"] as const,
	inventory: () => [...claudeImportQueryKeys.all, "inventory"] as const,
}
