import { importCanvas } from "@workspace/shared/board/json-canvas"
import { BoardCanvas } from "@workspace/ui/components/board-canvas"
import { LibraryDocumentBlockEditor } from "@workspace/ui/components/library-document-block-editor"

import { renderObjectFrom } from "@/components/library-board"
import type { ScreenshotJob, ScreenshotTarget as Target } from "@/lib/bindings"
import { libraryBoardViewOf } from "@/lib/library/library-board-view"
import { useLibraryBoardShelf } from "@/lib/library/use-library-board-shelf"
import { useLibraryImageResolver } from "@/lib/library/use-library-image-sources"

type BoardTarget = Extract<Target, { kind: "board" }>

type DocumentTarget = Extract<Target, { kind: "document" }>

type ShownProps<T> = {
	spaceId: string
	target: T
}

type ScreenshotTargetProps = {
	job: ScreenshotJob
}

const BLOCK_SEPARATOR = "\n\n"

const ignore = () => undefined

const ScreenshotBoard = ({ spaceId, target }: ShownProps<BoardTarget>) => {
	const board = importCanvas(target.canvas)
	const library = useLibraryBoardShelf({
		spaceId,
		isJoined: false,
		name: target.name,
	})
	const zoom = target.zoom ?? 1
	const offset = { x: -target.frame.x * zoom, y: -target.frame.y * zoom }

	return (
		<BoardCanvas
			libraryItems={library.items}
			onDropFiles={ignore}
			onDropUrl={ignore}
			onIntent={ignore}
			onLibraryItemDrop={ignore}
			onLibraryItemPick={ignore}
			onPaste={ignore}
			onToolChange={ignore}
			onViewportChange={ignore}
			renderObject={renderObjectFrom({
				nodeOf: (id) => board.nodes[id],
				libraryItems: library.items,
			})}
			status="ready"
			tool="select"
			view={libraryBoardViewOf(board)}
			viewport={{ zoom, offset }}
		/>
	)
}

const ScreenshotDocument = ({
	spaceId,
	target,
}: ShownProps<DocumentTarget>) => {
	const resolveImage = useLibraryImageResolver(spaceId, false)

	return (
		<LibraryDocumentBlockEditor
			body={target.blocks.map(({ markdown }) => markdown).join(BLOCK_SEPARATOR)}
			onBodyChange={ignore}
			resolveImage={resolveImage}
		/>
	)
}

export const ScreenshotTarget = ({ job }: ScreenshotTargetProps) =>
	job.target.kind === "board" ? (
		<ScreenshotBoard spaceId={job.spaceId} target={job.target} />
	) : (
		<ScreenshotDocument spaceId={job.spaceId} target={job.target} />
	)
