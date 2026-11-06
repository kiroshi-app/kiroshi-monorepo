import type { BoardLibraryItem } from "@workspace/ui/components/board/board-dock"

import { toBoardLibraryItem, toShownItem } from "./library-items"
import { useLibraryImageSources } from "./use-library-image-sources"
import {
	type LibraryUrlImport,
	useLibraryImports,
	useLibraryUrlImport,
} from "./use-library-imports"
import { useLibraryItems } from "./use-library-items"

import type { LibraryItem } from "../bindings"

export type LibraryBoardShelf = {
	items: readonly BoardLibraryItem[]
	pickableItems: readonly BoardLibraryItem[]
	importFiles: (files: readonly File[]) => Promise<LibraryItem[]>
	importUrl: (url: string) => Promise<LibraryUrlImport>
}

type LibraryBoardShelfSource = {
	spaceId: string
	isJoined: boolean
	name: string
}

export const useLibraryBoardShelf = ({
	spaceId,
	isJoined,
	name,
}: LibraryBoardShelfSource): LibraryBoardShelf => {
	const library = useLibraryItems(spaceId)
	const sourceOf = useLibraryImageSources(spaceId, library.items, isJoined)
	const { importDropped } = useLibraryImports(spaceId, isJoined)
	const importUrl = useLibraryUrlImport(spaceId)
	const items = library.items.map((item) =>
		toBoardLibraryItem(
			toShownItem(
				item,
				{
					excerpt: library.excerptOf(item),
					src: sourceOf(item),
					summary: library.summaryOf(item),
				},
				library.readAt,
			),
		),
	)

	return {
		items,
		pickableItems: items.filter((item) => item.id !== name),
		importFiles: importDropped,
		importUrl,
	}
}
