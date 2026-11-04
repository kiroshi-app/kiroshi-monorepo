import { useEffect, useRef, useState } from "react"

import {
	LibraryDocumentEditor,
	type LibraryDocumentEditorHandle,
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
import type { LibraryItem, Space } from "@/lib/bindings"
import type { Bot } from "@/lib/conversations/store-contract"
import { formatActionsOf } from "@/lib/library/library-document-formats"
import {
	documentNamedAs,
	matchesQuery,
	titleOf,
	toShownItem,
} from "@/lib/library/library-items"
import { useCreateLibraryDocument } from "@/lib/library/use-create-library-document"
import {
	useJoinedLibraryActions,
	useLibraryActions,
} from "@/lib/library/use-library-actions"
import { useLibraryDocumentSession } from "@/lib/library/use-library-document-session"
import { useLibraryDocumentWriters } from "@/lib/library/use-library-document-writers"
import { useLibraryImageSources } from "@/lib/library/use-library-image-sources"
import { useLibraryImports } from "@/lib/library/use-library-imports"
import { useLibraryItems } from "@/lib/library/use-library-items"
import type { LibraryOpening } from "@/lib/navigation/library-search"

export type LibraryScreenProps = {
	spaceId: string
	isJoined: boolean
	bots: Bot[]
	spaceTint?: Space["colour"]
	opening?: LibraryOpening
	onOpeningChange: (opening: LibraryOpening | undefined) => void
	onOpenInNewTab?: (opening: LibraryOpening) => void
}

type ShownImage = Extract<ShownLibraryItem, { kind: "image" }>

type OpenedDocument = {
	kind: "document"
	name: string
	title: string
	startTitle: string
	detail: string
	template?: LibraryDocumentTemplate
	openedAs?: string
}

type DocumentDraft = Omit<OpenedDocument, "kind" | "detail"> & {
	detail?: string
}

type NamedItem = { id: string }

type KindedItem = Pick<ShownLibraryItem, "id" | "kind">

const openingOfItem = ({ id, kind }: KindedItem): LibraryOpening => ({
	kind,
	name: id,
})

const documentOpeningOf = ({ name, title }: DocumentDraft): LibraryOpening => ({
	kind: "document",
	name,
	title: title === titleOf({ kind: "document", name }) ? undefined : title,
})

const isNamedBy =
	(opening: LibraryOpening | undefined) =>
	({ kind, name }: LibraryItem) =>
		opening?.kind === kind && opening.name === name

const isOpenedBy =
	(opening: LibraryOpening | undefined) =>
	({ id, kind }: KindedItem) =>
		opening?.kind === kind && opening.name === id

const draftOf = (
	opening: LibraryOpening,
	held: DocumentDraft | null,
): DocumentDraft => {
	if (held?.name === opening.name) {
		return held
	}
	const startTitle = titleOf({ kind: "document", name: opening.name })
	return {
		name: opening.name,
		title: opening.title ?? startTitle,
		startTitle,
	}
}

const openedDocumentOf = (
	opening: LibraryOpening | undefined,
	held: DocumentDraft | null,
	listedDetail: string | undefined,
): OpenedDocument | null => {
	if (opening?.kind !== "document") {
		return null
	}
	const draft = draftOf(opening, held)
	const detail = draft.detail ?? listedDetail
	return detail === undefined ? null : { ...draft, kind: "document", detail }
}

type OpeningPresence = {
	opening: LibraryOpening | undefined
	isListing: boolean
	isListed: boolean
	isDocumentOpened: boolean
	hasFailedToOpen: boolean
}

const isOpeningMissing = ({
	opening,
	isListing,
	isListed,
	isDocumentOpened,
	hasFailedToOpen,
}: OpeningPresence) => {
	if (opening === undefined) {
		return false
	}
	if (isDocumentOpened) {
		return hasFailedToOpen
	}
	return !isListing && !isListed
}

const useDropMissingOpening = (
	presence: OpeningPresence,
	onOpeningChange: LibraryScreenProps["onOpeningChange"],
) => {
	const isMissing = isOpeningMissing(presence)
	useEffect(() => {
		if (isMissing) {
			onOpeningChange(undefined)
		}
	}, [isMissing, onOpeningChange])
}

const renamedDraftOf = (
	opened: OpenedDocument,
	{ name }: LibraryItem,
): DocumentDraft => {
	const title = titleOf({ kind: "document", name })
	return {
		...opened,
		name,
		title,
		startTitle: title,
		openedAs: opened.openedAs ?? opened.name,
	}
}

const boundTo = <Item,>(item: Item, action?: (item: Item) => void) =>
	action && (() => action(item))

const isActionShownOn = (
	item: Pick<ShownLibraryItem, "kind">,
	action: string,
) => action !== "onRename" || item.kind === "document"

export const LibraryScreen = ({
	spaceId,
	isJoined,
	bots,
	spaceTint,
	opening,
	onOpeningChange,
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
	const remove = ({ id }: NamedItem) => actions.remove(id)
	const [filter, setFilter] = useState<LibraryFilter>("all")
	const [query, setQuery] = useState("")
	const [heldDraft, setHeldDraft] = useState<DocumentDraft | null>(null)
	const [pickedTemplate, setPickedTemplate] =
		useState<LibraryDocumentTemplate | null>(null)
	const editor = useRef<LibraryDocumentEditorHandle>(null)
	const { create, isCreating } = useCreateLibraryDocument(spaceId)
	const { importingItems, importDropped } = useLibraryImports(spaceId, isJoined)
	const toShown = (item: LibraryItem) =>
		toShownItem(
			item,
			{ excerpt: library.excerptOf(item), src: sourceOf(item) },
			library.readAt,
		)
	const listedOpened = library.items.find(isNamedBy(opening))
	const openedDocument = openedDocumentOf(
		opening,
		heldDraft,
		listedOpened && toShown(listedOpened).detail,
	)
	const {
		document,
		edit,
		shareCaret,
		hasFailedToOpen,
		closeAndRelist,
		moveDocument,
	} = useLibraryDocumentSession(spaceId, openedDocument?.name ?? null)
	const { writers, people } = useLibraryDocumentWriters({
		spaceId,
		name: openedDocument?.name ?? null,
		isJoined,
		document,
		bots,
		title: openedDocument?.title ?? "",
	})
	useDropMissingOpening(
		{
			opening,
			isListing: library.isLoading,
			isListed: listedOpened !== undefined,
			isDocumentOpened: openedDocument !== null,
			hasFailedToOpen,
		},
		onOpeningChange,
	)

	const shownItems = library.items
		.filter((item) => matchesQuery(item, query))
		.map(toShown)
	const images = shownItems.filter(
		(item): item is ShownImage => item.kind === "image",
	)
	const imageIndex = images.findIndex(isOpenedBy(opening))

	const close = () => {
		setHeldDraft(null)
		onOpeningChange(undefined)
	}
	const openImageAt = (index: number) => {
		const image = images[index]
		if (image) {
			onOpeningChange(openingOfItem(image))
		}
	}
	const openItem = (item: KindedItem) => onOpeningChange(openingOfItem(item))
	const openInNewTab =
		onOpenInNewTab &&
		((item: KindedItem) => onOpenInNewTab(openingOfItem(item)))
	const openImageInNewTab =
		onOpenInNewTab &&
		(({ id }: NamedItem) => onOpenInNewTab({ kind: "image", name: id }))
	const showDraft = (shown: DocumentDraft) => {
		setHeldDraft(shown)
		onOpeningChange(documentOpeningOf(shown))
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
			showDraft({ name, title, startTitle: title, detail, template })
		})
	}
	const leaveDocument = () => {
		void closeAndRelist()
		close()
	}
	const showTitled = (draft: DocumentDraft) => {
		editor.current?.restoreTitle(draft.title)
		showDraft(draft)
	}
	const renameDocument = (opened: OpenedDocument, newTitle: string) => {
		const newName = documentNamedAs(opened.name, newTitle)
		if (newName === opened.name) {
			return
		}
		moveDocument({
			rename: (name) => actions.rename({ name, newName }),
			onMoved: (renamed) => showTitled(renamedDraftOf(opened, renamed)),
			onRefused: () => showTitled({ ...opened, title: opened.startTitle }),
		})
	}
	const deleteDocument = ({ name }: OpenedDocument) =>
		closeAndRelist().then(() => actions.remove(name, { onSuccess: close }))
	const isRenamePicked = useRef(false)
	const pickRename = () => {
		isRenamePicked.current = true
	}
	const titleFieldOnceRenamePicked = () => {
		if (!isRenamePicked.current) {
			return true
		}
		isRenamePicked.current = false
		return editor.current?.titleField() ?? false
	}
	const retitle = (title: string) => {
		if (openedDocument) {
			showDraft({ ...openedDocument, title })
		}
	}

	if (openedDocument && document) {
		const openedItem = { id: openedDocument.name, kind: "document" } as const
		return (
			<LibraryDocumentEditor
				{...formatActionsOf(document.markdown, edit)}
				body={document.markdown}
				detail={openedDocument.detail}
				isActionShown={(_subject, action) =>
					isActionShownOn(openedDocument, action)
				}
				key={openedDocument.openedAs ?? openedDocument.name}
				menuFinalFocus={titleFieldOnceRenamePicked}
				onBack={leaveDocument}
				onBodyChange={edit}
				onCaretChange={shareCaret}
				onCopy={() => copyAndWait(openedItem)}
				onDelete={() => deleteDocument(openedDocument)}
				onDownload={() => save(openedItem)}
				onOpenInNewTab={boundTo(openedItem, openInNewTab)}
				onRename={pickRename}
				onShowInFolder={boundTo(openedItem, reveal)}
				onTitleChange={retitle}
				onTitleConfirm={(newTitle) => renameDocument(openedDocument, newTitle)}
				people={people}
				ref={editor}
				template={openedDocument.template}
				title={openedDocument.title}
				writers={writers}
			/>
		)
	}

	return (
		<LibraryPanel
			filter={filter}
			isActionShown={isActionShownOn}
			items={[...importingItems, ...shownItems]}
			onFilterChange={setFilter}
			onCopy={copy}
			onDelete={remove}
			onDownload={save}
			onNewDocument={() => setPickedTemplate("blank")}
			onOpen={openItem}
			onOpenInNewTab={openInNewTab}
			onOpenItem={openItem}
			onRename={openItem}
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
						onDelete={remove}
						onDownload={save}
						onShowInFolder={reveal}
						onNext={() => openImageAt(imageIndex + 1)}
						onOpenInNewTab={openImageInNewTab}
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
