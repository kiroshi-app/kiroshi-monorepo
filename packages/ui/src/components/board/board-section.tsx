import type { BoardSectionTint } from "@workspace/ui/foundations/board-palette"
import { cn } from "@workspace/ui/lib/utils"

const SECTION_TINT: Record<
	BoardSectionTint,
	{ section: string; titleChip: string }
> = {
	blue: {
		section: "border-board-section-blue-border bg-board-section-blue-surface",
		titleChip:
			"bg-board-section-blue-title-chip text-board-section-blue-title-foreground",
	},
	purple: {
		section:
			"border-board-section-purple-border bg-board-section-purple-surface",
		titleChip:
			"bg-board-section-purple-title-chip text-board-section-purple-title-foreground",
	},
}

type BoardSectionProps = {
	tint: BoardSectionTint
	title: string
	width: number
	height: number
}

const BoardSection = ({ tint, title, width, height }: BoardSectionProps) => (
	<div
		className={cn("relative rounded-bubble border", SECTION_TINT[tint].section)}
		data-slot="board-section"
		style={{ width, height }}
	>
		<p
			className={cn(
				"absolute start-3 top-3 h-6 max-w-[calc(100%-1.5rem)] truncate rounded-sm px-2 py-1 font-semibold text-compact leading-4",
				SECTION_TINT[tint].titleChip,
			)}
			data-slot="board-section-title"
		>
			{title}
		</p>
	</div>
)

export { BoardSection, type BoardSectionProps }
