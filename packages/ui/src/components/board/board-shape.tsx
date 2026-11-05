import { cn } from "@workspace/ui/lib/utils"

const BOARD_SHAPE_KINDS = ["rounded-rectangle", "ellipse"] as const

type BoardShapeKind = (typeof BOARD_SHAPE_KINDS)[number]

const SHAPE_OUTLINE: Record<BoardShapeKind, string> = {
	"rounded-rectangle": "rounded-control",
	ellipse: "rounded-[50%]",
}

type BoardShapeProps = {
	kind: BoardShapeKind
	label: string
	width: number
	height: number
}

const BoardShape = ({ kind, label, width, height }: BoardShapeProps) => (
	<div
		className={cn(
			"flex items-center justify-center overflow-hidden border-2 border-board-shape-border bg-board-shape-surface p-3 text-center font-medium text-board-foreground text-sm leading-4.5 wrap-break-word",
			SHAPE_OUTLINE[kind],
		)}
		data-kind={kind}
		data-slot="board-shape"
		style={{ width, height }}
	>
		<p className="min-w-0">{label}</p>
	</div>
)

export {
	BOARD_SHAPE_KINDS,
	BoardShape,
	type BoardShapeKind,
	type BoardShapeProps,
}
