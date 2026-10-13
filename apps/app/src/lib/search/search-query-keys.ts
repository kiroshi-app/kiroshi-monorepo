import type { CatalogueScope, RecentScope } from "./catalogue-transport"

export const searchQueryKeys = {
	all: ["search"] as const,
	recents: (scope: RecentScope | null) =>
		[...searchQueryKeys.all, "recents", scope] as const,
	results: (scope: CatalogueScope | null) =>
		[...searchQueryKeys.all, "results", scope] as const,
}
