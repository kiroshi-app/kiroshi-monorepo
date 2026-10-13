import type { EnvOwner } from "../conversations/store-contract"

export const applicationQueryKeys = {
	all: ["applications"] as const,
	conversationInstalls: (conversationId: string | null) =>
		[
			...applicationQueryKeys.all,
			"conversation-installs",
			conversationId,
		] as const,
	connections: () => [...applicationQueryKeys.all, "connections"] as const,
	connectionsOf: (owner: EnvOwner | null) =>
		[...applicationQueryKeys.connections(), owner] as const,
}
