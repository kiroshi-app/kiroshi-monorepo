"use client"

import { useTranslation } from "react-i18next"

import {
	type LibraryCommentDraftOptions,
	LibraryCommentMentionButton,
	LibraryCommentSendButton,
	LibraryCommentTextField,
	useLibraryCommentDraft,
} from "@workspace/ui/components/library-comment-field"
import { LibraryCommentMentionMenu } from "@workspace/ui/components/library-comment-mention-menu"
import { cn } from "@workspace/ui/lib/utils"

type LibraryCommentComposerProps = LibraryCommentDraftOptions & {
	anchor: string
	className?: string
}

const LibraryCommentComposer = ({
	anchor,
	className,
	...options
}: LibraryCommentComposerProps) => {
	const { t } = useTranslation("common")
	const draft = useLibraryCommentDraft(options)

	return (
		<LibraryCommentMentionMenu
			{...draft.menu}
			className={cn("w-90 max-w-full", className)}
		>
			<form
				className="flex flex-col gap-3 rounded-control bg-comment-card p-3 text-foreground shadow-comment-card"
				data-slot="library-comment-composer"
				onSubmit={draft.submit}
			>
				<p className="break-words text-muted-foreground text-xs leading-4">
					{anchor}
				</p>
				<LibraryCommentTextField
					draft={draft}
					placeholder={t("library.comments.composer.placeholder")}
				/>
				<div className="flex items-center justify-between gap-2">
					<LibraryCommentMentionButton draft={draft} />
					<LibraryCommentSendButton draft={draft} />
				</div>
			</form>
		</LibraryCommentMentionMenu>
	)
}

export { LibraryCommentComposer, type LibraryCommentComposerProps }
