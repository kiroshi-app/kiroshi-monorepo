import { useState } from "react"

import type { BoardTool } from "@workspace/ui/components/board/board-dock"
import { BoardShape } from "@workspace/ui/components/board/board-shape"
import { BoardCanvas } from "@workspace/ui/components/board-canvas"
import type {
	BoardItem,
	BoardViewport,
} from "@workspace/ui/components/board-view"
import { LibraryDocumentBar } from "@workspace/ui/components/library-document-view"
import { ScreenLayout } from "@workspace/ui/components/screen-layout"

import type { LibraryBoardSummary } from "@/lib/bindings"
import { boardOriginOf, boardViewOf } from "@/lib/library/library-boards"

type LibraryBoardProps = {
	name: string
	summary: LibraryBoardSummary
	onBack: () => void
	onDelete: () => void
}

type LibraryBoardLoadingProps = Pick<LibraryBoardProps, "name" | "onBack">

export const LibraryBoardLoading = ({
	name,
	onBack,
}: LibraryBoardLoadingProps) => (
	<ScreenLayout
		aria-busy="true"
		header={<LibraryDocumentBar item={{ name }} onBack={onBack} />}
	/>
)

const NO_LIBRARY_ITEMS = [] as const

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

export const LibraryBoard = ({
	name,
	summary,
	onBack,
	onDelete,
}: LibraryBoardProps) => {
	const [viewport, setViewport] = useState(() => openingViewportOf(summary))
	const [tool, setTool] = useState<BoardTool>("select")

	return (
		<ScreenLayout
			header={
				<LibraryDocumentBar
					item={{ name }}
					onBack={onBack}
					onDelete={onDelete}
				/>
			}
			scroller={() => (
				<BoardCanvas
					libraryItems={NO_LIBRARY_ITEMS}
					onDropFiles={leaveBoardUnchanged}
					onIntent={leaveBoardUnchanged}
					onLibraryItemDrop={leaveBoardUnchanged}
					onLibraryItemPick={leaveBoardUnchanged}
					onPaste={leaveBoardUnchanged}
					onToolChange={setTool}
					onViewportChange={setViewport}
					renderObject={renderBoardObject}
					tool={tool}
					view={boardViewOf(summary)}
					viewport={viewport}
				/>
			)}
		/>
	)
}
