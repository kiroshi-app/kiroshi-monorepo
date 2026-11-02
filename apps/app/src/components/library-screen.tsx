import { useState } from "react"

import { LibraryDocumentView } from "@workspace/ui/components/library-document-view"
import type { LibraryItem as ShownLibraryItem } from "@workspace/ui/components/library-grid"
import { LibraryLightbox } from "@workspace/ui/components/library-lightbox"
import {
	type LibraryFilter,
	LibraryPanel,
} from "@workspace/ui/components/library-panel"

import type { LibraryDocument } from "@/lib/bindings"
import {
	detailOf,
	matchesQuery,
	titleOf,
	toShownItem,
} from "@/lib/library/library-items"
import { useLibraryActions } from "@/lib/library/use-library-actions"
import { useLibraryDocument } from "@/lib/library/use-library-document"
import { useLibraryImageSources } from "@/lib/library/use-library-image-sources"
import {
	type LibraryItemsRead,
	useLibraryItems,
} from "@/lib/library/use-library-items"

type LibraryScreenProps = {
	spaceId: string
	isJoined: boolean
}

type ShownImage = Extract<ShownLibraryItem, { kind: "image" }>

type OpenedItem =
	| { kind: "image"; id: string }
	| { kind: "document"; name: string }
	| null

const ignore = () => undefined

const shownDocumentOf = (
	document: LibraryDocument,
	library: LibraryItemsRead,
) => {
	const item = library.items.find(({ name }) => name === document.name)
	return {
		id: document.name,
		name: titleOf({ kind: "document", name: document.name }),
		detail: item ? detailOf(item, library.readAt) : "",
		body: document.content,
	}
}

type NamedItem = { id: string }

export const LibraryScreen = ({ spaceId, isJoined }: LibraryScreenProps) => {
	const library = useLibraryItems(spaceId)
	const sourceOf = useLibraryImageSources(spaceId, library.items, isJoined)
	const actions = useLibraryActions(spaceId)
	const save = isJoined ? ignore : ({ id }: NamedItem) => actions.save(id)
	const reveal = isJoined ? ignore : ({ id }: NamedItem) => actions.reveal(id)
	const copy = ({ id }: NamedItem) => actions.copy(id)
	const [filter, setFilter] = useState<LibraryFilter>("all")
	const [query, setQuery] = useState("")
	const [opened, setOpened] = useState<OpenedItem>(null)
	const openedDocumentName = opened?.kind === "document" ? opened.name : null
	const { document, readAgain } = useLibraryDocument(
		spaceId,
		openedDocumentName,
	)

	const shownItems = library.items
		.filter((item) => matchesQuery(item, query))
		.map((item) =>
			toShownItem(
				item,
				{ excerpt: library.excerptOf(item), src: sourceOf(item) },
				library.readAt,
			),
		)
	const images = shownItems.filter(
		(item): item is ShownImage => item.kind === "image",
	)
	const imageIndex =
		opened?.kind === "image"
			? images.findIndex((image) => image.id === opened.id)
			: -1

	const close = () => setOpened(null)
	const openImageAt = (index: number) => {
		const image = images[index]
		if (image) {
			setOpened({ kind: "image", id: image.id })
		}
	}
	const openItem = (item: ShownLibraryItem) => {
		if (item.kind === "image") {
			setOpened({ kind: "image", id: item.id })
			return
		}
		if (item.id === openedDocumentName) {
			void readAgain()
			return
		}
		setOpened({ kind: "document", name: item.id })
	}

	if (document) {
		return (
			<LibraryDocumentView
				document={shownDocumentOf(document, library)}
				onBack={close}
				onMore={reveal}
			/>
		)
	}

	return (
		<LibraryPanel
			filter={filter}
			items={shownItems}
			onFilterChange={setFilter}
			onOpenItem={openItem}
			onSearchQueryChange={setQuery}
			overlay={
				<LibraryLightbox
					count={images.length}
					image={images[imageIndex] ?? null}
					onClose={close}
					onCopy={copy}
					onDownload={save}
					onMore={reveal}
					onNext={() => openImageAt(imageIndex + 1)}
					onPrevious={() => openImageAt(imageIndex - 1)}
					position={imageIndex + 1}
				/>
			}
			searchQuery={query}
			state={library.isLoading ? "loading" : "ready"}
		/>
	)
}
