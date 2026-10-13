import type { CatalogueScope } from "./catalogue-transport"

export const searchQueryKeys = {
	all: ["search"] as const,
	results: (scope: CatalogueScope | null) =>
		[...searchQueryKeys.all, "results", scope] as const,
}
