import { cn } from "@workspace/ui/lib/utils"

type BoardShapeKind = "rounded-rectangle" | "ellipse"

type BoardShapeFill = "surface" | "yellow" | "green" | "blue" | "pink"

const SHAPE_OUTLINE: Record<BoardShapeKind, string> = {
	"rounded-rectangle": "rounded-control",
	ellipse: "rounded-[50%]",
}

const BOARD_SHAPE_FILL: Record<BoardShapeFill, string> = {
	surface: "bg-board-shape-surface",
	yellow: "bg-board-sticky-yellow",
	green: "bg-board-sticky-green",
	blue: "bg-board-sticky-blue",
	pink: "bg-board-sticky-pink",
}

type BoardShapeProps = {
	kind: BoardShapeKind
	fill?: BoardShapeFill
	label: string
	width: number
	height: number
}

const BoardShape = ({
	kind,
	fill = "surface",
	label,
	width,
	height,
}: BoardShapeProps) => (
	<div
		className={cn(
			"flex items-center justify-center overflow-hidden border-2 border-board-shape-border p-3 text-center font-medium text-sm leading-4.5 wrap-break-word",
			SHAPE_OUTLINE[kind],
			BOARD_SHAPE_FILL[fill],
			fill === "surface"
				? "text-board-foreground"
				: "text-board-sticky-foreground",
		)}
		data-fill={fill}
		data-slot="board-shape"
		style={{ width, height }}
	>
		<p className="min-w-0" data-board-text>
			{label}
		</p>
	</div>
)

export {
	BOARD_SHAPE_FILL,
	BoardShape,
	type BoardShapeFill,
	type BoardShapeKind,
	type BoardShapeProps,
}
