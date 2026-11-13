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
import { Kbd } from "@workspace/ui/components/ui/kbd"
import { cn } from "@workspace/ui/lib/utils"

type LibraryCommentComposerProps = LibraryCommentDraftOptions & {
	anchor: string
	shortcut?: string
	className?: string
}

const ANCHOR_LINE = "break-words text-muted-foreground text-xs leading-4"

const LibraryCommentComposer = ({
	anchor,
	shortcut,
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
				{shortcut ? (
					<div className="flex items-start justify-between gap-2">
						<p className={cn(ANCHOR_LINE, "min-w-0")}>{anchor}</p>
						<Kbd
							aria-hidden="true"
							className="h-auto min-w-4.5 shrink-0 rounded-[0.25rem] bg-transparent p-0.5 text-[11px]/3.5 inset-ring inset-ring-foreground/17 dark:inset-ring-foreground/20"
							data-slot="library-comment-composer-shortcut"
						>
							{shortcut}
						</Kbd>
					</div>
				) : (
					<p className={ANCHOR_LINE}>{anchor}</p>
				)}
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
