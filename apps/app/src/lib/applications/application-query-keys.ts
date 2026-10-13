import type { EnvOwner } from "../conversations/store-contract"

export const applicationQueryKeys = {
	all: ["applications"] as const,
	conversationInstalls: (conversationId: string | null) =>
		[
			...applicationQueryKeys.all,
			"conversation-installs",
			conversationId,
		] as const,
	catalogue: () => [...applicationQueryKeys.all, "catalogue"] as const,
	directory: () => [...applicationQueryKeys.all, "directory"] as const,
	install: () => [...applicationQueryKeys.all, "install"] as const,
	marks: () => [...applicationQueryKeys.all, "marks"] as const,
	mark: (name: string) => [...applicationQueryKeys.marks(), name] as const,
	connections: () => [...applicationQueryKeys.all, "connections"] as const,
	connectionsOf: (owner: EnvOwner | null) =>
		[...applicationQueryKeys.connections(), owner] as const,
}
