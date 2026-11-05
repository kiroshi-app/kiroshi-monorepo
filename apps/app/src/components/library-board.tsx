import { useState } from "react"

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

import type { LibraryBoardSummary } from "@/lib/bindings"
import { boardOriginOf } from "@/lib/library/library-boards"
import { useLibraryBoardKeys } from "@/lib/library/use-library-board-keys"
import { useLibraryBoardSession } from "@/lib/library/use-library-board-session"

type LibraryBoardProps = {
	spaceId: string
	name: string
	title: string
	summary: LibraryBoardSummary | undefined
	onBack: () => void
	onDelete: () => void
}

const NO_LIBRARY_ITEMS = [] as const

const UNOPENED_VIEW: BoardView = { objects: [] }

const leaveBoardUnchanged = () => undefined

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
}

export const LibraryBoardCanvas = ({
	board,
	summary,
}: LibraryBoardCanvasProps) => {
	const [movedViewport, setViewport] = useState<BoardViewport | null>(null)
	const viewport =
		movedViewport ?? (summary ? openingViewportOf(summary) : UNPLACED_VIEWPORT)
	const { tool, pickTool } = useLibraryBoardKeys(board)

	return (
		<BoardCanvas
			libraryItems={NO_LIBRARY_ITEMS}
			onDropFiles={leaveBoardUnchanged}
			onIntent={board.apply}
			onLibraryItemDrop={leaveBoardUnchanged}
			onLibraryItemPick={leaveBoardUnchanged}
			onPaste={leaveBoardUnchanged}
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
			scroller={() => <LibraryBoardCanvas board={board} summary={summary} />}
		/>
	)
}
