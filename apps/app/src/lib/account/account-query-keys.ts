export const accountQueryKeys = {
	all: ["account"] as const,
	state: () => [...accountQueryKeys.all, "state"] as const,
}
