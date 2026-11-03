import { useState } from "react"

import {
	LibraryDocumentEditor,
	libraryDocumentStartOf,
} from "@workspace/ui/components/library-document-editor"
import type { LibraryItem as ShownLibraryItem } from "@workspace/ui/components/library-grid"
import { LibraryLightbox } from "@workspace/ui/components/library-lightbox"
import {
	type LibraryDocumentTemplate,
	LibraryNewDocumentDialog,
} from "@workspace/ui/components/library-new-document-dialog"
import {
	type LibraryFilter,
	LibraryPanel,
} from "@workspace/ui/components/library-panel"
import { i18n } from "@workspace/ui/lib/i18n"

import { LibraryDropTarget } from "@/components/library-drop-target"
import type { Space } from "@/lib/bindings"
import { matchesQuery, toShownItem } from "@/lib/library/library-items"
import { useCreateLibraryDocument } from "@/lib/library/use-create-library-document"
import {
	useJoinedLibraryActions,
	useLibraryActions,
} from "@/lib/library/use-library-actions"
import { useLibraryDocumentSession } from "@/lib/library/use-library-document-session"
import { useLibraryImageSources } from "@/lib/library/use-library-image-sources"
import { useLibraryImports } from "@/lib/library/use-library-imports"
import { useLibraryItems } from "@/lib/library/use-library-items"

type LibraryScreenProps = {
	spaceId: string
	isJoined: boolean
	spaceTint?: Space["colour"]
}

type ShownImage = Extract<ShownLibraryItem, { kind: "image" }>

type OpenedDocument = {
	kind: "document"
	name: string
	title: string
	detail: string
	template?: LibraryDocumentTemplate
}

type OpenedItem = { kind: "image"; id: string } | OpenedDocument | null

type NamedItem = { id: string }

export const LibraryScreen = ({
	spaceId,
	isJoined,
	spaceTint,
}: LibraryScreenProps) => {
	const library = useLibraryItems(spaceId)
	const sourceOf = useLibraryImageSources(spaceId, library.items, isJoined)
	const localActions = useLibraryActions(spaceId)
	const joinedActions = useJoinedLibraryActions(spaceId)
	const actions = isJoined ? joinedActions : localActions
	const save = ({ id }: NamedItem) => actions.save(id)
	const reveal = isJoined
		? undefined
		: ({ id }: NamedItem) => localActions.reveal(id)
	const copy = ({ id }: NamedItem) => actions.copy(id)
	const [filter, setFilter] = useState<LibraryFilter>("all")
	const [query, setQuery] = useState("")
	const [opened, setOpened] = useState<OpenedItem>(null)
	const [pickedTemplate, setPickedTemplate] =
		useState<LibraryDocumentTemplate | null>(null)
	const { create, isCreating } = useCreateLibraryDocument(spaceId)
	const { importingItems, importDropped } = useLibraryImports(spaceId, isJoined)
	const openedDocument = opened?.kind === "document" ? opened : null
	const { document, edit, hasFailedToOpen, closeAndRelist } =
		useLibraryDocumentSession(spaceId, openedDocument?.name ?? null)
	if (openedDocument && hasFailedToOpen) {
		setOpened(null)
	}

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
		setOpened({
			kind: "document",
			name: item.id,
			title: item.name,
			detail: item.detail,
		})
	}
	const createFrom = (template: LibraryDocumentTemplate) => {
		if (isCreating) {
			return
		}
		const { title, body, detail } = libraryDocumentStartOf(
			template,
			new Date(),
			i18n.getFixedT(null, "common"),
		)
		create({ title, body }, (name) => {
			setPickedTemplate(null)
			setOpened({ kind: "document", name, title, detail, template })
		})
	}
	const leaveDocument = () => {
		void closeAndRelist()
		close()
	}
	const retitle = (title: string) => {
		if (openedDocument) {
			setOpened({ ...openedDocument, title })
		}
	}

	if (openedDocument && document) {
		return (
			<LibraryDocumentEditor
				body={document.markdown}
				detail={openedDocument.detail}
				key={document.version}
				onBack={leaveDocument}
				onBodyChange={edit}
				onMore={reveal && (() => reveal({ id: openedDocument.name }))}
				onTitleChange={retitle}
				template={openedDocument.template}
				title={openedDocument.title}
			/>
		)
	}

	return (
		<LibraryPanel
			filter={filter}
			items={[...importingItems, ...shownItems]}
			onFilterChange={setFilter}
			onNewDocument={() => setPickedTemplate("blank")}
			onOpenItem={openItem}
			onSearchQueryChange={setQuery}
			onStartTemplate={setPickedTemplate}
			overlay={
				<>
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
					<LibraryNewDocumentDialog
						defaultTemplate={pickedTemplate ?? undefined}
						onCreate={createFrom}
						onDismiss={() => setPickedTemplate(null)}
						open={pickedTemplate !== null}
						spaceTint={spaceTint}
					/>
					<LibraryDropTarget onDrop={importDropped} />
				</>
			}
			searchQuery={query}
			state={library.isLoading ? "loading" : "ready"}
		/>
	)
}
