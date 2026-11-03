import { textOf } from "./settings-search"

export type LibrarySearch = {
	item?: string
}

export const validateLibrarySearch = (
	search: Record<string, unknown>,
): LibrarySearch => ({ item: textOf(search.item) })
