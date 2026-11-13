import type { BoardCanvasProps } from "@workspace/ui/components/board-canvas"
import type { BoardCommentAnchor } from "@workspace/ui/components/board-comments"
import type { BoardItem, BoardView } from "@workspace/ui/components/board-view"
import type { LibraryBarComments } from "@workspace/ui/components/library-item-menu"

import {
	boardAnchorLineOf,
	boardAnchorOf,
	type CommentedThread,
	commentAnchorOfBoard,
} from "./library-comment-views"
import { useCommentModeKey } from "./use-comment-mode-key"
import type { LibraryCommentPeople } from "./use-library-comment-people"
import { useLibraryComments } from "./use-library-comments"

type LibraryBoardCommentsInput = {
	spaceId: string
	name: string
	people: LibraryCommentPeople
	view: BoardView | null
}

type BoardCommentProps = Pick<
	BoardCanvasProps,
	| "commentThreads"
	| "openCommentThread"
	| "commentDraft"
	| "isCommentMode"
	| "onOpenCommentThread"
	| "onStartComment"
	| "onLeaveCommentMode"
>

type PinnedThread = NonNullable<BoardCommentProps["commentThreads"]>[number]

export type LibraryBoardComments = {
	bar?: LibraryBarComments
	canvas: BoardCommentProps
}

const NO_COMMENTS: LibraryBoardComments = { canvas: {} }

const nodeIn = (view: BoardView | null, id: string): BoardItem | undefined =>
	view?.objects.find(
		(object): object is BoardItem =>
			object.id === id && object.kind !== "connector",
	)

const pinnedThreadOf = (
	{ thread, comments }: CommentedThread,
	view: BoardView | null,
): PinnedThread[] => {
	const anchor = boardAnchorOf(thread.anchor)
	const pinned = { id: thread.id, author: comments[0].author }
	if (anchor === null) {
		return []
	}
	if (typeof anchor !== "string") {
		return [{ ...pinned, anchor }]
	}
	const node = nodeIn(view, anchor)
	return node ? [{ ...pinned, anchor, lastPoint: node.position }] : []
}

export const useLibraryBoardComments = ({
	spaceId,
	name,
	people,
	view,
}: LibraryBoardCommentsInput): LibraryBoardComments => {
	const comments = useLibraryComments<BoardCommentAnchor>({
		spaceId,
		name: view ? name : undefined,
		people,
		anchorOf: commentAnchorOfBoard,
		anchorLineOf: (thread) =>
			boardAnchorLineOf(thread, (id) => nodeIn(view, id)),
	})
	const { bar, draft } = comments
	useCommentModeKey(bar !== undefined, comments.toggleCommentMode)

	if (!bar) {
		return NO_COMMENTS
	}
	return {
		bar,
		canvas: {
			commentThreads: comments.threads.flatMap((each) =>
				pinnedThreadOf(each, view),
			),
			openCommentThread: comments.openThread,
			commentDraft: draft
				? {
						anchor: draft.target,
						author: draft.author,
						participants: draft.participants,
						value: draft.value,
						onValueChange: draft.onValueChange,
						onSubmit: draft.onSubmit,
					}
				: undefined,
			isCommentMode: comments.isCommentMode,
			onOpenCommentThread: comments.openThreadById,
			onStartComment: comments.startComment,
			onLeaveCommentMode: comments.leaveCommentMode,
		},
	}
}
