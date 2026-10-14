import type { Catalogue, CatalogueChat } from "./catalogue-contract"

import { invoke } from "../host"

export type RecentScope = {
	spaceId: string
}

export type CatalogueScope = RecentScope & {
	query: string
}

export const catalogueTransport = {
	search: ({ query, spaceId }: CatalogueScope) =>
		invoke<Catalogue>("search_catalogue", {
			query,
			spaceId,
			allSpaces: false,
		}),
	recent: ({ spaceId }: RecentScope) =>
		invoke<CatalogueChat[]>("search_recent", { spaceId, allSpaces: false }),
}
