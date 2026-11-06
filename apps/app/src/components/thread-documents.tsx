import { useQuery } from "@tanstack/react-query"
import {
	createContext,
	type PropsWithChildren,
	useContext,
	useMemo,
	useState,
} from "react"

import {
	BoardCard,
	type BoardCardSummary,
} from "@workspace/ui/components/board/board-card"
import {
	DOCUMENT_PANEL_MAX_WIDTH,
	DocumentPanel,
} from "@workspace/ui/components/document-panel"
import {
	FileReferenceChip,
	type FileReferenceChipProps,
} from "@workspace/ui/components/file-reference-chip"
import { LibraryDocumentPresence } from "@workspace/ui/components/library-document-agents"
import { LibraryDocumentBlockEditor } from "@workspace/ui/components/library-document-block-editor"
import type { MarkdownRunRenderProps } from "@workspace/ui/components/markdown/run"
import { toRelativeTime } from "@workspace/ui/lib/time-format"

import { useLibraryOnScreen } from "@/components/answer-image-viewer"
import { LibraryBoardCanvas } from "@/components/library-board"
import {
	type Bot,
	LIBRARY_CHANGED_EVENT,
	type LibraryItem,
} from "@/lib/bindings"
import {
	documentRunsOf,
	isTrailingRun,
	textCarryingDocuments,
} from "@/lib/chat/document-mentions"
import { boardSnapshotOf } from "@/lib/library/library-boards"
import { titleOf } from "@/lib/library/library-items"
import { libraryQueryKeys } from "@/lib/library/library-query-keys"
import {
	type ThreadLibraryItem,
	useFollowedLibraryDocument,
} from "@/lib/library/use-followed-library-document"
import { useLibraryBoardPointerShare } from "@/lib/library/use-library-board-pointer-share"
import { useLibraryBoardPresence } from "@/lib/library/use-library-board-presence"
import { useLibraryBoardSession } from "@/lib/library/use-library-board-session"
import { useLibraryDocumentSession } from "@/lib/library/use-library-document-session"
import { useLibraryImageResolver } from "@/lib/library/use-library-image-sources"
import {
	libraryBoardSummaryQueryOf,
	libraryItemsQueryOf,
} from "@/lib/library/use-library-items"
import { useSaveMessageAsDocument } from "@/lib/library/use-save-message-as-document"
import { useStopLibraryBoardDrawers } from "@/lib/library/use-stop-library-writers"
import {
	type BoardDrawing,
	NOBODY_DRAWING,
	useThreadBoardDrawers,
} from "@/lib/library/use-thread-board-drawers"
import {
	useOpenLibraryDocument,
	useOpenLibraryItemInItsTab,
	useOpenLibraryItemInNewTab,
} from "@/lib/navigation/use-open-library-document"
import { useInvalidateOnHostEvent } from "@/lib/query/host-invalidations"
import {
	keepDocumentPanelWidth,
	readDocumentPanelWidth,
} from "@/lib/user/preferences-mirror"

type ThreadDocuments = {
	spaceId: string
	isJoined: boolean
	opened: ThreadLibraryItem | null
	open: (item: ThreadLibraryItem) => void
	close: () => void
	boardOf: (name: string) => LibraryItem | undefined
	saveAsDocument?: (messageId: string) => void
}

export const ThreadDocumentsContext = createContext<ThreadDocuments | null>(
	null,
)

const ThreadBoardDrawingContext = createContext<(name: string) => BoardDrawing>(
	() => NOBODY_DRAWING,
)

type BoardsByName = ReadonlyMap<string, LibraryItem>

const NO_BOARDS: BoardsByName = new Map()

const boardsByNameOf = (items: LibraryItem[]): BoardsByName =>
	new Map(
		items
			.filter(({ kind }) => kind === "board")
			.map((item) => [item.name, item]),
	)

const useLibraryBoards = (spaceId: string | undefined) => {
	useInvalidateOnHostEvent(
		LIBRARY_CHANGED_EVENT,
		spaceId ? [libraryQueryKeys.itemsOf(spaceId)] : [],
	)
	const { data } = useQuery({
		...libraryItemsQueryOf(spaceId ?? ""),
		enabled: spaceId !== undefined,
		select: boardsByNameOf,
	})
	return data ?? NO_BOARDS
}

const isOpenedItem = (
	opened: ThreadLibraryItem | null,
	{ kind, name }: ThreadLibraryItem,
) => opened?.kind === kind && opened.name === name

export const useThreadDocuments = (
	conversationId: string | null,
	workingAgentIds: string[],
): ThreadDocuments | null => {
	const library = useLibraryOnScreen()
	const spaceId = library?.spaceId
	const isJoined = library?.isJoined ?? false
	const { opened, open, close } = useFollowedLibraryDocument({
		spaceId,
		conversationId,
		workingAgentIds,
	})
	const boards = useLibraryBoards(spaceId)
	const save = useSaveMessageAsDocument(spaceId, ({ name }) =>
		open({ kind: "document", name }),
	)

	return useMemo(
		() =>
			spaceId
				? {
						spaceId,
						isJoined,
						opened,
						open,
						close,
						boardOf: (name: string) => boards.get(name),
						saveAsDocument: conversationId
							? (messageId: string) => save({ conversationId, messageId })
							: undefined,
					}
				: null,
		[spaceId, isJoined, opened, open, close, boards, conversationId, save],
	)
}

const documentTitleOf = (name: string) => titleOf({ kind: "document", name })

const chipStateOf = (
	isWriting: boolean,
	isOpen: boolean,
): FileReferenceChipProps["state"] => {
	if (isWriting) {
		return "writing"
	}
	return isOpen ? "open" : "rest"
}

type ThreadDocumentChipProps = {
	documents: ThreadDocuments
	name: string
	isWriting: boolean
}

const ThreadDocumentChip = ({
	documents,
	name,
	isWriting,
}: ThreadDocumentChipProps) => {
	const openInNewTab = useOpenLibraryItemInNewTab()

	return (
		<FileReferenceChip
			onOpen={() => documents.open({ kind: "document", name })}
			onOpenInNewTab={() => openInNewTab({ kind: "document", name })}
			state={chipStateOf(
				isWriting,
				isOpenedItem(documents.opened, { kind: "document", name }),
			)}
			title={documentTitleOf(name)}
		/>
	)
}

type DocumentReferencesSource = {
	documents: ThreadDocuments
	text: string
	names: string[]
	isWriting: boolean
}

export const documentReferencesOf = ({
	documents,
	text,
	names,
	isWriting,
}: DocumentReferencesSource) => {
	const documentNames = names.filter((name) => !documents.boardOf(name))
	const shownText = textCarryingDocuments(text, documentNames)
	const runs = documentRunsOf(shownText, documentNames)
	const trailingNames = new Set(runs.filter(isTrailingRun).map(({ id }) => id))
	const renderRun = ({ id, isEnd }: MarkdownRunRenderProps) => {
		if (!isEnd) {
			return null
		}
		const chip = (
			<ThreadDocumentChip
				documents={documents}
				isWriting={isWriting}
				name={id}
			/>
		)
		return trailingNames.has(id) ? <> {chip}</> : chip
	}

	return { text: shownText, runs, renderRun }
}

const useKeptPanelWidth = () => {
	const [keptWidth, setKeptWidth] = useState(readDocumentPanelWidth)

	const keepWidth = (width: number) => {
		keepDocumentPanelWidth(width)
		setKeptWidth(width)
	}

	return { width: keptWidth ?? DOCUMENT_PANEL_MAX_WIDTH, keepWidth }
}

type ThreadDocumentPanelProps = {
	spaceId: string
	isJoined: boolean
	name: string
	onClose: () => void
}

export const ThreadDocumentPanel = ({
	spaceId,
	isJoined,
	name,
	onClose,
}: ThreadDocumentPanelProps) => {
	const { document, edit } = useLibraryDocumentSession(spaceId, name)
	const openInLibrary = useOpenLibraryDocument()
	const resolveImage = useLibraryImageResolver(spaceId, isJoined)
	const { width, keepWidth } = useKeptPanelWidth()

	return (
		<DocumentPanel
			defaultWidth={DOCUMENT_PANEL_MAX_WIDTH}
			onClose={onClose}
			onOpenInLibrary={() => openInLibrary(name)}
			onWidthChange={keepWidth}
			title={documentTitleOf(name)}
			width={width}
		>
			{document ? (
				<LibraryDocumentBlockEditor
					body={document.markdown}
					onBodyChange={edit}
					resolveImage={resolveImage}
				/>
			) : null}
		</DocumentPanel>
	)
}

const UNLISTED_BOARD: LibraryItem = {
	name: "",
	kind: "board",
	path: "",
	bytes: 0,
	modifiedAt: 0,
	createdAt: null,
}

const useBoardSummary = (spaceId: string, board: LibraryItem | undefined) =>
	useQuery({
		...libraryBoardSummaryQueryOf(spaceId, board ?? UNLISTED_BOARD),
		enabled: board !== undefined,
	}).data

const useBoardCardSummary = (
	spaceId: string,
	board: LibraryItem,
): BoardCardSummary => {
	const { data, isError } = useQuery(libraryBoardSummaryQueryOf(spaceId, board))
	if (data) {
		return {
			status: "loaded",
			itemCount: data.nodeCount,
			snapshot: boardSnapshotOf(data),
		}
	}
	return { status: isError ? "failed" : "loading" }
}

type ThreadBoardPanelProps = {
	documents: ThreadDocuments
	bots: Bot[]
	name: string
}

export const ThreadBoardPanel = ({
	documents,
	bots,
	name,
}: ThreadBoardPanelProps) => {
	const board = useLibraryBoardSession(documents.spaceId, name)
	const presence = useLibraryBoardPresence({
		spaceId: documents.spaceId,
		name,
		isJoined: documents.isJoined,
		bots,
	})
	const pointerShare = useLibraryBoardPointerShare(documents.spaceId, name)
	const { stopAll } = useStopLibraryBoardDrawers(documents.spaceId)
	const summary = useBoardSummary(documents.spaceId, documents.boardOf(name))
	const openInItsTab = useOpenLibraryItemInItsTab()
	const { width, keepWidth } = useKeptPanelWidth()

	const openInLibrary = () => {
		documents.close()
		openInItsTab({ kind: "board", name })
	}

	return (
		<DocumentPanel
			defaultWidth={DOCUMENT_PANEL_MAX_WIDTH}
			onClose={documents.close}
			onOpenInLibrary={openInLibrary}
			onWidthChange={keepWidth}
			presence={
				<LibraryDocumentPresence
					activity="drawing"
					onStopAll={() => stopAll(name)}
					people={presence.people}
					writers={presence.drawers}
				/>
			}
			title={titleOf({ kind: "board", name })}
			variant="board"
			width={width}
		>
			<LibraryBoardCanvas
				board={board}
				pointerShare={pointerShare}
				presence={presence}
				summary={summary}
			/>
		</DocumentPanel>
	)
}

type ThreadOpenedItemPanelProps = {
	documents: ThreadDocuments
	bots: Bot[]
	opened: ThreadLibraryItem
}

export const ThreadOpenedItemPanel = ({
	documents,
	bots,
	opened,
}: ThreadOpenedItemPanelProps) =>
	opened.kind === "board" ? (
		<ThreadBoardPanel
			bots={bots}
			documents={documents}
			key={opened.name}
			name={opened.name}
		/>
	) : (
		<ThreadDocumentPanel
			isJoined={documents.isJoined}
			key={opened.name}
			name={opened.name}
			onClose={documents.close}
			spaceId={documents.spaceId}
		/>
	)

type ThreadBoardDrawersProps = PropsWithChildren<{
	spaceId: string | undefined
	conversationId: string | null
	workingAgentIds: string[]
	bots: Bot[]
}>

export const ThreadBoardDrawers = ({
	children,
	...thread
}: ThreadBoardDrawersProps) => {
	const drawingOf = useThreadBoardDrawers(thread)
	return (
		<ThreadBoardDrawingContext value={drawingOf}>
			{children}
		</ThreadBoardDrawingContext>
	)
}

type ThreadBoardCardProps = {
	documents: ThreadDocuments
	board: LibraryItem
	now: number
}

const ThreadBoardCard = ({ documents, board, now }: ThreadBoardCardProps) => {
	const summary = useBoardCardSummary(documents.spaceId, board)
	const drawingOf = useContext(ThreadBoardDrawingContext)
	const { drawing, pointers } = drawingOf(board.name)
	const item: ThreadLibraryItem = { kind: "board", name: board.name }

	return (
		<BoardCard
			drawing={drawing}
			editedLabel={toRelativeTime(board.modifiedAt, now)}
			isOpenBeside={isOpenedItem(documents.opened, item)}
			onOpen={() => documents.open(item)}
			pointers={pointers}
			summary={summary}
			title={titleOf(board)}
		/>
	)
}

type ThreadBoardCardsProps = {
	documents: ThreadDocuments
	names: string[]
	now: number
}

export const ThreadBoardCards = ({
	documents,
	names,
	now,
}: ThreadBoardCardsProps) =>
	names.flatMap((name) => {
		const board = documents.boardOf(name)
		return board
			? [
					<ThreadBoardCard
						board={board}
						documents={documents}
						key={name}
						now={now}
					/>,
				]
			: []
	})
