import type { LibraryDocumentCommentTarget } from "@workspace/ui/components/library-document-comments"
import type { LibraryDocumentEditorProps } from "@workspace/ui/components/library-document-editor"

import {
	blockAnchorOf,
	commentAnchorOfBlock,
	documentAnchorLineOf,
} from "./library-comment-views"
import type { LibraryCommentPeople } from "./use-library-comment-people"
import { useLibraryComments } from "./use-library-comments"

type LibraryDocumentCommentsInput = {
	spaceId: string
	name: string | undefined
	hasOpened: boolean
	people: LibraryCommentPeople
}

type DocumentCommentProps = Pick<
	LibraryDocumentEditorProps,
	| "comments"
	| "threads"
	| "openThread"
	| "commentDraft"
	| "commentParticipants"
	| "onOpenThread"
	| "onStartComment"
>

type OpenThread = NonNullable<
	ReturnType<typeof useLibraryComments>["openThread"]
>

const NO_COMMENTS: DocumentCommentProps = {}

const withoutAgentsAtWork = ({ workingAgents, ...openThread }: OpenThread) =>
	openThread

export const useLibraryDocumentComments = ({
	spaceId,
	name,
	hasOpened,
	people,
}: LibraryDocumentCommentsInput): DocumentCommentProps => {
	const comments = useLibraryComments<LibraryDocumentCommentTarget>({
		spaceId,
		name: hasOpened ? name : undefined,
		people,
		anchorOf: commentAnchorOfBlock,
		anchorLineOf: documentAnchorLineOf,
	})

	if (!comments.bar) {
		return NO_COMMENTS
	}
	return {
		comments: comments.bar,
		threads: comments.threads.flatMap(
			({ thread, comments: shown, resolution, workingAgents }) => {
				const anchor = blockAnchorOf(thread.anchor)
				return anchor
					? [
							{
								id: thread.id,
								anchor,
								comments: shown,
								resolution,
								workingAgent: workingAgents[0],
							},
						]
					: []
			},
		),
		openThread: comments.openThread && withoutAgentsAtWork(comments.openThread),
		commentDraft: comments.draft || undefined,
		commentParticipants: comments.participants,
		onOpenThread: comments.openThreadById,
		onStartComment: comments.startComment,
	}
}
