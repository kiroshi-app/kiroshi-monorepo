import { type ReactNode, useEffect, useRef, useState } from "react"

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
import {
	LibraryDocumentSkeleton,
	LibraryImageSkeleton,
	LibraryItemUnavailable,
} from "@workspace/ui/components/library-tab-states"
import { i18n } from "@workspace/ui/lib/i18n"

import { LibraryBoard } from "@/components/library-board"
import { LibraryDropTarget } from "@/components/library-drop-target"
import type { LibraryBoardSummary, LibraryItem, Space } from "@/lib/bindings"
import type { Bot } from "@/lib/conversations/store-contract"
import { failureReporterIn } from "@/lib/failure-report"
import { storedImageSourceOf } from "@/lib/library/library-image-source"
import {
	documentFormatOf,
	documentNamedAs,
	matchesQuery,
	shownTitleOf,
	titleOf,
	toShownItem,
} from "@/lib/library/library-items"
import { readLinkPreview } from "@/lib/library/library-link-preview"
import { useCreateLibraryBoard } from "@/lib/library/use-create-library-board"
import { useCreateLibraryDocument } from "@/lib/library/use-create-library-document"
import {
	useJoinedLibraryActions,
	useLibraryActions,
} from "@/lib/library/use-library-actions"
import {
	type LibraryCommentPeople,
	useLibraryCommentPeople,
} from "@/lib/library/use-library-comment-people"
import { useLibraryDocumentComments } from "@/lib/library/use-library-document-comments"
import { useLibraryDocumentSession } from "@/lib/library/use-library-document-session"
import { useLibraryDocumentWriters } from "@/lib/library/use-library-document-writers"
import { useLibraryImageComments } from "@/lib/library/use-library-image-comments"
import {
	useLibraryImageResolver,
	useLibraryImageSources,
} from "@/lib/library/use-library-image-sources"
import {
	useLibraryGalleryImports,
	useLibraryImageSave,
	useLibraryImports,
} from "@/lib/library/use-library-imports"
import {
	type LibraryItemsRead,
	useLibraryItems,
} from "@/lib/library/use-library-items"
import { useStopLibraryWriters } from "@/lib/library/use-stop-library-writers"
import type { LibraryOpening } from "@/lib/navigation/library-search"
import { useSkeletonSlot } from "@/lib/query/use-skeleton-slot"
import { isNewTabClickInFlight } from "@/lib/tabs/new-tab-clicks"

export type LibraryScreenProps = {
	spaceId: string
	isJoined: boolean
	bots: Bot[]
	viewerName: string
	spaceTint?: Space["colour"]
	opening?: LibraryOpening
	onOpeningChange: (opening: LibraryOpening | undefined) => void
	onOpenInNewTab?: (opening: LibraryOpening) => void
	onOpenBoard: (opening: LibraryOpening) => void
	onCloseTab?: () => void
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

type Openers = {
	inPlace: (opening: LibraryOpening) => void
	inItsTab: (opening: LibraryOpening) => void
}

const openerOf =
	({ inPlace, inItsTab }: Openers) =>
	(item: KindedItem) => {
		const opening = openingOfItem(item)
		return opening.kind === "board" ? inItsTab(opening) : inPlace(opening)
	}

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

const documentNameOf = (opening: LibraryOpening | undefined) =>
	opening?.kind === "document" ? opening.name : null

type OpeningRead = {
	opening: LibraryOpening | undefined
	isListing: boolean
	hasListed: boolean
	isListed: boolean
	isImageListed: boolean
	isDocumentOpened: boolean
	isDocumentRead: boolean
	hasFailedToOpen: boolean
	hasBoardFailed: boolean
}

const openingStatusOf = (read: OpeningRead) => {
	const isMissing = read.hasListed && !read.isListed && !read.isDocumentOpened
	const hasNoOpenFailure =
		read.opening?.kind !== "document" || read.isDocumentRead
	const hasFailedToRead =
		read.hasFailedToOpen ||
		read.hasBoardFailed ||
		(!read.isListing && !read.hasListed)
	const isShown =
		read.isImageListed || (read.isDocumentOpened && read.isDocumentRead)
	return {
		isMissing,
		notifiedMissing: isMissing && hasNoOpenFailure ? read.opening : undefined,
		hasFailedToRead,
		isAwaited:
			read.opening !== undefined &&
			read.opening.kind !== "board" &&
			!isShown &&
			!isMissing &&
			!hasFailedToRead,
	}
}

type OpenedBoard = {
	summary: LibraryBoardSummary | undefined
	hasFailedToRead: boolean
}

const NO_OPENED_BOARD: OpenedBoard = {
	summary: undefined,
	hasFailedToRead: false,
}

const openedBoardOf = (
	library: LibraryItemsRead,
	listed: LibraryItem | undefined,
): OpenedBoard => {
	if (listed?.kind !== "board") {
		return NO_OPENED_BOARD
	}
	return {
		summary: library.summaryOf(listed),
		hasFailedToRead: library.hasSummaryFailed(listed),
	}
}

const reportFailure = failureReporterIn("library-screen")

const missingNotice = () => ({
	title: i18n.t("common:library.tab.unavailable.missing.title"),
	description: i18n.t("common:library.tab.unavailable.missing.body"),
})

const useMissingOpeningNotice = (
	spaceId: string,
	missing: LibraryOpening | undefined,
) => {
	const raisedFor = useRef<string | null>(null)
	const missingKey = missing && `${missing.kind}:${missing.name}`
	useEffect(() => {
		if (!missingKey) {
			raisedFor.current = null
			return
		}
		if (raisedFor.current === missingKey) {
			return
		}
		raisedFor.current = missingKey
		void reportFailure(missingNotice(), { space: spaceId })
	}, [spaceId, missingKey])
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

type LibraryOpeningStateProps = {
	spaceId: string
	isJoined: boolean
	bots: Bot[]
	commentPeople: LibraryCommentPeople
	opening: LibraryOpening
	boardSummary: LibraryBoardSummary | undefined
	isMissing: boolean
	hasFailedToRead: boolean
	skeleton: ReactNode
	onCloseTab?: () => void
	onBackToLibrary: () => void
	onDelete: () => void
}

type LibraryBoardOpeningProps = Pick<
	LibraryOpeningStateProps,
	| "spaceId"
	| "isJoined"
	| "bots"
	| "commentPeople"
	| "opening"
	| "boardSummary"
	| "onBackToLibrary"
	| "onDelete"
>

const LibraryBoardOpening = ({
	spaceId,
	isJoined,
	bots,
	commentPeople,
	opening: { name },
	boardSummary,
	onBackToLibrary,
	onDelete,
}: LibraryBoardOpeningProps) => (
	<LibraryBoard
		bots={bots}
		commentPeople={commentPeople}
		isJoined={isJoined}
		key={name}
		name={name}
		onBack={onBackToLibrary}
		onDelete={onDelete}
		spaceId={spaceId}
		summary={boardSummary}
		title={titleOf({ kind: "board", name })}
	/>
)

const LibraryOpeningState = ({
	isMissing,
	hasFailedToRead,
	skeleton,
	onCloseTab,
	...opened
}: LibraryOpeningStateProps) => {
	const { opening, onBackToLibrary } = opened
	if (isMissing) {
		return (
			<LibraryItemUnavailable
				name={opening.name}
				onAction={onCloseTab ?? onBackToLibrary}
				reason="missing"
			/>
		)
	}
	if (hasFailedToRead) {
		return (
			<LibraryItemUnavailable
				name={opening.name}
				onAction={onBackToLibrary}
				reason="unreadable"
			/>
		)
	}
	if (opening.kind === "board") {
		return <LibraryBoardOpening {...opened} />
	}
	return skeleton
}

const DOCUMENT_OPENING_SKELETON = <LibraryDocumentSkeleton />

const IMAGE_OPENING_SKELETON = <LibraryImageSkeleton />

type OpeningWait = {
	opening: LibraryOpening | undefined
	isAwaited: boolean
	isImageListed: boolean
}

const useOpeningSkeleton = ({
	opening,
	isAwaited,
	isImageListed,
}: OpeningWait) => {
	const slot = useSkeletonSlot(
		isAwaited,
		opening?.kind === "image"
			? IMAGE_OPENING_SKELETON
			: DOCUMENT_OPENING_SKELETON,
	)
	const skeleton = opening ? slot : undefined
	const isStandingIn = skeleton !== undefined
	return {
		skeleton,
		isStandingIn,
		isImageShown: isImageListed && !isStandingIn,
	}
}

export const LibraryScreen = ({
	spaceId,
	isJoined,
	bots,
	viewerName,
	spaceTint,
	opening,
	onOpeningChange,
	onOpenInNewTab,
	onOpenBoard,
	onCloseTab,
}: LibraryScreenProps) => {
	const library = useLibraryItems(spaceId)
	const sourceOf = useLibraryImageSources(spaceId, library.items, isJoined)
	const resolveImage = useLibraryImageResolver(spaceId, isJoined)
	const addGalleryImages = useLibraryGalleryImports(spaceId, isJoined)
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
	const saveImage = useLibraryImageSave()
	const saveToLibrary = ({ id }: NamedItem) =>
		saveImage({ spaceId, isJoined, image: storedImageSourceOf(spaceId, id) })
	const [filter, setFilter] = useState<LibraryFilter>("all")
	const [query, setQuery] = useState("")
	const [heldDraft, setHeldDraft] = useState<DocumentDraft | null>(null)
	const [pickedTemplate, setPickedTemplate] =
		useState<LibraryDocumentTemplate | null>(null)
	const editor = useRef<LibraryDocumentEditorHandle>(null)
	const { create, isCreating } = useCreateLibraryDocument(spaceId)
	const createBoard = useCreateLibraryBoard(spaceId)
	const { importingItems, importDropped } = useLibraryImports(spaceId, isJoined)
	const toShown = (item: LibraryItem) =>
		toShownItem(
			item,
			{
				excerpt: library.excerptOf(item),
				src: sourceOf(item),
				summary: library.summaryOf(item),
			},
			library.readAt,
		)
	const listedOpened = library.items.find(isNamedBy(opening))
	const isImageListed = listedOpened?.kind === "image"
	const openedBoard = openedBoardOf(library, listedOpened)
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
	} = useLibraryDocumentSession(spaceId, documentNameOf(opening))
	const { writers, people } = useLibraryDocumentWriters({
		spaceId,
		name: openedDocument?.name ?? null,
		isJoined,
		document,
		bots,
		title: shownTitleOf(openedDocument?.title ?? ""),
	})
	const { stopAll, stop } = useStopLibraryWriters(spaceId)
	const commentPeople = useLibraryCommentPeople({ spaceId, bots, viewerName })
	const documentComments = useLibraryDocumentComments({
		spaceId,
		name: openedDocument?.name,
		hasOpened: document !== null,
		people: commentPeople,
	})
	const { isMissing, notifiedMissing, hasFailedToRead, isAwaited } =
		openingStatusOf({
			opening,
			isListing: library.isLoading,
			hasListed: library.hasLoaded,
			isListed: listedOpened !== undefined,
			isImageListed,
			isDocumentOpened: openedDocument !== null,
			isDocumentRead: document !== null,
			hasFailedToOpen,
			hasBoardFailed: openedBoard.hasFailedToRead,
		})
	useMissingOpeningNotice(spaceId, notifiedMissing)
	const openingWait = useOpeningSkeleton({ opening, isAwaited, isImageListed })

	const shownItems = library.items
		.filter((item) => matchesQuery(item, query))
		.map(toShown)
	const images = shownItems.filter(
		(item): item is ShownImage => item.kind === "image",
	)
	const imageIndex = images.findIndex(isOpenedBy(opening))
	const imageComments = useLibraryImageComments({
		spaceId,
		name: images[imageIndex]?.id,
		people: commentPeople,
	})

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
	const openItem = openerOf({ inPlace: onOpeningChange, inItsTab: onOpenBoard })
	const newBoard = () =>
		createBoard((name) => onOpenBoard({ kind: "board", name }))
	const openInNewTab =
		onOpenInNewTab &&
		((item: KindedItem) => onOpenInNewTab(openingOfItem(item)))
	const openPressedItem = (item: KindedItem) =>
		openInNewTab && isNewTabClickInFlight()
			? openInNewTab(item)
			: openItem(item)
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
	const deleteAndClose = ({ id }: NamedItem) =>
		actions.remove(id, { onSuccess: close })
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

	if (openedDocument && document && !openingWait.isStandingIn) {
		const openedItem = { id: openedDocument.name, kind: "document" } as const
		return (
			<LibraryDocumentEditor
				{...documentComments}
				body={document.markdown}
				detail={openedDocument.detail}
				format={documentFormatOf(openedDocument.name)}
				isActionShown={(_subject, action) =>
					isActionShownOn(openedDocument, action)
				}
				key={openedDocument.openedAs ?? openedDocument.name}
				menuFinalFocus={titleFieldOnceRenamePicked}
				onAddImages={addGalleryImages}
				onBack={leaveDocument}
				onBodyChange={edit}
				onCaretChange={shareCaret}
				onCopy={() => copyAndWait(openedItem)}
				onDelete={() => deleteDocument(openedDocument)}
				onDownload={() => save(openedItem)}
				onLinkPreview={readLinkPreview}
				onOpenInNewTab={boundTo(openedItem, openInNewTab)}
				onRename={pickRename}
				onShowInFolder={boundTo(openedItem, reveal)}
				onStop={(agent) => stop(openedDocument.name, agent)}
				onStopAll={() => stopAll(openedDocument.name)}
				onTitleChange={retitle}
				onTitleConfirm={(newTitle) => renameDocument(openedDocument, newTitle)}
				people={people}
				ref={editor}
				resolveImage={resolveImage}
				template={openedDocument.template}
				title={openedDocument.title}
				writers={writers}
			/>
		)
	}

	if (opening && !openingWait.isImageShown) {
		return (
			<LibraryOpeningState
				boardSummary={openedBoard.summary}
				bots={bots}
				commentPeople={commentPeople}
				hasFailedToRead={hasFailedToRead}
				isJoined={isJoined}
				isMissing={isMissing}
				onBackToLibrary={close}
				onCloseTab={onCloseTab}
				onDelete={() => deleteAndClose({ id: opening.name })}
				opening={opening}
				skeleton={openingWait.skeleton}
				spaceId={spaceId}
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
			onNewBoard={newBoard}
			onNewDocument={() => setPickedTemplate("blank")}
			onOpen={openItem}
			onOpenInNewTab={openInNewTab}
			onOpenItem={openPressedItem}
			onRename={openItem}
			onSearchQueryChange={setQuery}
			onShowInFolder={reveal}
			onStartTemplate={setPickedTemplate}
			overlay={
				<>
					<LibraryLightbox
						{...imageComments}
						count={images.length}
						image={images[imageIndex] ?? null}
						onClose={close}
						onCopy={copyAndWait}
						onCopyImage={copyAndWait}
						onDelete={deleteAndClose}
						onDownload={save}
						onShowInFolder={reveal}
						onNext={() => openImageAt(imageIndex + 1)}
						onOpenInNewTab={openImageInNewTab}
						onPrevious={() => openImageAt(imageIndex - 1)}
						onSaveToLibrary={saveToLibrary}
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
