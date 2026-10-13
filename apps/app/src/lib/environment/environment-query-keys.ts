import type { EnvScope } from "../conversations/store-contract"

export const environmentQueryKeys = {
	all: ["environment"] as const,
	scope: (scope: EnvScope | null) =>
		[...environmentQueryKeys.all, scope] as const,
}
