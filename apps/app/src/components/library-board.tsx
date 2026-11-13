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

import type { LibraryBoardSummary } from "@/lib/bindings"
import type { Bot } from "@/lib/conversations/store-contract"
import { libraryBoardAdditionsOf } from "@/lib/library/library-board-additions"
import {
	imageSourceOf,
	libraryCardOf,
	linkCardOf,
} from "@/lib/library/library-board-objects"
import type { LibraryBoardPresence } from "@/lib/library/library-board-presence"
import {
	type LibraryBoardComments,
	useLibraryBoardComments,
} from "@/lib/library/use-library-board-comments"
import { useLibraryBoardKeys } from "@/lib/library/use-library-board-keys"
import { useLibraryBoardPointerShare } from "@/lib/library/use-library-board-pointer-share"
import { useLibraryBoardPresence } from "@/lib/library/use-library-board-presence"
import { useLibraryBoardSession } from "@/lib/library/use-library-board-session"
import {
	type LibraryBoardShelf,
	useLibraryBoardShelf,
} from "@/lib/library/use-library-board-shelf"
import type { LibraryCommentPeople } from "@/lib/library/use-library-comment-people"
import { useStopLibraryBoardDrawers } from "@/lib/library/use-stop-library-writers"

type LibraryBoardProps = {
	spaceId: string
	isJoined: boolean
	bots: Bot[]
	commentPeople: LibraryCommentPeople
	name: string
	title: string
	summary: LibraryBoardSummary | undefined
	onBack: () => void
	onDelete: () => void
}

const UNOPENED_VIEW: BoardView = { objects: [] }

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

export const renderObjectFrom =
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

type LibraryBoardCanvasProps = {
	board: ReturnType<typeof useLibraryBoardSession>
	summary: LibraryBoardSummary | undefined
	library: LibraryBoardShelf
	presence?: LibraryBoardPresence
	pointerShare?: ReturnType<typeof useLibraryBoardPointerShare>
	comments?: LibraryBoardComments["canvas"]
}

export const LibraryBoardCanvas = ({
	board,
	summary,
	library,
	presence,
	pointerShare,
	comments,
}: LibraryBoardCanvasProps) => {
	const [viewport, setViewport] = useState<BoardViewport | null>(null)
	const { tool, pickTool } = useLibraryBoardKeys(board)
	const additions = libraryBoardAdditionsOf({
		board,
		libraryItems: library.pickableItems,
		importFiles: library.importFiles,
		importUrl: library.importUrl,
	})

	return (
		<BoardCanvas
			{...comments}
			isConnecting={tool === "connector"}
			libraryItems={library.pickableItems}
			onDropFiles={additions.dropFiles}
			onDropUrl={additions.dropUrl}
			onIntent={board.apply}
			onLibraryItemDrop={additions.placeItem}
			onLibraryItemPick={additions.placeItem}
			onPaste={additions.paste}
			onPointerMove={pointerShare?.movePointer}
			onSelectionChange={pointerShare?.changeSelection}
			onToolChange={pickTool}
			onViewportChange={setViewport}
			outlines={presence?.outlines}
			pointers={presence?.pointers}
			renderObject={renderObjectFrom({
				nodeOf: board.nodeOf,
				libraryItems: library.items,
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
	commentPeople,
	name,
	title,
	summary,
	onBack,
	onDelete,
}: LibraryBoardProps) => {
	const board = useLibraryBoardSession(spaceId, name)
	const presence = useLibraryBoardPresence({ spaceId, name, isJoined, bots })
	const pointerShare = useLibraryBoardPointerShare(spaceId, name)
	const { stopAll } = useStopLibraryBoardDrawers(spaceId)
	const library = useLibraryBoardShelf({ spaceId, isJoined, name })
	const comments = useLibraryBoardComments({
		spaceId,
		name,
		people: commentPeople,
		view: board.view,
	})

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
					comments={comments.bar}
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
					comments={comments.canvas}
					library={library}
					pointerShare={pointerShare}
					presence={presence}
					summary={summary}
				/>
			)}
		/>
	)
}
