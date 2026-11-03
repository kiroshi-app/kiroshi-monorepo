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
import type { Bot } from "@/lib/conversations/store-contract"
import { withoutEdits } from "@/lib/library/library-document-writers"
import {
	documentNamedAs,
	matchesQuery,
	toShownItem,
} from "@/lib/library/library-items"
import { useCreateLibraryDocument } from "@/lib/library/use-create-library-document"
import {
	type LibraryRename,
	useJoinedLibraryActions,
	useLibraryActions,
} from "@/lib/library/use-library-actions"
import { useLibraryDocumentSession } from "@/lib/library/use-library-document-session"
import { useLibraryDocumentWriters } from "@/lib/library/use-library-document-writers"
import { useLibraryImageSources } from "@/lib/library/use-library-image-sources"
import { useLibraryImports } from "@/lib/library/use-library-imports"
import { useLibraryItems } from "@/lib/library/use-library-items"
import { useOpenOnArrival } from "@/lib/library/use-open-on-arrival"

type LibraryScreenProps = {
	spaceId: string
	isJoined: boolean
	bots: Bot[]
	spaceTint?: Space["colour"]
	openedOnArrival?: string
	onArrivalOpened?: () => void
	onOpenInNewTab?: (item: NamedItem) => void
}

type ShownImage = Extract<ShownLibraryItem, { kind: "image" }>

type OpenedDocument = {
	kind: "document"
	name: string
	title: string
	startTitle: string
	detail: string
	template?: LibraryDocumentTemplate
}

type OpenedItem = { kind: "image"; id: string } | OpenedDocument | null

type NamedItem = { id: string }

const renameIfRetitled = (
	{ name, title, startTitle }: OpenedDocument,
	rename: (renamed: LibraryRename) => void,
) => {
	const newTitle = title.trim()
	if (newTitle && newTitle !== startTitle) {
		rename({ name, newName: documentNamedAs(name, newTitle) })
	}
}

export const LibraryScreen = ({
	spaceId,
	isJoined,
	bots,
	spaceTint,
	openedOnArrival,
	onArrivalOpened,
	onOpenInNewTab,
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
	const copyAndWait = ({ id }: NamedItem) => actions.copyAndWait(id)
	const [filter, setFilter] = useState<LibraryFilter>("all")
	const [query, setQuery] = useState("")
	const [opened, setOpened] = useState<OpenedItem>(null)
	const [pickedTemplate, setPickedTemplate] =
		useState<LibraryDocumentTemplate | null>(null)
	const { create, isCreating } = useCreateLibraryDocument(spaceId)
	const { importingItems, importDropped } = useLibraryImports(spaceId, isJoined)
	const openedDocument = opened?.kind === "document" ? opened : null
	const { document, edit, shareCaret, hasFailedToOpen, closeAndRelist } =
		useLibraryDocumentSession(spaceId, openedDocument?.name ?? null)
	const { writers, people, finished, dismissFinished } =
		useLibraryDocumentWriters({
			spaceId,
			name: openedDocument?.name ?? null,
			isJoined,
			document,
			bots,
			title: openedDocument?.title ?? "",
		})
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
			startTitle: item.name,
			detail: item.detail,
		})
	}
	useOpenOnArrival({
		name: openedOnArrival,
		items: shownItems,
		isListing: library.isLoading,
		open: openItem,
		consume: onArrivalOpened,
	})
	const renameItem = (item: ShownLibraryItem) => {
		if (item.kind === "document") {
			openItem(item)
		}
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
			setOpened({
				kind: "document",
				name,
				title,
				startTitle: title,
				detail,
				template,
			})
		})
	}
	const leaveDocument = (left: OpenedDocument) => {
		void closeAndRelist().then(() => renameIfRetitled(left, actions.rename))
		close()
	}
	const undoAll = () => {
		if (document && finished) {
			edit(withoutEdits(document.markdown, finished.edits))
		}
		dismissFinished()
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
				finished={finished}
				key={openedDocument.name}
				onBack={() => leaveDocument(openedDocument)}
				onBodyChange={edit}
				onCaretChange={shareCaret}
				onDone={dismissFinished}
				onMore={reveal && (() => reveal({ id: openedDocument.name }))}
				onTitleChange={retitle}
				onUndoAll={undoAll}
				people={people}
				template={openedDocument.template}
				title={openedDocument.title}
				writers={writers}
			/>
		)
	}

	return (
		<LibraryPanel
			filter={filter}
			items={[...importingItems, ...shownItems]}
			onFilterChange={setFilter}
			onCopy={copy}
			onDownload={save}
			onNewDocument={() => setPickedTemplate("blank")}
			onOpen={openItem}
			onOpenInNewTab={onOpenInNewTab}
			onOpenItem={openItem}
			onRename={renameItem}
			onSearchQueryChange={setQuery}
			onShowInFolder={reveal}
			onStartTemplate={setPickedTemplate}
			overlay={
				<>
					<LibraryLightbox
						count={images.length}
						image={images[imageIndex] ?? null}
						onClose={close}
						onCopy={copyAndWait}
						onDownload={save}
						onShowInFolder={reveal}
						onNext={() => openImageAt(imageIndex + 1)}
						onOpenInNewTab={onOpenInNewTab}
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
