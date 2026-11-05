import { useTranslation } from "react-i18next"

import type {
	BoardShapeFill,
	BoardShapeStyle,
	BoardShapeType,
} from "@workspace/ui/components/board-view"
import { Icons } from "@workspace/ui/components/icons"
import { Button } from "@workspace/ui/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@workspace/ui/components/ui/dropdown-menu"
import { cn } from "@workspace/ui/lib/utils"

const BOARD_SHAPE_FILLS: readonly BoardShapeFill[] = [
	"surface",
	"yellow",
	"green",
	"blue",
	"pink",
]

const BOARD_SHAPE_TYPES: readonly BoardShapeType[] = [
	"rounded-rectangle",
	"ellipse",
]

const FILL_DOT: Record<BoardShapeFill, string> = {
	surface: "bg-board-shape-surface",
	yellow: "bg-board-sticky-yellow",
	green: "bg-board-sticky-green",
	blue: "bg-board-sticky-blue",
	pink: "bg-board-sticky-pink",
}

const SHAPE_GLYPH: Record<BoardShapeType, typeof Icons.Ellipse> = {
	"rounded-rectangle": Icons.RoundedRectangle,
	ellipse: Icons.Ellipse,
}

const BAR_CONTROL =
	"rounded-[8px] text-board-selection-bar-foreground transition-none hover:bg-board-selection-bar-foreground/10 hover:text-board-selection-bar-foreground active:bg-board-selection-bar-foreground/20 aria-expanded:bg-board-selection-bar-foreground/20 aria-expanded:text-board-selection-bar-foreground dark:hover:bg-board-selection-bar-foreground/10"

type BoardSelectionBarProps = {
	shapeStyle: BoardShapeStyle
	onShapeStyleChange: (style: BoardShapeStyle) => void
}

const BarSeparator = () => (
	<span
		aria-hidden="true"
		className="h-5 w-px shrink-0 bg-board-selection-bar-foreground/15"
	/>
)

const BoardSelectionBar = ({
	shapeStyle,
	onShapeStyleChange,
}: BoardSelectionBarProps) => {
	const { t } = useTranslation("common")
	const ShapeGlyph = SHAPE_GLYPH[shapeStyle.shape]

	return (
		<div
			aria-label={t("board.selectionBar.label")}
			className="flex h-10 items-center gap-1 rounded-[12px] bg-board-selection-bar p-1.5 text-board-selection-bar-foreground shadow-board-selection-bar"
			data-slot="board-selection-bar"
			role="toolbar"
		>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button
							aria-label={t("board.selectionBar.shapeType")}
							className={cn(
								BAR_CONTROL,
								"h-7 gap-0.5 bg-board-selection-bar-foreground/12 p-1.5 hover:bg-board-selection-bar-foreground/18 active:bg-board-selection-bar-foreground/24 aria-expanded:bg-board-selection-bar-foreground/24 dark:hover:bg-board-selection-bar-foreground/18",
							)}
							data-slot="board-selection-shape-type"
							variant="ghost"
						/>
					}
				>
					<ShapeGlyph aria-hidden="true" className="size-4" />
					<Icons.Expand aria-hidden="true" className="size-3" />
				</DropdownMenuTrigger>
				<DropdownMenuContent className="w-auto">
					<DropdownMenuRadioGroup
						onValueChange={(shape: BoardShapeType) =>
							onShapeStyleChange({ ...shapeStyle, shape })
						}
						value={shapeStyle.shape}
					>
						{BOARD_SHAPE_TYPES.map((shape) => (
							<DropdownMenuRadioItem key={shape} value={shape}>
								{t(`board.selectionBar.shape.${shape}`)}
							</DropdownMenuRadioItem>
						))}
					</DropdownMenuRadioGroup>
				</DropdownMenuContent>
			</DropdownMenu>
			<BarSeparator />
			{BOARD_SHAPE_FILLS.map((fill) => (
				<Button
					aria-label={t(`board.selectionBar.fill.${fill}`)}
					aria-pressed={fill === shapeStyle.fill}
					className={BAR_CONTROL}
					data-slot="board-selection-fill"
					key={fill}
					onClick={() => onShapeStyleChange({ ...shapeStyle, fill })}
					size="icon-sm"
					variant="ghost"
				>
					<span
						aria-hidden="true"
						className={cn(
							"size-5 rounded-full",
							FILL_DOT[fill],
							fill === shapeStyle.fill
								? "ring-2 ring-board-selection-bar-foreground"
								: "ring-1 ring-board-selection-bar-foreground/15 ring-inset",
						)}
					/>
				</Button>
			))}
			<BarSeparator />
			<Button
				aria-label={`${t("board.selectionBar.textSize")} ${t("board.selectionBar.textSizeMedium")}`}
				className={cn(
					BAR_CONTROL,
					"h-7 min-w-7 px-1.5 font-medium text-compact",
				)}
				variant="ghost"
			>
				{t("board.selectionBar.textSizeMedium")}
			</Button>
			<Button
				aria-label={t("board.selectionBar.more")}
				className={BAR_CONTROL}
				size="icon-sm"
				variant="ghost"
			>
				<Icons.More aria-hidden="true" className="size-4" />
			</Button>
		</div>
	)
}

export { BoardSelectionBar, type BoardSelectionBarProps }
