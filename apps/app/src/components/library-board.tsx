import { useState } from "react"

import type { BoardLibraryItem } from "@workspace/ui/components/board/board-dock"
import { BoardShape } from "@workspace/ui/components/board/board-shape"
import { BoardCanvas } from "@workspace/ui/components/board-canvas"
import type {
	BoardItem,
	BoardView,
	BoardViewport,
} from "@workspace/ui/components/board-view"
import { LibraryDocumentBar } from "@workspace/ui/components/library-document-view"
import { LibraryItemUnavailable } from "@workspace/ui/components/library-tab-states"
import { ScreenLayout } from "@workspace/ui/components/screen-layout"

import type { LibraryBoardSummary, LibraryItem } from "@/lib/bindings"
import { libraryBoardAdditionsOf } from "@/lib/library/library-board-additions"
import { boardOriginOf } from "@/lib/library/library-boards"
import { useLibraryBoardKeys } from "@/lib/library/use-library-board-keys"
import { useLibraryBoardSession } from "@/lib/library/use-library-board-session"

type LibraryBoardProps = {
	spaceId: string
	name: string
	title: string
	summary: LibraryBoardSummary | undefined
	libraryItems: readonly BoardLibraryItem[]
	importFiles: (files: readonly File[]) => Promise<LibraryItem[]>
	onBack: () => void
	onDelete: () => void
}

type LibraryBoardShelf = {
	items: readonly BoardLibraryItem[]
	importFiles: (files: readonly File[]) => Promise<LibraryItem[]>
}

const NO_LIBRARY_ITEMS = [] as const

const UNOPENED_VIEW: BoardView = { objects: [] }

const leaveBoardUnchanged = () => undefined

const NO_ADDITIONS = {
	pickItem: leaveBoardUnchanged,
	dropItem: leaveBoardUnchanged,
	paste: leaveBoardUnchanged,
	dropFiles: leaveBoardUnchanged,
}

const renderBoardObject = ({ style, text, size }: BoardItem) => (
	<BoardShape
		fill={style?.fill}
		height={size.height}
		kind={style?.shape ?? "rounded-rectangle"}
		label={text}
		width={size.width}
	/>
)

const openingViewportOf = (summary: LibraryBoardSummary): BoardViewport => ({
	offset: boardOriginOf(summary),
	zoom: 1,
})

const UNPLACED_VIEWPORT: BoardViewport = { offset: { x: 0, y: 0 }, zoom: 1 }

type LibraryBoardCanvasProps = {
	board: ReturnType<typeof useLibraryBoardSession>
	summary: LibraryBoardSummary | undefined
	library?: LibraryBoardShelf
}

export const LibraryBoardCanvas = ({
	board,
	summary,
	library,
}: LibraryBoardCanvasProps) => {
	const [movedViewport, setViewport] = useState<BoardViewport | null>(null)
	const viewport =
		movedViewport ?? (summary ? openingViewportOf(summary) : UNPLACED_VIEWPORT)
	const { tool, pickTool } = useLibraryBoardKeys(board)
	const additions = library
		? libraryBoardAdditionsOf({
				board,
				libraryItems: library.items,
				importFiles: library.importFiles,
				viewport,
			})
		: NO_ADDITIONS

	return (
		<BoardCanvas
			isConnecting={tool === "connector"}
			libraryItems={library?.items ?? NO_LIBRARY_ITEMS}
			onDropFiles={additions.dropFiles}
			onIntent={board.apply}
			onLibraryItemDrop={additions.dropItem}
			onLibraryItemPick={additions.pickItem}
			onPaste={additions.paste}
			onToolChange={pickTool}
			onViewportChange={setViewport}
			renderObject={renderBoardObject}
			status={board.view && summary ? "ready" : "loading"}
			tool={tool}
			view={board.view ?? UNOPENED_VIEW}
			viewport={viewport}
		/>
	)
}

export const LibraryBoard = ({
	spaceId,
	name,
	title,
	summary,
	libraryItems,
	importFiles,
	onBack,
	onDelete,
}: LibraryBoardProps) => {
	const board = useLibraryBoardSession(spaceId, name)

	if (board.hasFailedToOpen) {
		return (
			<LibraryItemUnavailable
				name={name}
				onAction={onBack}
				reason="unreadable"
			/>
		)
	}

	return (
		<ScreenLayout
			header={
				<LibraryDocumentBar
					item={{ name: title }}
					onBack={onBack}
					onDelete={onDelete}
				/>
			}
			scroller={() => (
				<LibraryBoardCanvas
					board={board}
					library={{ items: libraryItems, importFiles }}
					summary={summary}
				/>
			)}
		/>
	)
}
