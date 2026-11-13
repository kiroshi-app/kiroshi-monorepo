import { useTranslation } from "react-i18next"

import { cn } from "@workspace/ui/lib/utils"

type LibraryCommentModeSurface = "document" | "board" | "image"

type LibraryCommentModeHintProps = {
	surface: LibraryCommentModeSurface
	className?: string
}

const HINT_KEYS = {
	document: "library.comments.hint.document",
	board: "library.comments.hint.board",
	image: "library.comments.hint.image",
} as const satisfies Record<LibraryCommentModeSurface, string>

const LibraryCommentModeHint = ({
	surface,
	className,
}: LibraryCommentModeHintProps) => {
	const { t } = useTranslation("common")

	return (
		<p
			className={cn(
				"flex w-fit max-w-full items-center gap-2.5 rounded-full bg-foreground p-3 font-medium text-compact text-on-foreground leading-4 shadow-comment-hint",
				className,
			)}
			data-slot="library-comment-mode-hint"
			role="status"
		>
			<span className="min-w-0 break-words">{t(HINT_KEYS[surface])}</span>
			<kbd className="shrink-0 font-normal font-sans text-on-foreground-muted">
				{t("library.comments.hint.escape")}
			</kbd>
		</p>
	)
}

export {
	LibraryCommentModeHint,
	type LibraryCommentModeHintProps,
	type LibraryCommentModeSurface,
}
