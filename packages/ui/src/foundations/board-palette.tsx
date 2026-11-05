import { cn } from "@workspace/ui/lib/utils"

const BOARD_STICKY_COLOURS = [
	"yellow",
	"green",
	"pink",
	"blue",
	"orange",
] as const

const BOARD_SECTION_TINTS = ["blue", "purple"] as const

type BoardStickyColour = (typeof BOARD_STICKY_COLOURS)[number]
type BoardSectionTint = (typeof BOARD_SECTION_TINTS)[number]

const STICKY_FILL: Record<BoardStickyColour, string> = {
	yellow: "bg-board-sticky-yellow",
	green: "bg-board-sticky-green",
	pink: "bg-board-sticky-pink",
	blue: "bg-board-sticky-blue",
	orange: "bg-board-sticky-orange",
}

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

const BoardPalette = () => (
	<div className="flex flex-col gap-8">
		<div className="flex flex-wrap gap-4">
			{BOARD_STICKY_COLOURS.map((colour) => (
				<div
					className={cn(
						"flex min-h-36 w-36 flex-col justify-between gap-3 rounded-sm p-3 text-board-sticky-foreground text-sm shadow-board-sticky",
						STICKY_FILL[colour],
					)}
					data-colour={colour}
					data-slot="board-sticky"
					key={colour}
				>
					<span>Draft the launch plan</span>
					<span
						className="text-board-sticky-author-foreground text-xs"
						data-slot="board-sticky-author"
					>
						Ada, {colour}
					</span>
				</div>
			))}
		</div>
		<div className="flex flex-wrap gap-4">
			{BOARD_SECTION_TINTS.map((tint) => (
				<div
					className={cn(
						"flex min-h-32 w-64 flex-col items-start rounded-lg border p-3",
						SECTION_TINT[tint].section,
					)}
					data-slot="board-section"
					data-tint={tint}
					key={tint}
				>
					<span
						className={cn(
							"rounded-md p-1.5 font-medium text-sm",
							SECTION_TINT[tint].titleChip,
						)}
						data-slot="board-section-title"
					>
						Research, {tint}
					</span>
				</div>
			))}
		</div>
	</div>
)

export {
	BOARD_SECTION_TINTS,
	BOARD_STICKY_COLOURS,
	BoardPalette,
	type BoardSectionTint,
	type BoardStickyColour,
}
