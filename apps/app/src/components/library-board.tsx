import { useState } from "react"

import type { BoardNode } from "@workspace/shared/board/board"
import type { BoardLibraryItem } from "@workspace/ui/components/board/board-dock"
import { BoardImage } from "@workspace/ui/components/board/board-image"
import { BoardLibraryCard } from "@workspace/ui/components/board/board-library-card"
import { BoardLinkCard } from "@workspace/ui/components/board/board-link-card"
import { BoardShape } from "@workspace/ui/components/board/board-shape"
import { BoardCanvas } from "@workspace/ui/components/board-canvas"
import type {
	BoardItem,
	BoardView,
	BoardViewport,
} from "@workspace/ui/components/board-view"
import { LibraryDocumentPresence } from "@workspace/ui/components/library-document-agents"
import { LibraryDocumentBar } from "@workspace/ui/components/library-document-view"
import { LibraryItemUnavailable } from "@workspace/ui/components/library-tab-states"
import { ScreenLayout } from "@workspace/ui/components/screen-layout"

import type { LibraryBoardSummary, LibraryItem } from "@/lib/bindings"
import type { Bot } from "@/lib/conversations/store-contract"
import { libraryBoardAdditionsOf } from "@/lib/library/library-board-additions"
import {
	imageSourceOf,
	libraryCardOf,
	linkCardOf,
} from "@/lib/library/library-board-objects"
import type { LibraryBoardPresence } from "@/lib/library/library-board-presence"
import { boardOriginOf } from "@/lib/library/library-boards"
import { useLibraryBoardKeys } from "@/lib/library/use-library-board-keys"
import { useLibraryBoardPresence } from "@/lib/library/use-library-board-presence"
import { useLibraryBoardSession } from "@/lib/library/use-library-board-session"
import { useStopLibraryWriters } from "@/lib/library/use-stop-library-writers"

type LibraryBoardProps = {
	spaceId: string
	isJoined: boolean
	bots: Bot[]
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
	pickableItems: readonly BoardLibraryItem[]
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

const renderShape = ({ style, text, size }: BoardItem) => (
	<BoardShape
		fill={style?.fill}
		height={size.height}
		kind={style?.shape ?? "rounded-rectangle"}
		label={text}
		width={size.width}
	/>
)

type BoardObjectSources = {
	nodeOf: (id: string) => BoardNode | undefined
	libraryItems: readonly BoardLibraryItem[]
}

const renderObjectFrom =
	({ nodeOf, libraryItems }: BoardObjectSources) =>
	(item: BoardItem) => {
		const node = nodeOf(item.id)
		switch (node?.kind) {
			case "image":
				return (
					<BoardImage
						alt={node.alt ?? ""}
						height={item.size.height}
						src={imageSourceOf(node, libraryItems)}
						width={item.size.width}
					/>
				)
			case "linkCard":
				return <BoardLinkCard {...linkCardOf(node)} />
			case "libraryCard":
				return <BoardLibraryCard {...libraryCardOf(node, libraryItems)} />
			default:
				return renderShape(item)
		}
	}

const openingViewportOf = (summary: LibraryBoardSummary): BoardViewport => ({
	offset: boardOriginOf(summary),
	zoom: 1,
})

const UNPLACED_VIEWPORT: BoardViewport = { offset: { x: 0, y: 0 }, zoom: 1 }

type LibraryBoardCanvasProps = {
	board: ReturnType<typeof useLibraryBoardSession>
	summary: LibraryBoardSummary | undefined
	library?: LibraryBoardShelf
	presence?: LibraryBoardPresence
}

export const LibraryBoardCanvas = ({
	board,
	summary,
	library,
	presence,
}: LibraryBoardCanvasProps) => {
	const [movedViewport, setViewport] = useState<BoardViewport | null>(null)
	const viewport =
		movedViewport ?? (summary ? openingViewportOf(summary) : UNPLACED_VIEWPORT)
	const { tool, pickTool } = useLibraryBoardKeys(board)
	const additions = library
		? libraryBoardAdditionsOf({
				board,
				libraryItems: library.pickableItems,
				importFiles: library.importFiles,
				viewport,
			})
		: NO_ADDITIONS

	return (
		<BoardCanvas
			isConnecting={tool === "connector"}
			libraryItems={library?.pickableItems ?? NO_LIBRARY_ITEMS}
			onDropFiles={additions.dropFiles}
			onDropUrl={leaveBoardUnchanged}
			onIntent={board.apply}
			onLibraryItemDrop={additions.dropItem}
			onLibraryItemPick={additions.pickItem}
			onPaste={additions.paste}
			onToolChange={pickTool}
			onViewportChange={setViewport}
			outlines={presence?.outlines}
			pointers={presence?.pointers}
			renderObject={renderObjectFrom({
				nodeOf: board.nodeOf,
				libraryItems: library?.items ?? NO_LIBRARY_ITEMS,
			})}
			status={board.view && summary ? "ready" : "loading"}
			tool={tool}
			view={board.view ?? UNOPENED_VIEW}
			viewport={viewport}
		/>
	)
}

export const LibraryBoard = ({
	spaceId,
	isJoined,
	bots,
	name,
	title,
	summary,
	libraryItems,
	importFiles,
	onBack,
	onDelete,
}: LibraryBoardProps) => {
	const board = useLibraryBoardSession(spaceId, name)
	const presence = useLibraryBoardPresence({ spaceId, name, isJoined, bots })
	const { stopAll } = useStopLibraryWriters(spaceId)
	const pickableItems = libraryItems.filter((item) => item.id !== name)

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
					presence={
						<LibraryDocumentPresence
							activity="drawing"
							onStopAll={() => stopAll(name)}
							people={presence.people}
							writers={presence.drawers}
						/>
					}
				/>
			}
			scroller={() => (
				<LibraryBoardCanvas
					board={board}
					library={{ items: libraryItems, pickableItems, importFiles }}
					presence={presence}
					summary={summary}
				/>
			)}
		/>
	)
}
