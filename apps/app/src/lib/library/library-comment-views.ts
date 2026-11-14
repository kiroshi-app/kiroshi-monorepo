import type { BoardCommentAnchor } from "@workspace/ui/components/board-comments"
import type { BoardItem } from "@workspace/ui/components/board-view"
import type {
	LibraryCommentAgent,
	LibraryCommentAuthor,
	LibraryCommentAnchor as ShownAnchor,
} from "@workspace/ui/components/library-comment-author"
import type {
	LibraryCommentResolution,
	LibraryComment as ShownComment,
} from "@workspace/ui/components/library-comment-thread"
import type {
	LibraryCommentSummary,
	LibraryCommentsCounts,
} from "@workspace/ui/components/library-comments-list"
import type { LibraryBlockAnchor } from "@workspace/ui/components/library-document-blocks"
import type { LibraryImageAnchor } from "@workspace/ui/components/library-image-comments"
import { i18n } from "@workspace/ui/lib/i18n"
import { toElapsedTime, toRelativeTime } from "@workspace/ui/lib/time-format"

import type {
	LibraryCommentAgentTurn,
	LibraryCommentAnchor,
	LibraryCommentParty,
	LibraryCommentThread,
} from "../bindings"

export type CommentedThread = {
	thread: LibraryCommentThread
	comments: [ShownComment, ...ShownComment[]]
}

type AuthorOf = (party: LibraryCommentParty) => LibraryCommentAuthor

const commentedThreadOf = (
	thread: LibraryCommentThread,
	authorOf: AuthorOf,
	now: number,
): CommentedThread[] => {
	const [first, ...replies] = thread.comments.map((comment, index) => ({
		id: `${thread.id}:${index}`,
		author: authorOf(comment.author),
		time: toElapsedTime(comment.createdAt, now),
		body: comment.text,
	}))
	return first ? [{ thread, comments: [first, ...replies] }] : []
}

export const commentedThreadsOf = (
	threads: LibraryCommentThread[],
	authorOf: AuthorOf,
	now: number,
): CommentedThread[] =>
	threads.flatMap((thread) => commentedThreadOf(thread, authorOf, now))

export const countsOf = (
	threads: LibraryCommentThread[],
): LibraryCommentsCounts => ({
	open: threads.filter(({ state }) => state === "open").length,
	resolved: threads.filter(({ state }) => state === "resolved").length,
})

export const summaryOf = (
	{ thread, comments }: CommentedThread,
	anchor: ShownAnchor,
	now: number,
): LibraryCommentSummary => ({
	id: thread.id,
	author: comments[0].author,
	replyCount: comments.length - 1,
	date: toRelativeTime(thread.comments[0].createdAt, now),
	comment: comments[0].body,
	anchor,
})

export const resolutionOf = (
	{ state }: LibraryCommentThread,
	unnamed: string,
): LibraryCommentResolution | undefined =>
	state === "resolved" ? { by: unnamed, time: "" } : undefined

export const workingAgentOf = (
	{ id, state }: LibraryCommentThread,
	workingTurns: LibraryCommentAgentTurn[],
	agents: LibraryCommentAgent[],
): LibraryCommentAgent | undefined =>
	state === "resolved"
		? undefined
		: agents.find((agent) =>
				workingTurns.some(
					({ threadId, agentId }) => threadId === id && agentId === agent.id,
				),
			)

export const blockAnchorOf = (
	anchor: LibraryCommentAnchor,
): LibraryBlockAnchor | null => {
	if (anchor.kind === "block") {
		return { blockId: anchor.blockId }
	}
	if (anchor.kind === "passage") {
		const { blockId, quote, start, end } = anchor
		return { blockId, passage: { start, end, text: quote } }
	}
	return null
}

export const commentAnchorOfBlock = ({
	blockId,
	passage,
}: LibraryBlockAnchor): LibraryCommentAnchor =>
	passage
		? {
				kind: "passage",
				blockId,
				quote: passage.text,
				start: passage.start,
				end: passage.end,
			}
		: { kind: "block", blockId }

export const documentAnchorLineOf = ({
	anchor,
	targetMissing,
}: LibraryCommentThread): ShownAnchor => {
	if (targetMissing) {
		return { gone: "text" }
	}
	return anchor.kind === "passage"
		? i18n.t("common:library.comments.anchor.passage", { text: anchor.quote })
		: i18n.t("common:library.comments.anchor.block")
}

export const imageAnchorOf = (
	anchor: LibraryCommentAnchor,
): LibraryImageAnchor | null => {
	if (anchor.kind === "imagePoint") {
		return { x: anchor.x ?? 0, y: anchor.y ?? 0 }
	}
	if (anchor.kind === "imageZone") {
		return {
			x: anchor.x ?? 0,
			y: anchor.y ?? 0,
			width: anchor.width ?? 0,
			height: anchor.height ?? 0,
		}
	}
	return null
}

export const commentAnchorOfImage = (
	anchor: LibraryImageAnchor,
): LibraryCommentAnchor =>
	"width" in anchor
		? { kind: "imageZone", ...anchor }
		: { kind: "imagePoint", ...anchor }

export const imageAnchorLineOf = ({ kind }: LibraryCommentAnchor) =>
	kind === "imageZone"
		? i18n.t("common:library.comments.anchor.imageZone")
		: i18n.t("common:library.comments.anchor.imagePoint")

export const boardAnchorOf = (
	anchor: LibraryCommentAnchor,
): BoardCommentAnchor | null => {
	if (anchor.kind === "boardNode") {
		return anchor.nodeId
	}
	return anchor.kind === "boardPoint" ? anchor.point : null
}

export const commentAnchorOfBoard = (
	anchor: BoardCommentAnchor,
): LibraryCommentAnchor =>
	typeof anchor === "string"
		? { kind: "boardNode", nodeId: anchor }
		: { kind: "boardPoint", point: anchor }

export const boardAnchorLineOf = (
	{ anchor }: LibraryCommentThread,
	nodeOf: (id: string) => BoardItem | undefined,
): ShownAnchor => {
	if (anchor.kind !== "boardNode") {
		return i18n.t("common:board.comments.anchor.board")
	}
	const node = nodeOf(anchor.nodeId)
	return node
		? i18n.t("common:board.comments.anchor.node", {
				title: node.text || i18n.t(`common:board.object.kind.${node.kind}`),
			})
		: { gone: "shape" }
}
