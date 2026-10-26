import type { EnvOwner } from "../conversations/store-contract"

export const botQueryKeys = {
	all: ["bots"] as const,
	modelCatalogue: () => [...botQueryKeys.all, "model-catalogue"] as const,
	mcpServers: () => [...botQueryKeys.all, "mcp-servers"] as const,
	mcpServersOf: (owner: EnvOwner | null) =>
		[...botQueryKeys.mcpServers(), owner] as const,
	companionCounts: () => [...botQueryKeys.all, "companion-counts"] as const,
	companionCountsOf: (spaceId: string | undefined) =>
		[...botQueryKeys.companionCounts(), spaceId] as const,
}
