import { textOf } from "./settings-search"

import type { LibraryItemKind } from "../bindings"

export type LibrarySearch = {
	item?: string
	kind?: LibraryItemKind
	title?: string
}

export type LibraryOpening = {
	kind: LibraryItemKind
	name: string
	title?: string
}

const isLibraryItemKind = (value: unknown): value is LibraryItemKind =>
	value === "document" || value === "image"

export const validateLibrarySearch = (
	search: Record<string, unknown>,
): LibrarySearch => ({
	item: textOf(search.item),
	kind: isLibraryItemKind(search.kind) ? search.kind : undefined,
	title: textOf(search.title),
})

export const openingOf = ({
	item,
	kind,
	title,
}: LibrarySearch): LibraryOpening | undefined =>
	item === undefined || kind === undefined
		? undefined
		: { kind, name: item, title }

export const librarySearchOf = (opening?: LibraryOpening): LibrarySearch => ({
	item: opening?.name,
	kind: opening?.kind,
	title: opening?.title,
})
