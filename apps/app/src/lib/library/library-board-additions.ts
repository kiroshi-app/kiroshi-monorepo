import type { BoardLibraryItem } from "@workspace/ui/components/board/board-dock"
import type {
	BoardPaste,
	BoardPoint,
} from "@workspace/ui/components/board-view"

import type {
	LibraryBoardLinkDescription,
	LibraryBoardObject,
	LibraryBoardPlacement,
} from "./library-board-intents"
import { readLinkPreview } from "./library-link-preview"
import type { LibraryUrlImport } from "./use-library-imports"

import type { LibraryItem } from "../bindings"

const IMPORTED_OBJECT_STEP = 260

type LibraryBoardWrites = {
	place: (placement: LibraryBoardPlacement) => void
	describeLink: (id: string, description: LibraryBoardLinkDescription) => void
}

type LibraryBoardAdditionsOptions = {
	board: LibraryBoardWrites
	libraryItems: readonly BoardLibraryItem[]
	importFiles: (files: readonly File[]) => Promise<LibraryItem[]>
	importUrl: (url: string) => Promise<LibraryUrlImport>
}

type NamedKind = {
	kind: LibraryItem["kind"] | BoardLibraryItem["kind"]
	name: string
}

const libraryObjectOf = ({ kind, name }: NamedKind): LibraryBoardObject =>
	kind === "image"
		? { kind: "image", item: name }
		: { kind: "libraryCard", item: name }

const besideAt = (point: BoardPoint, index: number): BoardPoint => ({
	x: point.x + index * IMPORTED_OBJECT_STEP,
	y: point.y,
})

export const libraryBoardAdditionsOf = ({
	board,
	libraryItems,
	importFiles,
	importUrl,
}: LibraryBoardAdditionsOptions) => {
	const placeItem = (id: string, centre: BoardPoint) => {
		const picked = libraryItems.find((item) => item.id === id)
		if (!picked) return
		board.place({
			id: crypto.randomUUID(),
			object: libraryObjectOf({ kind: picked.kind, name: picked.id }),
			centre,
		})
	}

	const placeLink = (url: string, centre: BoardPoint) => {
		const id = crypto.randomUUID()
		board.place({ id, object: { kind: "linkCard", url }, centre })
		void readLinkPreview(url).then((preview) => board.describeLink(id, preview))
		return id
	}

	const importAndPlace = (files: readonly File[], point: BoardPoint) => {
		const leadId = crypto.randomUUID()
		void importFiles(files).then((imported) => {
			imported.forEach((item, index) => {
				board.place({
					id: index === 0 ? leadId : crypto.randomUUID(),
					object: libraryObjectOf(item),
					centre: besideAt(point, index),
				})
			})
		})
		return leadId
	}

	const placeLanded = (
		url: string,
		point: BoardPoint,
		landed: LibraryUrlImport,
	) => {
		if (landed.kind === "image") {
			board.place({
				id: crypto.randomUUID(),
				object: libraryObjectOf(landed.item),
				centre: point,
			})
		}
		if (landed.kind === "page") {
			placeLink(url, point)
		}
	}

	const dropUrl = (url: string, point: BoardPoint) => {
		void importUrl(url).then((landed) => placeLanded(url, point, landed))
	}

	const paste = (pasted: BoardPaste, point: BoardPoint) => {
		switch (pasted.kind) {
			case "link":
				return placeLink(pasted.payload, point)
			case "image":
				return importAndPlace([pasted.payload], point)
			case "files":
				return importAndPlace(pasted.payload, point)
		}
	}

	return {
		placeItem,
		paste,
		dropFiles: importAndPlace,
		dropUrl,
	}
}
