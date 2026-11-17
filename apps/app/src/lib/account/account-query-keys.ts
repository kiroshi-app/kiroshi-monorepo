export const accountQueryKeys = {
	all: ["account"] as const,
	state: () => [...accountQueryKeys.all, "state"] as const,
}
// TODO: remove, fast gate proof on feature/conversation-feed (throwaway)
