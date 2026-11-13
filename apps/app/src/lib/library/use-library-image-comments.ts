import type { LibraryImageAnchor } from "@workspace/ui/components/library-image-comments"
import type { LibraryLightboxProps } from "@workspace/ui/components/library-lightbox"

import {
	commentAnchorOfImage,
	imageAnchorLineOf,
	imageAnchorOf,
} from "./library-comment-views"
import { useCommentModeKey } from "./use-comment-mode-key"
import type { LibraryCommentPeople } from "./use-library-comment-people"
import { anchoredDraftOf, useLibraryComments } from "./use-library-comments"

type LibraryImageCommentsInput = {
	spaceId: string
	name: string | undefined
	people: LibraryCommentPeople
}

type ImageCommentProps = Pick<
	LibraryLightboxProps,
	"comments" | "imageComments"
>

const NO_COMMENTS: ImageCommentProps = {}

export const useLibraryImageComments = ({
	spaceId,
	name,
	people,
}: LibraryImageCommentsInput): ImageCommentProps => {
	const comments = useLibraryComments<LibraryImageAnchor>({
		spaceId,
		name,
		people,
		anchorOf: commentAnchorOfImage,
		anchorLineOf: ({ anchor }) => imageAnchorLineOf(anchor),
	})
	const { bar, openThread, draft } = comments
	useCommentModeKey(bar !== undefined, comments.toggleCommentMode)

	if (!bar) {
		return NO_COMMENTS
	}
	return {
		comments: bar,
		imageComments: {
			threads: comments.threads.flatMap(({ thread, comments: shown }) => {
				const anchor = imageAnchorOf(thread.anchor)
				return anchor
					? [
							{
								id: thread.id,
								author: shown[0].author,
								anchor,
								isResolved: thread.state === "resolved",
							},
						]
					: []
			}),
			openThread,
			draft: draft ? anchoredDraftOf(draft) : undefined,
			onOpenThread: comments.openThreadById,
			onStartComment: comments.startComment,
		},
	}
}
