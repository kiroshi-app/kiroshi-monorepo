import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import { cn } from "@workspace/ui/lib/utils"

type BoardLibraryCardProps = {
	title: string
	excerpt: string
	isDragging?: boolean
}

const BoardLibraryCard = ({
	title,
	excerpt,
	isDragging = false,
}: BoardLibraryCardProps) => {
	const { t } = useTranslation("common")

	return (
		<div
			className={cn(
				"flex w-59 flex-col gap-2 rounded-lg border border-board-card-border bg-board-card-surface p-3",
				isDragging
					? "-rotate-2 opacity-94 shadow-board-card-dragging"
					: "shadow-board-card",
			)}
			data-slot="board-library-card"
		>
			<div className="flex items-center gap-2">
				<span
					aria-hidden="true"
					className="grid size-6 shrink-0 place-items-center rounded-sm bg-board-card-inset text-board-card-soft-foreground"
				>
					<Icons.File className="size-3.25" />
				</span>
				<p
					className="min-w-0 truncate font-semibold text-board-card-foreground text-compact leading-4"
					data-slot="board-library-card-title"
				>
					{title}
				</p>
			</div>
			<p
				className="wrap-break-word text-board-card-soft-foreground text-xs leading-4.25"
				data-slot="board-library-card-excerpt"
			>
				{excerpt}
			</p>
			<p
				className="text-[11px] text-board-muted-foreground leading-3.5"
				data-slot="board-library-card-meta"
			>
				{t("board.libraryCard.documentMeta")}
			</p>
		</div>
	)
}

export { BoardLibraryCard, type BoardLibraryCardProps }
