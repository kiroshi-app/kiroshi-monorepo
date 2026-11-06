import type { BoardLibraryItem } from "@workspace/ui/components/board/board-dock"
import type {
	BoardPaste,
	BoardPoint,
	BoardViewport,
} from "@workspace/ui/components/board-view"

import type {
	LibraryBoardLinkDescription,
	LibraryBoardObject,
	LibraryBoardPlacement,
} from "./library-board-intents"
import { readLinkPreview } from "./library-link-preview"

import type { LibraryItem } from "../bindings"

const BOARD_CANVAS_SELECTOR = '[data-slot="board-canvas"]'

const IMPORTED_OBJECT_STEP = 260

type LibraryBoardWrites = {
	place: (placement: LibraryBoardPlacement) => void
	describeLink: (id: string, description: LibraryBoardLinkDescription) => void
}

type LibraryBoardAdditionsOptions = {
	board: LibraryBoardWrites
	libraryItems: readonly BoardLibraryItem[]
	importFiles: (files: readonly File[]) => Promise<LibraryItem[]>
	viewport: BoardViewport
}

type NamedKind = {
	kind: LibraryItem["kind"] | BoardLibraryItem["kind"]
	name: string
}

const libraryObjectOf = ({ kind, name }: NamedKind): LibraryBoardObject =>
	kind === "image"
		? { kind: "image", item: name }
		: { kind: "libraryCard", item: name }

const visibleCentreOf = ({ offset, zoom }: BoardViewport): BoardPoint => {
	const canvas = document.querySelector<HTMLElement>(BOARD_CANVAS_SELECTOR)
	const width = canvas?.clientWidth ?? 0
	const height = canvas?.clientHeight ?? 0
	return {
		x: (width / 2 - offset.x) / zoom,
		y: (height / 2 - offset.y) / zoom,
	}
}

const besideAt = (point: BoardPoint, index: number): BoardPoint => ({
	x: point.x + index * IMPORTED_OBJECT_STEP,
	y: point.y,
})

export const libraryBoardAdditionsOf = ({
	board,
	libraryItems,
	importFiles,
	viewport,
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
		pickItem: (id: string) => placeItem(id, visibleCentreOf(viewport)),
		dropItem: placeItem,
		paste,
		dropFiles: importAndPlace,
	}
}
