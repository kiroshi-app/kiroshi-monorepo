"use client"

import {
	type ChangeEvent,
	type ClipboardEvent,
	type ComponentType,
	type CSSProperties,
	type DragEvent,
	type KeyboardEvent,
	type MouseEvent,
	type PointerEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useId,
	useLayoutEffect,
	useRef,
	useState,
} from "react"
import { useTranslation } from "react-i18next"

import boardSchema from "@workspace/shared/board/board.schema.json"
import { BoardConnectorFlyout } from "@workspace/ui/components/board/board-connector-flyout"
import {
	type BoardClientPoint,
	BoardDock,
	BoardDockSkeleton,
	type BoardLibraryItem,
	type BoardTool,
} from "@workspace/ui/components/board/board-dock"
import {
	BoardObjectOutline,
	type BoardObjectOutlineSpec,
	BoardPointer,
	type BoardPointerPlacement,
} from "@workspace/ui/components/board/board-presence"
import { BoardSelectionBar } from "@workspace/ui/components/board/board-selection-bar"
import {
	type BoardCommentDraft,
	BoardCommentLayer,
	type BoardCommentThread,
	type BoardOpenCommentThread,
} from "@workspace/ui/components/board-comment-layer"
import type { BoardCommentAnchor } from "@workspace/ui/components/board-comments"
import {
	anchorOf,
	arrowheadPathData,
	BOARD_SIDES,
	type BoardConnectorEnd,
	type BoardObstacles,
	type BoardRoute,
	bendThrough,
	crossedRects,
	directionAlong,
	exactPointOf,
	fractionNearest,
	pointAlong,
	routeConnector,
	routeConnectors,
	routePathData,
	sectionTitleBox,
} from "@workspace/ui/components/board-connector-route"
import {
	arrowDirectionOf,
	BOARD_CORNERS,
	type BoardCorner,
	inReadingOrder,
	movedRect,
	resizedFromCorner,
	roundedRect,
	scalePoint,
	toScreenRect,
} from "@workspace/ui/components/board-selection"
import type {
	BoardArrowHeadSize,
	BoardConnector,
	BoardIntent,
	BoardItem,
	BoardItemKind,
	BoardObject,
	BoardPaste,
	BoardPoint,
	BoardRect,
	BoardRouting,
	BoardShapeStyle,
	BoardSide,
	BoardSize,
	BoardView,
	BoardViewport,
} from "@workspace/ui/components/board-view"
import {
	cullBoardObjects,
	gridScreenPitch,
	isAtZoomMax,
	isAtZoomMin,
	isItem,
	itemBounds,
	openingViewportOf,
	panBy,
	pinchZoom,
	zoomAround,
	zoomStepIn,
	zoomStepOut,
} from "@workspace/ui/components/board-viewport"
import { Icons } from "@workspace/ui/components/icons"
import { Button } from "@workspace/ui/components/ui/button"
import { Skeleton } from "@workspace/ui/components/ui/skeleton"
import { cn } from "@workspace/ui/lib/utils"

type BoardStatus = "loading" | "ready"

type BoardCanvasProps = {
	status?: BoardStatus
	view: BoardView
	viewport: BoardViewport | null
	onViewportChange: (viewport: BoardViewport) => void
	onIntent: (intent: BoardIntent) => void
	renderObject: (item: BoardItem) => ReactNode
	pointers?: readonly BoardPointerPlacement[]
	outlines?: readonly BoardObjectOutlineSpec[]
	tool: BoardTool
	onToolChange: (tool: BoardTool) => void
	libraryItems: readonly BoardLibraryItem[]
	onLibraryItemPick: (id: string, point: BoardPoint) => void
	onLibraryItemDrop: (id: string, point: BoardPoint) => void
	onPaste: (paste: BoardPaste, point: BoardPoint) => string | undefined
	onDropFiles: (files: readonly File[], point: BoardPoint) => void
	onDropUrl: (url: string, point: BoardPoint) => void
	onPointerMove?: (point: BoardPoint | null) => void
	onSelectionChange?: (ids: readonly string[]) => void
	isConnecting?: boolean
	commentThreads?: readonly BoardCommentThread[]
	openCommentThread?: BoardOpenCommentThread
	commentDraft?: BoardCommentDraft
	isCommentMode?: boolean
	onOpenCommentThread?: (id: string) => void
	onStartComment?: (anchor: BoardCommentAnchor) => void
	onLeaveCommentMode?: () => void
	className?: string
}

type PointerPosition = {
	clientX: number
	clientY: number
}

type SafariGestureEvent = Event & PointerPosition & { scale: number }

type ReadyBoardCanvasProps = Omit<BoardCanvasProps, "status">

const CANVAS_SURFACE =
	"relative isolate size-full overflow-hidden border-shell-border border-t bg-board-surface select-none -outline-offset-2"
const ZOOM_FRAME =
	"absolute end-5 bottom-5 flex items-center gap-0.5 rounded-lg p-1"
const ZOOM_LEVEL =
	"min-w-11 px-1.5 text-center font-medium text-xs tabular-nums"

const OPENING_MARGIN = 64

const NO_SIZE: BoardSize = { width: 0, height: 0 }
const UNPLACED_VIEWPORT: BoardViewport = { offset: { x: 0, y: 0 }, zoom: 1 }
const NO_PAINT = "rgba(0, 0, 0, 0)"

const pointerIn = (element: HTMLElement, event: PointerPosition) => {
	const rect = element.getBoundingClientRect()
	return {
		x: event.clientX - rect.left - element.clientLeft,
		y: event.clientY - rect.top - element.clientTop,
	}
}

const centreOf = (size: BoardSize): BoardPoint => ({
	x: size.width / 2,
	y: size.height / 2,
})

const useBoardGestures = (
	viewport: BoardViewport,
	onViewportChange: (viewport: BoardViewport) => void,
) => {
	const [size, setSize] = useState(NO_SIZE)
	const canvas = useRef<HTMLDivElement | null>(null)
	const shown = useRef(viewport)
	const notify = useRef(onViewportChange)

	useLayoutEffect(() => {
		shown.current = viewport
		notify.current = onViewportChange
	}, [viewport, onViewportChange])

	const emit = useCallback(
		(next: (current: BoardViewport) => BoardViewport) => {
			shown.current = next(shown.current)
			notify.current(shown.current)
			return shown.current
		},
		[],
	)

	const attach = useCallback(
		(element: HTMLDivElement | null) => {
			if (!element) return
			canvas.current = element
			let pinchStartZoom = shown.current.zoom

			const onWheel = (event: WheelEvent) => {
				event.preventDefault()
				if (event.ctrlKey) {
					emit((current) =>
						zoomAround(
							current,
							pinchZoom(current.zoom, event.deltaY),
							pointerIn(element, event),
						),
					)
					return
				}
				emit((current) => panBy(current, { x: event.deltaX, y: event.deltaY }))
			}
			const onGestureStart = (event: Event) => {
				event.preventDefault()
				pinchStartZoom = shown.current.zoom
			}
			const onGestureChange = (event: Event) => {
				event.preventDefault()
				const gesture = event as SafariGestureEvent
				emit((current) =>
					zoomAround(
						current,
						pinchStartZoom * gesture.scale,
						pointerIn(element, gesture),
					),
				)
			}
			const measure = () =>
				setSize({ width: element.clientWidth, height: element.clientHeight })
			const observer = new ResizeObserver(measure)
			measure()

			element.addEventListener("wheel", onWheel, { passive: false })
			element.addEventListener("gesturestart", onGestureStart)
			element.addEventListener("gesturechange", onGestureChange)
			observer.observe(element)
			return () => {
				element.removeEventListener("wheel", onWheel)
				element.removeEventListener("gesturestart", onGestureStart)
				element.removeEventListener("gesturechange", onGestureChange)
				observer.disconnect()
			}
		},
		[emit],
	)

	const zoomTo = (step: (zoom: number) => number) =>
		emit((current) => zoomAround(current, step(current.zoom), centreOf(size)))
			.zoom

	const pan = (delta: BoardPoint) => emit((current) => panBy(current, delta))

	return { attach, canvas, pan, size, zoomTo }
}

const dockReachOf = (canvas: HTMLElement) => {
	const dock = canvas.querySelector('[data-slot="board-dock"]')
	return dock
		? canvas.getBoundingClientRect().bottom - dock.getBoundingClientRect().top
		: 0
}

const openingMarginOf = (canvas: HTMLElement) =>
	dockReachOf(canvas) + OPENING_MARGIN

type BoardDotGridProps = {
	pitch: number
	offset?: BoardPoint
}

const GRID_ORIGIN: BoardPoint = { x: 0, y: 0 }

const BoardDotGrid = ({ pitch, offset = GRID_ORIGIN }: BoardDotGridProps) => {
	const patternId = useId()

	return (
		<svg
			aria-hidden="true"
			className="pointer-events-none absolute inset-0 size-full"
			data-slot="board-dot-grid"
		>
			<pattern
				height={pitch}
				id={patternId}
				patternUnits="userSpaceOnUse"
				width={pitch}
				x={offset.x}
				y={offset.y}
			>
				<rect className="fill-board-dot" height={1} width={1} />
			</pattern>
			<rect fill={`url(#${patternId})`} height="100%" width="100%" />
		</svg>
	)
}

const BoardEmptyHint = () => {
	const { t } = useTranslation("common")

	return (
		<div
			className="pointer-events-none absolute inset-0 flex items-center justify-center p-6"
			data-slot="board-empty-hint"
		>
			<div className="flex w-full max-w-100 flex-col items-center gap-3 text-center">
				<div
					aria-hidden="true"
					className="relative h-18 w-22"
					data-slot="board-empty-stickies"
				>
					<div className="absolute top-1.5 left-7.5 size-13 origin-top-left rotate-8 rounded-[3px] bg-board-sticky-green shadow-board-hint-sticky" />
					<div className="absolute top-3 left-2.5 size-13 origin-top-left -rotate-5 rounded-[3px] bg-board-sticky-yellow shadow-board-hint-sticky-raised" />
				</div>
				<h2 className="font-semibold text-[17px] text-foreground leading-6">
					{t("board.empty.title")}
				</h2>
				<p className="text-muted-foreground text-sm">{t("board.empty.body")}</p>
			</div>
		</div>
	)
}

type BoardZoomButtonProps = {
	label: string
	icon: ComponentType<{ className?: string }>
	isDisabled: boolean
	onClick: () => void
}

const BoardZoomButton = ({
	label,
	icon: Icon,
	isDisabled,
	onClick,
}: BoardZoomButtonProps) => (
	<Button
		aria-label={label}
		className="rounded-[7px] text-board-control-foreground transition-none hover:bg-muted hover:text-board-control-foreground active:bg-input data-disabled:pointer-events-none data-disabled:text-disabled-foreground dark:hover:bg-muted"
		disabled={isDisabled}
		focusableWhenDisabled
		onClick={onClick}
		size="icon-sm"
		variant="ghost"
	>
		<Icon className="size-3.5" />
	</Button>
)

type BoardZoomControlProps = {
	zoom: number
	onZoomOut: () => number
	onZoomIn: () => number
}

const BoardZoomControl = ({
	zoom,
	onZoomOut,
	onZoomIn,
}: BoardZoomControlProps) => {
	const { t } = useTranslation("common")
	const [announcement, setAnnouncement] = useState("")
	const levelOf = (level: number) =>
		t("board.zoom.level", { percent: Math.round(level * 100) })
	const announce = (level: number) => setAnnouncement(levelOf(level))

	return (
		<div
			aria-label={t("board.zoom.controls")}
			className={cn(
				ZOOM_FRAME,
				"bg-board-control text-board-control-foreground shadow-board-control",
			)}
			data-slot="board-zoom-control"
			role="group"
		>
			<BoardZoomButton
				icon={Icons.ZoomOut}
				isDisabled={isAtZoomMin(zoom)}
				label={t("board.zoom.zoomOut")}
				onClick={() => announce(onZoomOut())}
			/>
			<span className={ZOOM_LEVEL} data-slot="board-zoom-level">
				{levelOf(zoom)}
			</span>
			<BoardZoomButton
				icon={Icons.ZoomIn}
				isDisabled={isAtZoomMax(zoom)}
				label={t("board.zoom.zoomIn")}
				onClick={() => announce(onZoomIn())}
			/>
			<span className="sr-only" role="status">
				{announcement}
			</span>
		</div>
	)
}

type BoardCanvasSkeletonProps = {
	viewport: BoardViewport
	className?: string
}

const BoardCanvasSkeleton = ({
	viewport,
	className,
}: BoardCanvasSkeletonProps) => {
	const { t } = useTranslation("common")

	return (
		<section
			aria-busy="true"
			aria-label={t("board.canvas.loading")}
			className={cn(CANVAS_SURFACE, className)}
			data-slot="board-canvas"
		>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0"
				data-slot="board-skeleton"
			>
				<BoardDotGrid
					offset={viewport.offset}
					pitch={gridScreenPitch(viewport.zoom)}
				/>
				<BoardDockSkeleton />
				<Skeleton
					className={cn(ZOOM_FRAME, "animate-none bg-border")}
					data-slot="board-zoom-skeleton"
				>
					<span className="size-7" />
					<span className={cn(ZOOM_LEVEL, "invisible")}>
						{t("board.zoom.level", {
							percent: Math.round(viewport.zoom * 100),
						})}
					</span>
					<span className="size-7" />
				</Skeleton>
			</div>
		</section>
	)
}

const DRAG_THRESHOLD = 3
const KEY_STEP = 1
const KEY_STEP_LARGE = 10
const PAN_STEP = 48
const FRAME_OUTSET = 4
const MOVING_OUTSET = 3
const BAR_GAP = 16
const FIT_TO_FRAME =
	"*:size-full! *:overflow-hidden *:data-[slot=board-object-outline]:*:size-full! *:data-[slot=board-object-outline]:*:overflow-hidden"
const TEXT_KINDS: ReadonlySet<BoardItemKind> = new Set([
	"sticky",
	"text",
	"shape",
])
const DEFAULT_SHAPE_STYLE: BoardShapeStyle = {
	shape: "rounded-rectangle",
	fill: "surface",
}

type BoardCreationTool = Extract<
	BoardTool,
	"sticky" | "shape" | "text" | "section"
>

const SIZE_OF_CREATED: Record<BoardCreationTool, BoardSize> = {
	sticky: boardSchema.kinds.sticky.size,
	shape: boardSchema.kinds.shape.size,
	text: boardSchema.kinds.text.size,
	section: boardSchema.kinds.section.size,
}

const isCreationTool = (tool: BoardTool): tool is BoardCreationTool =>
	Object.hasOwn(SIZE_OF_CREATED, tool)

const createdItemOf = (
	kind: BoardCreationTool,
	centre: BoardPoint,
	zOrder: number,
): BoardItem => {
	const size = SIZE_OF_CREATED[kind]
	return {
		id: crypto.randomUUID(),
		kind,
		position: {
			x: Math.round(centre.x - size.width / 2),
			y: Math.round(centre.y - size.height / 2),
		},
		size,
		zOrder,
		text: "",
	}
}

const zOrderOfCreated = (
	kind: BoardCreationTool,
	objects: readonly BoardObject[],
) => {
	const zOrders = objects.map(({ zOrder }) => zOrder)
	return kind === "section"
		? Math.min(0, ...zOrders) - 1
		: Math.max(0, ...zOrders) + 1
}

const HANDLE_PLACE: Record<BoardCorner, string> = {
	"top-left": "-top-1.5 -left-1.5 cursor-nwse-resize",
	"top-right": "-top-1.5 -right-1.5 cursor-nesw-resize",
	"bottom-left": "-bottom-1.5 -left-1.5 cursor-nesw-resize",
	"bottom-right": "-right-1.5 -bottom-1.5 cursor-nwse-resize",
}

type BoardGesture = {
	id: string
	rect: BoardRect
	isMove: boolean
}

type BoardTextField = {
	rect: BoardRect
	look: CSSProperties
}

type BoardEditing = {
	id: string
	text: string
	field: BoardTextField
}

type BoardReshape = (rect: BoardRect, delta: BoardPoint) => BoardRect

type BoardAnchor = {
	id: string
	side: BoardSide
}

type BoardHover = {
	id: string | null
	anchor: BoardAnchor | null
}

type BoardArrowGesture = {
	arrow: BoardConnector
	isNew: boolean
	hasEnd: boolean
	ring: string | null
	marker: BoardPoint | null
	isLabelSliding: boolean
}

type BoardArrowEndName = "from" | "to"

type BoardArrowEnd = {
	shape?: string
	anchor?: BoardPoint
	point?: BoardPoint
}

type BoardModifiedPointer = PointerPosition & {
	altKey: boolean
	ctrlKey: boolean
}

type BoardArrowAim = BoardModifiedPointer & {
	isStill: boolean
}

type BoardLabelEditing = {
	id: string
	text: string
}

type ShownConnector = {
	connector: BoardConnector
	bounds: BoardRect
	route: BoardRoute
	passesUnder: readonly BoardRect[]
}

const NO_HOVER: BoardHover = { id: null, anchor: null }
const CONNECTOR_STROKE = 1.5
const CONNECTOR_HALO_STROKE = 4.5
const CONNECTOR_HIT_STROKE = 24
const SOURCE_DOT_RADIUS = 4
const END_HANDLE_RADIUS = 4
const MIDDLE_HANDLE_RADIUS = 5.5
const MARKER_RING_RADIUS = 9
const MARKER_DOT_RADIUS = 3
const MARKER_STROKE = 2
const MIDDLE_TICK_HALF_LENGTH = 8
const LABEL_MIDDLE = 0.5
const LABEL_SNAP_DISTANCE = 8
const EXACT_POINT_DELAY = 500
const ANCHOR_PRECISION = 1000
const MODIFIER_KEYS: ReadonlySet<string> = new Set(["Alt", "Control"])
const LABEL_CHIP =
	"rounded-[4px] bg-board-surface p-1 text-center font-medium text-board-foreground text-compact leading-4 ring-user-bubble wrap-break-word"
const MASK_MARGIN = 32
const FLYOUT_SAMPLES = 16
const CROSSABLE_KINDS: ReadonlySet<BoardItemKind> = new Set([
	"sticky",
	"shape",
	"text",
])
const ANCHOR_PLACE: Record<BoardSide, string> = {
	top: "top-0 left-1/2",
	right: "top-1/2 left-full",
	bottom: "top-full left-1/2",
	left: "top-1/2 left-0",
}

const boardTransformOf = ({ offset, zoom }: BoardViewport) =>
	`translate(${offset.x} ${offset.y}) scale(${zoom})`

const obstaclesOf = (
	items: readonly BoardItem[],
	boundsOf: (item: BoardItem) => BoardRect,
): BoardObstacles => {
	const sections = items.filter((item) => item.kind === "section")
	return {
		blocks: items.filter((item) => item.kind !== "section").map(boundsOf),
		titles: sections.map((item) => sectionTitleBox(boundsOf(item), item.text)),
		frames: sections.map(boundsOf),
	}
}

const maskAreaOf = ({ points, control }: BoardRoute): BoardRect => {
	const corners = control ? [...points, control] : points
	const xs = corners.map(({ x }) => x)
	const ys = corners.map(({ y }) => y)
	const x = Math.min(...xs) - MASK_MARGIN
	const y = Math.min(...ys) - MASK_MARGIN
	return {
		x,
		y,
		width: Math.max(...xs) + MASK_MARGIN - x,
		height: Math.max(...ys) + MASK_MARGIN - y,
	}
}

const hoverOf = (element: Element | null): BoardHover => {
	const anchor = element?.closest<HTMLElement>('[data-slot="board-anchor"]')
	const { anchorObject, side } = anchor?.dataset ?? {}
	if (anchorObject && side)
		return {
			id: anchorObject,
			anchor: { id: anchorObject, side: side as BoardSide },
		}
	const object = element?.closest<HTMLElement>('[data-slot="board-object"]')
	return { id: object?.dataset.objectId ?? null, anchor: null }
}

const objectIdUnder = ({ clientX, clientY }: PointerPosition) =>
	document
		.elementsFromPoint(clientX, clientY)
		.map((element) =>
			element.closest<HTMLElement>('[data-slot="board-object"]'),
		)
		.find(Boolean)?.dataset.objectId ?? null

const anchorIn = (rect: BoardRect, point: BoardPoint): BoardPoint => ({
	x:
		Math.round(((point.x - rect.x) / rect.width) * ANCHOR_PRECISION) /
		ANCHOR_PRECISION,
	y:
		Math.round(((point.y - rect.y) / rect.height) * ANCHOR_PRECISION) /
		ANCHOR_PRECISION,
})

const withEnd = (
	arrow: BoardConnector,
	end: BoardArrowEndName,
	{ shape = "", anchor, point }: BoardArrowEnd,
): BoardConnector =>
	end === "from"
		? {
				...arrow,
				from: shape,
				fromSide: undefined,
				fromAnchor: anchor,
				fromPoint: point,
			}
		: {
				...arrow,
				to: shape,
				toSide: undefined,
				toAnchor: anchor,
				toPoint: point,
			}

const gestureHolding = (arrow: BoardConnector): BoardArrowGesture => ({
	arrow,
	isNew: false,
	hasEnd: true,
	ring: null,
	marker: null,
	isLabelSliding: false,
})

const aimOf = (
	{ clientX, clientY, altKey, ctrlKey }: BoardModifiedPointer,
	isStill: boolean,
): BoardArrowAim => ({ clientX, clientY, altKey, ctrlKey, isStill })

const placeOfLabel = (route: BoardRoute, connector: BoardConnector) => {
	const at = pointAlong(route, connector.labelPosition ?? LABEL_MIDDLE)
	return { left: at.x, top: at.y }
}

const snappedLabelPosition = (route: BoardRoute, position = LABEL_MIDDLE) => {
	const at = pointAlong(route, position)
	const middle = pointAlong(route, LABEL_MIDDLE)
	return Math.hypot(at.x - middle.x, at.y - middle.y) <= LABEL_SNAP_DISTANCE
		? LABEL_MIDDLE
		: position
}

const isPointed = ({ arrow, hasEnd }: BoardArrowGesture) =>
	hasEnd && Boolean(arrow.toAnchor ?? arrow.toPoint)

const screenBoundsOf = (route: BoardRoute, viewport: BoardViewport) => {
	const corners = [
		...route.points,
		...Array.from({ length: FLYOUT_SAMPLES + 1 }, (_, step) =>
			pointAlong(route, step / FLYOUT_SAMPLES),
		),
	]
	const xs = corners.map(({ x }) => x)
	const ys = corners.map(({ y }) => y)
	return toScreenRect(
		{
			x: Math.min(...xs),
			y: Math.min(...ys),
			width: Math.max(...xs) - Math.min(...xs),
			height: Math.max(...ys) - Math.min(...ys),
		},
		viewport,
	)
}

const placeOf = (rect: BoardRect) => ({
	left: rect.x,
	top: rect.y,
	width: rect.width,
	height: rect.height,
})

const hasText = (item: BoardItem) => TEXT_KINDS.has(item.kind)

const surfaceBehind = (text: HTMLElement, object: HTMLElement) => {
	for (
		let node: HTMLElement | null = text;
		node && node !== object;
		node = node.parentElement
	) {
		const { backgroundColor } = getComputedStyle(node)
		if (backgroundColor !== NO_PAINT) return backgroundColor
	}
	return NO_PAINT
}

const textFieldOf = (
	object: HTMLElement,
	item: BoardItem,
	zoom: number,
): BoardTextField => {
	const marked = object.querySelector<HTMLElement>("[data-board-text]")
	const text = marked?.offsetWidth && marked.offsetHeight ? marked : object
	const objectBox = object.getBoundingClientRect()
	const box = text.getBoundingClientRect()
	const style = getComputedStyle(text)
	return {
		rect: {
			x: item.position.x + (box.x - objectBox.x) / zoom,
			y: item.position.y + (box.y - objectBox.y) / zoom,
			width: box.width / zoom,
			height: box.height / zoom,
		},
		look: {
			backgroundColor: surfaceBehind(text, object),
			color: style.color,
			fontFamily: style.fontFamily,
			fontSize: style.fontSize,
			fontStyle: style.fontStyle,
			fontWeight: style.fontWeight,
			letterSpacing: style.letterSpacing,
			lineHeight: style.lineHeight,
			textAlign: style.textAlign as CSSProperties["textAlign"],
		},
	}
}

const placeCaretAtEnd = (field: HTMLTextAreaElement | null) => {
	if (!field) return
	field.focus()
	field.setSelectionRange(field.value.length, field.value.length)
}

type BoardSelectionFrameProps = {
	rect: BoardRect
	hasHandles: boolean
	onPressHandle: (
		corner: BoardCorner,
	) => (event: PointerEvent<HTMLElement>) => void
}

const BoardSelectionFrame = ({
	rect,
	hasHandles,
	onPressHandle,
}: BoardSelectionFrameProps) => (
	<div
		aria-hidden="true"
		className="pointer-events-none absolute rounded-[2px] border-2 border-user-bubble"
		data-slot="board-selection-frame"
		style={{
			left: rect.x - FRAME_OUTSET,
			top: rect.y - FRAME_OUTSET,
			width: rect.width + FRAME_OUTSET * 2,
			height: rect.height + FRAME_OUTSET * 2,
		}}
	>
		{hasHandles
			? BOARD_CORNERS.map((corner) => (
					<div
						className={cn(
							"pointer-events-auto absolute size-2.5 rounded-[2px] border-2 border-user-bubble bg-card before:absolute before:-inset-[9px] before:content-['']",
							HANDLE_PLACE[corner],
						)}
						data-corner={corner}
						data-slot="board-selection-handle"
						key={corner}
						onPointerDown={onPressHandle(corner)}
					/>
				))
			: null}
	</div>
)

type OutlinedObjectProps = {
	outline?: BoardObjectOutlineSpec
	children: ReactNode
}

const OutlinedObject = ({ outline, children }: OutlinedObjectProps) =>
	outline ? (
		<BoardObjectOutline owner={outline.owner} state={outline.state}>
			{children}
		</BoardObjectOutline>
	) : (
		children
	)

type BoardFileKind = "image" | "file"

type BoardFileDrag = {
	kinds: readonly BoardFileKind[]
	at: BoardPoint
}

const GHOST_TILT = ["-rotate-3", "rotate-2", "rotate-7"] as const
const UNREADABLE_FILES: readonly BoardFileKind[] = ["file"]
const DROPPED_URL: readonly BoardFileKind[] = ["image"]

const dropLabelOf = (kinds: readonly BoardFileKind[]) => {
	if (kinds.length === 0) return "board.drop.unknown"
	return kinds.every((kind) => kind === "image")
		? "board.drop.images"
		: "board.drop.files"
}

const BoardFileDropState = ({ kinds, at }: BoardFileDrag) => {
	const { t } = useTranslation("common")
	const shownKinds = kinds.length > 0 ? kinds : UNREADABLE_FILES

	return (
		<div
			aria-hidden="true"
			className="pointer-events-none absolute inset-0"
			data-slot="board-file-drop"
		>
			<div
				className="absolute inset-2 rounded-[10px] border-2 border-user-bubble border-dashed bg-user-bubble/4"
				data-slot="board-drop-target"
			/>
			<div
				className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3"
				data-slot="board-drop-ghost"
				style={{ left: at.x, top: at.y }}
			>
				<div className="relative h-23 w-33">
					{GHOST_TILT.slice(0, shownKinds.length)
						.map((tilt, index) => {
							const kind = shownKinds[index]
							const Glyph = kind === "image" ? Icons.Image : Icons.File
							return (
								<div
									className={cn(
										"absolute inset-0 grid place-items-center rounded-[6px] border border-board-card-border bg-board-card-surface text-board-muted-foreground shadow-board-card",
										tilt,
									)}
									data-kind={kind}
									data-slot="board-drop-thumbnail"
									key={tilt}
								>
									<Glyph className="size-6" />
								</div>
							)
						})
						.reverse()}
				</div>
				<p
					className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-user-bubble p-2 font-semibold text-compact text-user-bubble-foreground leading-4 shadow-board-drop-pill"
					data-slot="board-drop-pill"
				>
					<Icons.Add className="size-3.5 shrink-0" />
					{t(dropLabelOf(kinds), { count: kinds.length })}
				</p>
			</div>
		</div>
	)
}

const URL_LIST = "text/uri-list"
const FROM_THIS_BOARD = "application/x-kiroshi-board"

const isFileDrag = (transfer: DataTransfer) => transfer.types.includes("Files")

const isBoardDrop = (transfer: DataTransfer) =>
	!transfer.types.includes(FROM_THIS_BOARD) &&
	(isFileDrag(transfer) || transfer.types.includes(URL_LIST))

const fileKindsOf = (transfer: DataTransfer): BoardFileKind[] =>
	Array.from(transfer.items)
		.filter((item) => item.kind === "file")
		.map((item) => (item.type.startsWith("image/") ? "image" : "file"))

const isWebLink = (text: string) =>
	/^https?:\/\//i.test(text) && URL.canParse(text)

const firstUrlOf = (uriList: string) =>
	uriList
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find((line) => line !== "" && !line.startsWith("#"))

const pastedOf = (clipboard: DataTransfer): BoardPaste | undefined => {
	const files = Array.from(clipboard.files)
	const [first] = files
	if (files.length === 1 && first?.type.startsWith("image/"))
		return { kind: "image", payload: first }
	if (first) return { kind: "files", payload: files }
	const text = clipboard.getData("text/plain").trim()
	return isWebLink(text) ? { kind: "link", payload: text } : undefined
}

const isBoardTarget = (target: EventTarget, board: EventTarget) =>
	target === board || (target as HTMLElement).dataset.slot === "board-object"
type BoardConnectorLook = "rest" | "selected" | "draft"

type BoardConnectorLineProps = {
	route: BoardRoute
	look: BoardConnectorLook
	headSize?: BoardArrowHeadSize
	passesUnder?: readonly BoardRect[]
	hasHalo?: boolean
	marker?: BoardPoint | null
	hasMiddleTick?: boolean
	onPressEnd?: (
		end: BoardArrowEndName,
	) => (event: PointerEvent<SVGCircleElement>) => void
	onPressMiddle?: (event: PointerEvent<SVGCircleElement>) => void
	slot: "board-connector" | "board-connector-draft"
}

type BoardConnectorMiddleTickProps = {
	route: BoardRoute
}

const BoardConnectorMiddleTick = ({ route }: BoardConnectorMiddleTickProps) => {
	const middle = pointAlong(route, LABEL_MIDDLE)
	const along = directionAlong(route, LABEL_MIDDLE)
	const across = {
		x: -along.y * MIDDLE_TICK_HALF_LENGTH,
		y: along.x * MIDDLE_TICK_HALF_LENGTH,
	}
	return (
		<line
			className="stroke-user-bubble/60"
			data-slot="board-connector-middle-tick"
			strokeDasharray="2 3"
			strokeLinecap="butt"
			x1={middle.x - across.x}
			x2={middle.x + across.x}
			y1={middle.y - across.y}
			y2={middle.y + across.y}
		/>
	)
}

type BoardConnectorExactPointProps = {
	at: BoardPoint
}

const BoardConnectorExactPoint = ({ at }: BoardConnectorExactPointProps) => (
	<g
		className="stroke-board-arrow-marker"
		data-slot="board-connector-exact-point"
		strokeWidth={MARKER_STROKE}
	>
		<circle cx={at.x} cy={at.y} r={MARKER_RING_RADIUS} />
		<circle
			className="fill-board-arrow-marker stroke-none"
			cx={at.x}
			cy={at.y}
			r={MARKER_DOT_RADIUS}
		/>
	</g>
)

const BoardConnectorLine = ({
	route,
	look,
	headSize,
	passesUnder = [],
	hasHalo = look === "selected",
	marker,
	hasMiddleTick = false,
	onPressEnd,
	onPressMiddle,
	slot,
}: BoardConnectorLineProps) => {
	const maskId = useId()
	const maskArea = maskAreaOf(route)
	const isMasked = passesUnder.length > 0
	const path = routePathData(route)
	const tip = route.points.at(-1)
	const head = tip ? arrowheadPathData(tip, route.arrow, headSize) : null
	const isSelected = look === "selected"
	const middle = pointAlong(route, LABEL_MIDDLE)
	const ends = [
		["from", route.points[0]],
		["to", tip],
	] as const
	return (
		<g
			className={
				look === "rest" ? "stroke-board-shape-border" : "stroke-user-bubble"
			}
			data-slot={slot}
			fill="none"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth={CONNECTOR_STROKE}
		>
			{isMasked ? (
				<mask
					data-slot="board-connector-mask"
					id={maskId}
					maskUnits="userSpaceOnUse"
					{...maskArea}
				>
					<rect fill="white" stroke="none" {...maskArea} />
					{passesUnder.map((rect) => (
						<rect
							data-slot="board-connector-mask-hole"
							fill="black"
							key={`${rect.x} ${rect.y} ${rect.width} ${rect.height}`}
							stroke="none"
							{...rect}
						/>
					))}
				</mask>
			) : null}
			<g mask={isMasked ? `url(#${maskId})` : undefined}>
				{hasHalo ? (
					<g
						className="stroke-board-surface"
						data-slot="board-connector-halo"
						strokeWidth={CONNECTOR_HALO_STROKE}
					>
						<path d={path} />
						{head ? <path d={head} /> : null}
					</g>
				) : null}
				<path d={path} data-slot="board-connector-path" />
				{head ? <path d={head} data-slot="board-connector-arrowhead" /> : null}
			</g>
			{hasMiddleTick ? <BoardConnectorMiddleTick route={route} /> : null}
			{isSelected ? (
				<>
					{ends.map(([end, at]) =>
						at ? (
							<circle
								className="pointer-events-auto cursor-crosshair fill-board-surface"
								cx={at.x}
								cy={at.y}
								data-end={end}
								data-slot="board-connector-end-handle"
								key={end}
								onPointerDown={onPressEnd?.(end)}
								r={END_HANDLE_RADIUS}
							/>
						) : null,
					)}
					<circle
						className={cn(
							"fill-user-bubble stroke-none",
							onPressMiddle && "pointer-events-auto cursor-move",
						)}
						cx={middle.x}
						cy={middle.y}
						data-slot="board-connector-middle-handle"
						onPointerDown={onPressMiddle}
						r={MIDDLE_HANDLE_RADIUS}
					/>
				</>
			) : null}
			{marker ? <BoardConnectorExactPoint at={marker} /> : null}
		</g>
	)
}

type BoardConnectorLabelProps = {
	route: BoardRoute
	labelPosition?: number
	isSelected: boolean
	text: string
	onPointerDown: (event: PointerEvent<HTMLElement>) => void
	onDoubleClick: () => void
}

const BoardConnectorLabel = ({
	route,
	labelPosition = LABEL_MIDDLE,
	isSelected,
	text,
	onPointerDown,
	onDoubleClick,
}: BoardConnectorLabelProps) => {
	const at = pointAlong(route, labelPosition)
	return (
		<p
			className={cn(
				LABEL_CHIP,
				"pointer-events-auto absolute w-max max-w-60 -translate-x-1/2 -translate-y-1/2 cursor-grab select-none",
				isSelected && "ring-[1.5px]",
			)}
			data-slot="board-connector-label"
			onDoubleClick={onDoubleClick}
			onPointerDown={onPointerDown}
			style={{ left: at.x, top: at.y }}
		>
			{text}
		</p>
	)
}

type BoardAnchorFrameProps = {
	id: string
	rect: BoardRect
	activeSide?: BoardSide
	onPressAnchor?: (
		anchor: BoardAnchor,
	) => (event: PointerEvent<HTMLElement>) => void
}

const BoardAnchorFrame = ({
	id,
	rect,
	activeSide,
	onPressAnchor,
}: BoardAnchorFrameProps) => (
	<div
		aria-hidden="true"
		className="pointer-events-none absolute"
		data-object-id={id}
		data-slot="board-anchor-frame"
		style={placeOf(rect)}
	>
		<div
			className="absolute -inset-1 rounded-[7px] border-2 border-user-bubble"
			data-slot="board-hover-outline"
		/>
		{(onPressAnchor ? BOARD_SIDES : []).map((side) => (
			<div
				className={cn(
					"pointer-events-auto absolute size-2.5 -translate-x-1/2 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-user-bubble before:absolute before:-inset-[9px] before:content-['']",
					side === activeSide
						? "bg-user-bubble ring-3 ring-user-bubble/25"
						: "bg-board-surface",
					ANCHOR_PLACE[side],
				)}
				data-active={side === activeSide}
				data-anchor-object={id}
				data-side={side}
				data-slot="board-anchor"
				key={side}
				onPointerDown={onPressAnchor?.({ id, side })}
			/>
		))}
	</div>
)

const ReadyBoardCanvas = ({
	view,
	viewport: givenViewport,
	onViewportChange,
	onIntent,
	renderObject,
	pointers = [],
	outlines = [],
	tool,
	onToolChange,
	libraryItems,
	onLibraryItemPick,
	onLibraryItemDrop,
	onPaste,
	onDropFiles,
	onDropUrl,
	onPointerMove,
	onSelectionChange,
	isConnecting: isConnectingByApp = false,
	commentThreads = [],
	openCommentThread,
	commentDraft,
	isCommentMode = false,
	onOpenCommentThread,
	onStartComment,
	onLeaveCommentMode,
	className,
}: ReadyBoardCanvasProps) => {
	const { t } = useTranslation("common")
	const [opening, setOpening] = useState<BoardViewport | null>(null)
	const placed = givenViewport ?? opening
	const viewport = placed ?? UNPLACED_VIEWPORT
	const { attach, canvas, pan, size, zoomTo } = useBoardGestures(
		viewport,
		onViewportChange,
	)
	const [selectedId, setSelectedId] = useState<string | null>(null)
	const [shownObjects, setShownObjects] = useState(view.objects)
	const reportedSelectionId = useRef<string | null>(null)
	const [editing, setEditing] = useState<BoardEditing | null>(null)
	const [gesture, setGesture] = useState<BoardGesture | null>(null)
	const [announcement, setAnnouncement] = useState("")
	const [fileDrag, setFileDrag] = useState<BoardFileDrag | null>(null)
	const [routing, setRouting] = useState<BoardRouting>("elbow")
	const [hover, setHover] = useState(NO_HOVER)
	const [arrowGesture, setArrowGesture] = useState<BoardArrowGesture | null>(
		null,
	)
	const stopArrowGesture = useRef<(() => void) | null>(null)
	const [labelEditing, setLabelEditing] = useState<BoardLabelEditing | null>(
		null,
	)
	const isLabelEditCancelled = useRef(false)
	const [arrivingTextId, setArrivingTextId] = useState<string | null>(null)
	const imageChooser = useRef<HTMLInputElement>(null)
	const chosenImagesPoint = useRef<BoardPoint | null>(null)
	const isConnecting = isConnectingByApp || tool === "connector"
	const [isPanning, setIsPanning] = useState(false)
	const isPlacing = isCreationTool(tool) || tool === "image"
	const handCursor = isPanning ? "cursor-grabbing" : "cursor-grab"

	useEffect(() => () => stopArrowGesture.current?.(), [])

	useLayoutEffect(() => {
		if (placed || !size.width || !size.height || !canvas.current) return
		const fitted = openingViewportOf(
			view.objects,
			size,
			openingMarginOf(canvas.current),
		)
		setOpening(fitted)
		onViewportChange(fitted)
	}, [placed, size, canvas, view.objects, onViewportChange])

	if (shownObjects !== view.objects) {
		setShownObjects(view.objects)
		const isIn = (objects: readonly BoardObject[]) =>
			objects.some((object) => object.id === selectedId)
		if (isIn(shownObjects) && !isIn(view.objects)) setSelectedId(null)
	}

	useEffect(() => {
		if (reportedSelectionId.current === selectedId) return
		reportedSelectionId.current = selectedId
		onSelectionChange?.(selectedId ? [selectedId] : [])
	}, [selectedId, onSelectionChange])

	const changedArrow =
		arrowGesture && !arrowGesture.isNew ? arrowGesture.arrow : null
	const liveObjects = changedArrow
		? view.objects.map((object) =>
				object.id === changedArrow.id ? changedArrow : object,
			)
		: view.objects
	const mounted = cullBoardObjects(liveObjects, viewport, size)
	const mountedItems = mounted.flatMap(({ object }) =>
		isItem(object) ? [object] : [],
	)
	const itemsById = new Map(
		view.objects.filter(isItem).map((item) => [item.id, item]),
	)
	const selected = selectedId ? itemsById.get(selectedId) : undefined
	const selectedConnector = view.objects.find(
		(object): object is BoardConnector =>
			object.kind === "connector" && object.id === selectedId,
	)
	const liveBounds = (item: BoardItem) =>
		gesture?.id === item.id ? gesture.rect : itemBounds(item)

	const obstacles = obstaclesOf([...itemsById.values()], liveBounds)

	const endOf = (
		id: string,
		side?: BoardSide,
		anchor?: BoardPoint,
		point?: BoardPoint,
	): BoardConnectorEnd | null => {
		if (point) return { rect: { ...point, width: 0, height: 0 }, point }
		const item = itemsById.get(id)
		if (!item) return null
		const rect = liveBounds(item)
		return { rect, side, point: anchor && exactPointOf(rect, anchor) }
	}

	const arrows = liveObjects.flatMap((connector) => {
		if (connector.kind !== "connector") return []
		const source = endOf(
			connector.from,
			connector.fromSide,
			connector.fromAnchor,
			connector.fromPoint,
		)
		const target = endOf(
			connector.to,
			connector.toSide,
			connector.toAnchor,
			connector.toPoint,
		)
		return source && target
			? [
					{
						id: connector.id,
						source,
						target,
						routing: connector.routing,
						bend: connector.bend,
					},
				]
			: []
	})
	const routes = new Map(
		routeConnectors(arrows, obstacles).map((route, index) => [
			arrows[index].id,
			route,
		]),
	)

	const passesUnderOf = (connector: BoardConnector, route: BoardRoute) =>
		connector.routing === "straight"
			? crossedRects(
					route,
					[...itemsById.values()]
						.filter(
							(item) =>
								CROSSABLE_KINDS.has(item.kind) &&
								item.id !== connector.from &&
								item.id !== connector.to,
						)
						.map(liveBounds),
				)
			: []

	const shownConnectors = mounted.flatMap(
		({ object, bounds }): ShownConnector[] => {
			if (object.kind !== "connector") return []
			const route = routes.get(object.id)
			return route
				? [
						{
							connector: object,
							bounds,
							route,
							passesUnder: passesUnderOf(object, route),
						},
					]
				: []
		},
	)

	const draftRouteOf = (arrow: BoardConnector) => {
		const source = endOf(arrow.from, arrow.fromSide)
		const target = endOf(arrow.to, undefined, arrow.toAnchor, arrow.toPoint)
		if (!source || !target || !arrow.fromSide) return null
		return {
			route: routeConnector(source, target, arrow.routing, { obstacles }),
			source: anchorOf({ rect: source.rect, side: arrow.fromSide }),
		}
	}

	const nameOf = (item: BoardItem) => {
		const kind = t(`board.object.kind.${item.kind}`)
		return item.text ? t("board.object.named", { kind, text: item.text }) : kind
	}

	const objectNodeOf = (id: string) =>
		canvas.current?.querySelector<HTMLElement>(
			`[data-slot="board-object"][data-object-id="${CSS.escape(id)}"]`,
		)

	const focusObject = (id: string) => objectNodeOf(id)?.focus()

	const clearSelection = () => {
		setSelectedId(null)
		canvas.current?.focus()
	}

	const startEditing = (item: BoardItem) => {
		const node = objectNodeOf(item.id)
		if (!hasText(item) || !node) return
		setSelectedId(item.id)
		setEditing({
			id: item.id,
			text: item.text,
			field: textFieldOf(node, item, viewport.zoom),
		})
	}

	const openArrivedText = (item: BoardItem) => (node: HTMLElement | null) => {
		if (!node) return
		setArrivingTextId(null)
		startEditing(item)
	}

	const finishEditing = () => {
		if (!editing) return
		const item = view.objects.find((object) => object.id === editing.id)
		if (item && item.text !== editing.text)
			onIntent({ type: "edit-text", id: editing.id, text: editing.text })
		setEditing(null)
	}

	const follow = (
		event: PointerEvent<HTMLElement>,
		item: BoardItem,
		reshape: BoardReshape,
		release: (rect: BoardRect) => void,
	) => {
		const start = { x: event.clientX, y: event.clientY }
		const { zoom } = viewport
		let latest: BoardRect | null = null
		const track = (moved: globalThis.PointerEvent) => {
			const delta = { x: moved.clientX - start.x, y: moved.clientY - start.y }
			if (!latest && Math.hypot(delta.x, delta.y) < DRAG_THRESHOLD) return
			latest = roundedRect(
				reshape(itemBounds(item), scalePoint(delta, 1 / zoom)),
			)
			setGesture({ id: item.id, rect: latest, isMove: reshape === movedRect })
		}
		const finish = (end: globalThis.PointerEvent) => {
			window.removeEventListener("pointermove", track)
			window.removeEventListener("pointerup", finish)
			window.removeEventListener("pointercancel", finish)
			if (end.type === "pointerup") track(end)
			setGesture(null)
			if (latest && end.type === "pointerup") release(latest)
		}
		window.addEventListener("pointermove", track)
		window.addEventListener("pointerup", finish)
		window.addEventListener("pointercancel", finish)
	}

	const emitMove = (id: string, rect: BoardRect) =>
		onIntent({ type: "move", id, position: { x: rect.x, y: rect.y } })

	const emitResize = (id: string, rect: BoardRect) =>
		onIntent({
			type: "resize",
			id,
			position: { x: rect.x, y: rect.y },
			size: { width: rect.width, height: rect.height },
		})

	const pressObject =
		(item: BoardItem) => (event: PointerEvent<HTMLElement>) => {
			if (event.button !== 0) return
			setSelectedId(item.id)
			follow(event, item, movedRect, (rect) => emitMove(item.id, rect))
		}

	const pressHandle =
		(corner: BoardCorner) => (event: PointerEvent<HTMLElement>) => {
			if (event.button !== 0 || !selected) return
			event.preventDefault()
			follow(
				event,
				selected,
				(rect, delta) => resizedFromCorner(rect, corner, delta),
				(rect) => emitResize(selected.id, rect),
			)
		}

	const emitArrow = (arrow: BoardConnector) =>
		onIntent({ type: "set-arrow", arrow })

	const pressConnector =
		(connector: BoardConnector) => (event: PointerEvent<SVGPathElement>) => {
			if (event.button !== 0) return
			setSelectedId(connector.id)
			canvas.current?.focus()
		}

	const trackArrow = (
		pressed: BoardModifiedPointer,
		aimAt: (aim: BoardArrowAim) => BoardArrowGesture,
		release: (gesture: BoardArrowGesture) => void,
		isImmediate = false,
	) => {
		let last = aimOf(pressed, false)
		let stillAt: PointerPosition = last
		let stillTimer: ReturnType<typeof setTimeout> | undefined
		let latest: BoardArrowGesture | null = null
		const aim = (at: BoardArrowAim) => {
			last = at
			latest = aimAt(at)
			setArrowGesture(latest)
		}
		const waitForStillness = () => {
			clearTimeout(stillTimer)
			stillTimer = setTimeout(
				() => aim({ ...last, isStill: true }),
				EXACT_POINT_DELAY,
			)
		}
		const move = (moved: globalThis.PointerEvent) => {
			const hasDrifted =
				Math.hypot(
					moved.clientX - stillAt.clientX,
					moved.clientY - stillAt.clientY,
				) >= DRAG_THRESHOLD
			if (!latest && !hasDrifted) return
			if (hasDrifted) {
				stillAt = { clientX: moved.clientX, clientY: moved.clientY }
				waitForStillness()
			}
			aim(aimOf(moved, last.isStill && !hasDrifted))
		}
		const answerKey = (key: globalThis.KeyboardEvent) => {
			if (key.type === "keydown" && key.key === "Escape") {
				key.preventDefault()
				stop()
				setArrowGesture(null)
				return
			}
			if (latest && MODIFIER_KEYS.has(key.key))
				aim(
					aimOf(
						{ ...last, altKey: key.altKey, ctrlKey: key.ctrlKey },
						last.isStill,
					),
				)
		}
		const stop = () => {
			clearTimeout(stillTimer)
			window.removeEventListener("pointermove", move)
			window.removeEventListener("pointerup", finish)
			window.removeEventListener("pointercancel", finish)
			window.removeEventListener("keydown", answerKey)
			window.removeEventListener("keyup", answerKey)
			stopArrowGesture.current = null
		}
		const finish = (end: globalThis.PointerEvent) => {
			if (end.type === "pointerup") move(end)
			stop()
			setArrowGesture(null)
			if (latest && end.type === "pointerup") release(latest)
		}
		if (isImmediate) {
			aim(last)
			waitForStillness()
		}
		window.addEventListener("pointermove", move)
		window.addEventListener("pointerup", finish)
		window.addEventListener("pointercancel", finish)
		window.addEventListener("keydown", answerKey)
		window.addEventListener("keyup", answerKey)
		stopArrowGesture.current = stop
	}

	const aimEnd = (
		element: HTMLElement,
		arrow: BoardConnector,
		end: BoardArrowEndName,
		isNew: boolean,
	) => {
		const otherShape = end === "to" ? arrow.from : arrow.to
		let exactShape: string | null = null
		return (aim: BoardArrowAim): BoardArrowGesture => {
			const point = boardPointAt(pointerIn(element, aim))
			const loose = { ...gestureHolding(withEnd(arrow, end, { point })), isNew }
			if (aim.ctrlKey) return loose
			const id = objectIdUnder(aim)
			const item = id && id !== otherShape ? itemsById.get(id) : undefined
			if (!item) {
				exactShape = null
				return { ...loose, hasEnd: !isNew }
			}
			exactShape = aim.isStill || exactShape === item.id ? item.id : null
			const isExact = exactShape === item.id && !aim.altKey
			const rect = liveBounds(item)
			const anchor = isExact || aim.altKey ? anchorIn(rect, point) : undefined
			return {
				...loose,
				arrow: withEnd(arrow, end, { shape: item.id, anchor }),
				ring: item.id,
				marker: isExact && anchor ? exactPointOf(rect, anchor) : null,
			}
		}
	}

	const pressAnchor =
		(from: BoardAnchor) => (event: PointerEvent<HTMLElement>) => {
			const element = canvas.current
			if (event.button !== 0 || !element) return
			event.preventDefault()
			setHover(NO_HOVER)
			const arrow: BoardConnector = {
				id: crypto.randomUUID(),
				kind: "connector",
				from: from.id,
				fromSide: from.side,
				to: "",
				routing,
				zOrder: 0,
				text: "",
			}
			trackArrow(
				event,
				aimEnd(element, arrow, "to", true),
				({ arrow: drawn, hasEnd }) => {
					if (hasEnd) emitArrow(drawn)
				},
				true,
			)
		}

	const pressArrowEnd =
		(connector: BoardConnector) =>
		(end: BoardArrowEndName) =>
		(event: PointerEvent<SVGCircleElement>) => {
			const element = canvas.current
			if (event.button !== 0 || !element) return
			event.preventDefault()
			trackArrow(event, aimEnd(element, connector, end, false), ({ arrow }) =>
				emitArrow(arrow),
			)
		}

	const pressArrowMiddle =
		(connector: BoardConnector, route: BoardRoute) =>
		(event: PointerEvent<SVGCircleElement>) => {
			const element = canvas.current
			const [from] = route.points
			const to = route.points.at(-1)
			if (event.button !== 0 || !element || !from || !to) return
			event.preventDefault()
			trackArrow(
				event,
				(aim) =>
					gestureHolding({
						...connector,
						bend: bendThrough(from, to, boardPointAt(pointerIn(element, aim))),
					}),
				({ arrow }) => emitArrow(arrow),
			)
		}

	const pressLabel =
		(connector: BoardConnector, route: BoardRoute) =>
		(event: PointerEvent<HTMLElement>) => {
			const element = canvas.current
			if (event.button !== 0 || !element) return
			event.preventDefault()
			setSelectedId(connector.id)
			element.focus()
			trackArrow(
				event,
				(aim) => ({
					...gestureHolding({
						...connector,
						labelPosition: fractionNearest(
							route,
							boardPointAt(pointerIn(element, aim)),
						),
					}),
					isLabelSliding: true,
				}),
				({ arrow }) =>
					emitArrow({
						...arrow,
						labelPosition: snappedLabelPosition(route, arrow.labelPosition),
					}),
			)
		}

	const startLabelEditing = (connector: BoardConnector) => {
		setSelectedId(connector.id)
		setLabelEditing({ id: connector.id, text: connector.text })
	}

	const finishLabelEditing = () => {
		if (!labelEditing) return
		const connector = view.objects.find(
			(object): object is BoardConnector =>
				object.kind === "connector" && object.id === labelEditing.id,
		)
		if (
			!isLabelEditCancelled.current &&
			connector &&
			connector.text !== labelEditing.text
		)
			emitArrow({ ...connector, text: labelEditing.text })
		isLabelEditCancelled.current = false
		setLabelEditing(null)
	}

	const answerLabelKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key !== "Enter" && event.key !== "Escape") return
		event.preventDefault()
		isLabelEditCancelled.current = event.key === "Escape"
		canvas.current?.focus()
	}

	const hoverOver = (event: PointerEvent<HTMLDivElement>) => {
		if (isConnecting && !arrowGesture)
			setHover(hoverOf(event.target as Element))
	}

	const pickRouting = (next: BoardRouting) => {
		if (!selectedConnector) {
			setRouting(next)
			return
		}
		emitArrow({ ...selectedConnector, routing: next })
	}

	const reportPointer = (event: PointerEvent<HTMLDivElement>) =>
		onPointerMove?.(boardPointAt(pointerIn(event.currentTarget, event)))

	const leaveCanvas = () => {
		setHover(NO_HOVER)
		onPointerMove?.(null)
	}

	const panWithPointer = (event: PointerEvent<HTMLDivElement>) => {
		let last: PointerPosition = event
		const track = (moved: globalThis.PointerEvent) => {
			pan({ x: last.clientX - moved.clientX, y: last.clientY - moved.clientY })
			last = moved
		}
		const finish = () => {
			window.removeEventListener("pointermove", track)
			window.removeEventListener("pointerup", finish)
			window.removeEventListener("pointercancel", finish)
			setIsPanning(false)
		}
		setIsPanning(true)
		window.addEventListener("pointermove", track)
		window.addEventListener("pointerup", finish)
		window.addEventListener("pointercancel", finish)
	}

	const pressCanvas = (event: PointerEvent<HTMLDivElement>) => {
		if (event.target !== event.currentTarget || editing) return
		if (tool === "hand") {
			panWithPointer(event)
			return
		}
		setSelectedId(null)
	}

	const placeWithTool = (event: MouseEvent<HTMLDivElement>) => {
		if (event.target !== event.currentTarget) return
		const point = boardPointAt(pointerIn(event.currentTarget, event))
		if (tool === "image") {
			chosenImagesPoint.current = point
			imageChooser.current?.click()
			return
		}
		if (!isCreationTool(tool)) return
		const item = createdItemOf(tool, point, zOrderOfCreated(tool, view.objects))
		onIntent({ type: "create", object: item })
		setSelectedId(item.id)
		if (tool === "text") setArrivingTextId(item.id)
		onToolChange("select")
	}

	const placeChosenImages = (event: ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(event.target.files ?? [])
		event.target.value = ""
		const point = chosenImagesPoint.current
		if (files.length === 0 || !point) return
		onDropFiles(files, point)
		onToolChange("select")
	}

	const tabThrough = (event: KeyboardEvent<HTMLDivElement>) => {
		const isOnCanvas = event.target === event.currentTarget
		if (isOnCanvas && event.shiftKey) return
		const order = inReadingOrder(mountedItems)
		const at = isOnCanvas
			? -1
			: order.findIndex(
					(item) => item.id === (event.target as HTMLElement).dataset.objectId,
				)
		const nextAt = event.shiftKey ? at - 1 : at + 1
		if (nextAt < 0) {
			event.preventDefault()
			clearSelection()
			return
		}
		const next = order[nextAt]
		if (!next) return
		event.preventDefault()
		focusObject(next.id)
	}

	const nudge = (event: KeyboardEvent<HTMLDivElement>, item: BoardItem) => {
		const direction = arrowDirectionOf(event.key)
		if (!direction) return false
		const delta = scalePoint(
			direction,
			event.shiftKey ? KEY_STEP_LARGE : KEY_STEP,
		)
		if (event.altKey) {
			const rect = resizedFromCorner(itemBounds(item), "bottom-right", delta)
			emitResize(item.id, rect)
			setAnnouncement(
				t("board.object.resized", { width: rect.width, height: rect.height }),
			)
			return true
		}
		const rect = movedRect(itemBounds(item), delta)
		emitMove(item.id, rect)
		setAnnouncement(t("board.object.moved", { x: rect.x, y: rect.y }))
		return true
	}

	const actOnSelected = (
		event: KeyboardEvent<HTMLDivElement>,
		item: BoardItem,
	) => {
		if (nudge(event, item)) return true
		if (event.key === "Enter" && hasText(item)) {
			startEditing(item)
			return true
		}
		if (event.key === "Delete" || event.key === "Backspace") {
			onIntent({ type: "delete", id: item.id })
			clearSelection()
			return true
		}
		if (event.key === "Escape") {
			clearSelection()
			return true
		}
		return false
	}

	const boardPointAt = (screen: BoardPoint): BoardPoint => ({
		x: Math.round((screen.x - viewport.offset.x) / viewport.zoom),
		y: Math.round((screen.y - viewport.offset.y) / viewport.zoom),
	})

	const paste = (event: ClipboardEvent<HTMLDivElement>) => {
		if (!isBoardTarget(event.target, event.currentTarget)) return
		const pasted = pastedOf(event.clipboardData)
		if (!pasted) return
		event.preventDefault()
		const pastedId = onPaste(pasted, boardPointAt(centreOf(size)))
		if (pastedId) setSelectedId(pastedId)
	}

	const pickLibraryItem = (id: string) =>
		onLibraryItemPick(id, boardPointAt(centreOf(size)))

	const startCommentAt = (pointer: PointerPosition) => {
		const board = canvas.current
		if (!board) return
		onStartComment?.(
			objectIdUnder(pointer) ?? boardPointAt(pointerIn(board, pointer)),
		)
	}

	const dragOver = (event: DragEvent<HTMLDivElement>) => {
		const transfer = event.dataTransfer
		if (!isBoardDrop(transfer)) return
		event.preventDefault()
		transfer.dropEffect = "copy"
		setFileDrag({
			kinds: isFileDrag(transfer) ? fileKindsOf(transfer) : DROPPED_URL,
			at: pointerIn(event.currentTarget, event),
		})
	}

	const markDragFromBoard = (event: DragEvent<HTMLDivElement>) =>
		event.dataTransfer.setData(FROM_THIS_BOARD, "true")

	const leaveWithDrag = (event: DragEvent<HTMLDivElement>) => {
		if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
		setFileDrag(null)
	}

	const drop = (event: DragEvent<HTMLDivElement>) => {
		const transfer = event.dataTransfer
		if (!isBoardDrop(transfer)) return
		event.preventDefault()
		setFileDrag(null)
		const point = boardPointAt(pointerIn(event.currentTarget, event))
		if (isFileDrag(transfer)) {
			onDropFiles(Array.from(transfer.files), point)
			return
		}
		const url = firstUrlOf(transfer.getData(URL_LIST))
		if (url) onDropUrl(url, point)
	}

	const dropLibraryItem = (id: string, pointer: BoardClientPoint) => {
		const board = canvas.current
		const landedOn = document.elementFromPoint(pointer.clientX, pointer.clientY)
		if (
			!board ||
			!landedOn ||
			!board.contains(landedOn) ||
			landedOn.closest('[data-slot="board-dock"]')
		)
			return
		onLibraryItemDrop(id, boardPointAt(pointerIn(board, pointer)))
	}

	const actOnConnector = (
		event: KeyboardEvent<HTMLDivElement>,
		connector: BoardConnector,
	) => {
		if (event.key === "Enter") {
			startLabelEditing(connector)
			return true
		}
		if (event.key === "Delete" || event.key === "Backspace") {
			onIntent({ type: "delete", id: connector.id })
			clearSelection()
			return true
		}
		if (event.key === "Escape") {
			clearSelection()
			return true
		}
		return false
	}

	const pressKey = (event: KeyboardEvent<HTMLDivElement>) => {
		const target = event.target as HTMLElement
		const isOnBoard =
			target === event.currentTarget || target.dataset.slot === "board-object"
		const isInFlyout = Boolean(
			target.closest('[data-slot="board-connector-flyout"]'),
		)
		if (event.metaKey || event.ctrlKey || stopArrowGesture.current) return
		const isLeavingCommentMode = isCommentMode && event.key === "Escape"
		if (isLeavingCommentMode) return
		const focusedObjectId =
			target.dataset.slot === "board-object" ? target.dataset.objectId : null
		if (isCommentMode && event.key === "Enter" && focusedObjectId) {
			event.preventDefault()
			onStartComment?.(focusedObjectId)
			return
		}
		if (selectedConnector && (isOnBoard || isInFlyout)) {
			if (actOnConnector(event, selectedConnector)) event.preventDefault()
			return
		}
		if (!isOnBoard) return
		if (event.key === "Tab") {
			tabThrough(event)
			return
		}
		if (selected) {
			if (actOnSelected(event, selected)) event.preventDefault()
			return
		}
		const direction = arrowDirectionOf(event.key)
		if (!direction) return
		event.preventDefault()
		pan(scalePoint(direction, PAN_STEP))
	}

	const selectedOnScreen = selected
		? toScreenRect(liveBounds(selected), viewport)
		: null
	const movedItem = gesture?.isMove ? itemsById.get(gesture.id) : undefined
	const isMovingShape =
		movedItem?.kind === "shape" && movedItem.id === selected?.id
	const isStill = !gesture && !editing
	const editedItem = editing
		? mountedItems.find((item) => item.id === editing.id)
		: undefined
	const hoveredItem =
		isConnecting && hover.id ? itemsById.get(hover.id) : undefined
	const ringedItem = arrowGesture
		? arrowGesture.ring
			? itemsById.get(arrowGesture.ring)
			: undefined
		: hoveredItem
	const draft = arrowGesture?.isNew ? arrowGesture : null
	const draftRoute = draft ? draftRouteOf(draft.arrow) : null
	const boardTransform = boardTransformOf(viewport)
	const boardLayerTransform = `translate(${viewport.offset.x}px, ${viewport.offset.y}px) scale(${viewport.zoom})`
	const labelledConnectors = shownConnectors.filter(
		({ connector }) =>
			connector.text !== "" && connector.id !== labelEditing?.id,
	)
	const labelEdited = labelEditing
		? shownConnectors.find(({ connector }) => connector.id === labelEditing.id)
		: undefined
	const selectedRoute = selectedConnector
		? routes.get(selectedConnector.id)
		: undefined
	const flyoutAbove = selectedRoute
		? screenBoundsOf(selectedRoute, viewport)
		: null

	return (
		<div
			aria-label={t("board.canvas.label")}
			className={cn(
				CANVAS_SURFACE,
				isPlacing && "cursor-crosshair",
				tool === "hand" && handCursor,
				className,
			)}
			data-slot="board-canvas"
			onClick={placeWithTool}
			onDragEnter={dragOver}
			onDragLeave={leaveWithDrag}
			onDragOver={dragOver}
			onDragStart={markDragFromBoard}
			onDrop={drop}
			onKeyDown={pressKey}
			onPaste={paste}
			onPointerDown={pressCanvas}
			onPointerLeave={leaveCanvas}
			onPointerMove={reportPointer}
			onPointerOver={hoverOver}
			ref={attach}
			role="application"
			// biome-ignore lint/a11y/noNoninteractiveTabindex: the board pans with the arrow keys and hands Tab to its objects, so it takes keyboard focus
			tabIndex={0}
		>
			<BoardDotGrid
				offset={viewport.offset}
				pitch={gridScreenPitch(viewport.zoom)}
			/>
			{shownConnectors.length > 0 ? (
				<svg
					aria-hidden="true"
					className="pointer-events-none absolute inset-0 size-full overflow-visible"
					data-slot="board-connector-hits"
				>
					<g transform={boardTransform}>
						{shownConnectors.map(({ connector, route }) => (
							// biome-ignore lint/a11y/noStaticElementInteractions: a selected arrow opens its label with Enter, the double click is the pointer twin
							<path
								className="pointer-events-auto cursor-pointer"
								d={routePathData(route)}
								data-connector-id={connector.id}
								fill="none"
								key={connector.id}
								onDoubleClick={() => startLabelEditing(connector)}
								onPointerDown={pressConnector(connector)}
								stroke="transparent"
								strokeWidth={CONNECTOR_HIT_STROKE}
								vectorEffect="non-scaling-stroke"
							/>
						))}
					</g>
				</svg>
			) : null}
			{movedItem ? (
				<div
					aria-hidden="true"
					className="pointer-events-none absolute rounded-[4px] border-[1.5px] border-board-move-ghost border-dashed"
					data-slot="board-move-ghost"
					style={placeOf(toScreenRect(itemBounds(movedItem), viewport))}
				/>
			) : null}
			<div
				aria-label={t("board.canvas.objects")}
				className="absolute top-0 left-0 origin-top-left"
				role="listbox"
				style={{
					transform: boardLayerTransform,
				}}
			>
				{mountedItems.map((object) => (
					<div
						aria-label={nameOf(object)}
						aria-selected={object.id === selectedId}
						className={cn(
							"absolute outline-none",
							FIT_TO_FRAME,
							object.id === movedItem?.id &&
								"[filter:var(--board-lifted-filter)]",
							object.id === editing?.id && "[&_[data-board-text]]:invisible",
						)}
						data-object-id={object.id}
						data-slot="board-object"
						key={object.id}
						onDoubleClick={() => startEditing(object)}
						onFocus={() => setSelectedId(object.id)}
						onPointerDown={pressObject(object)}
						ref={
							object.id === arrivingTextId ? openArrivedText(object) : undefined
						}
						role="option"
						style={{
							...placeOf(liveBounds(object)),
							zIndex: object.zOrder,
						}}
						tabIndex={object.id === selectedId ? 0 : -1}
					>
						<OutlinedObject
							outline={outlines.find(({ objectId }) => objectId === object.id)}
						>
							{renderObject(object)}
						</OutlinedObject>
					</div>
				))}
				{shownConnectors.map(({ connector, bounds }) => {
					const outline = outlines.find(
						({ objectId }) => objectId === connector.id,
					)
					return outline ? (
						<div
							aria-hidden="true"
							className="pointer-events-none absolute"
							data-object-id={connector.id}
							data-slot="board-connector-outline"
							key={connector.id}
							style={{ ...placeOf(bounds), zIndex: connector.zOrder }}
						>
							<OutlinedObject outline={outline}>
								<div className="size-full" />
							</OutlinedObject>
						</div>
					) : null
				})}
				{editing && editedItem ? (
					<textarea
						aria-label={t("board.object.editText")}
						className="absolute resize-none overflow-hidden outline-none wrap-break-word select-text"
						data-slot="board-text-editor"
						onBlur={finishEditing}
						onChange={(event) =>
							setEditing({ ...editing, text: event.target.value })
						}
						onKeyDown={(event) => {
							if (event.key !== "Escape") return
							event.preventDefault()
							focusObject(editing.id)
						}}
						ref={placeCaretAtEnd}
						style={{
							...placeOf(editing.field.rect),
							...editing.field.look,
							zIndex: editedItem.zOrder,
						}}
						value={editing.text}
					/>
				) : null}
			</div>
			{shownConnectors.length > 0 || draftRoute ? (
				<svg
					aria-hidden="true"
					className="pointer-events-none absolute inset-0 size-full overflow-visible"
					data-slot="board-connectors"
				>
					<g transform={boardTransform}>
						{shownConnectors.map(({ connector, route, passesUnder }) => {
							const isSelected = connector.id === selectedId
							const held =
								changedArrow?.id === connector.id ? arrowGesture : null
							return (
								<BoardConnectorLine
									hasMiddleTick={held?.isLabelSliding}
									headSize={connector.headSize}
									key={connector.id}
									look={isSelected ? "selected" : "rest"}
									marker={held?.marker}
									onPressEnd={isSelected ? pressArrowEnd(connector) : undefined}
									onPressMiddle={
										isSelected && connector.routing === "straight"
											? pressArrowMiddle(connector, route)
											: undefined
									}
									passesUnder={passesUnder}
									route={route}
									slot="board-connector"
								/>
							)
						})}
						{draft && draftRoute ? (
							<>
								<BoardConnectorLine
									hasHalo={isPointed(draft)}
									look="draft"
									marker={draft.marker}
									route={draftRoute.route}
									slot="board-connector-draft"
								/>
								<circle
									className="fill-board-surface stroke-user-bubble"
									cx={draftRoute.source.x}
									cy={draftRoute.source.y}
									data-slot="board-connector-source"
									r={SOURCE_DOT_RADIUS}
									strokeWidth={CONNECTOR_STROKE}
								/>
							</>
						) : null}
					</g>
				</svg>
			) : null}
			{labelledConnectors.length > 0 ? (
				<div
					aria-hidden="true"
					className="pointer-events-none absolute top-0 left-0 origin-top-left"
					data-slot="board-connector-labels"
					style={{
						transform: boardLayerTransform,
					}}
				>
					{labelledConnectors.map(({ connector, route }) => (
						<BoardConnectorLabel
							isSelected={connector.id === selectedId}
							key={connector.id}
							labelPosition={connector.labelPosition}
							onDoubleClick={() => startLabelEditing(connector)}
							onPointerDown={pressLabel(connector, route)}
							route={route}
							text={connector.text}
						/>
					))}
				</div>
			) : null}
			{labelEditing && labelEdited ? (
				<div
					className="absolute top-0 left-0 origin-top-left"
					data-slot="board-connector-label-editing"
					style={{ transform: boardLayerTransform }}
				>
					<textarea
						aria-label={t("board.connector.editLabel")}
						className={cn(
							LABEL_CHIP,
							"absolute field-sizing-content max-w-60 min-w-8 -translate-x-1/2 -translate-y-1/2 resize-none overflow-hidden ring-[1.5px] outline-none select-text",
						)}
						data-slot="board-connector-label-editor"
						onBlur={finishLabelEditing}
						onChange={(event) =>
							setLabelEditing({ ...labelEditing, text: event.target.value })
						}
						onKeyDown={answerLabelKey}
						ref={placeCaretAtEnd}
						rows={1}
						style={placeOfLabel(labelEdited.route, labelEdited.connector)}
						value={labelEditing.text}
					/>
				</div>
			) : null}
			{ringedItem && ringedItem.id !== draft?.arrow.from ? (
				<BoardAnchorFrame
					activeSide={
						hover.anchor?.id === ringedItem.id ? hover.anchor.side : undefined
					}
					id={ringedItem.id}
					onPressAnchor={arrowGesture ? undefined : pressAnchor}
					rect={toScreenRect(liveBounds(ringedItem), viewport)}
				/>
			) : null}
			{selected && selectedOnScreen ? (
				isMovingShape ? (
					<div
						aria-hidden="true"
						className="pointer-events-none absolute rounded-[6px] ring-[1.5px] ring-user-bubble ring-inset"
						data-slot="board-moving-outline"
						style={{
							left: selectedOnScreen.x - MOVING_OUTSET,
							top: selectedOnScreen.y - MOVING_OUTSET,
							width: selectedOnScreen.width + MOVING_OUTSET * 2,
							height: selectedOnScreen.height + MOVING_OUTSET * 2,
						}}
					/>
				) : (
					<BoardSelectionFrame
						hasHandles={!editing}
						onPressHandle={pressHandle}
						rect={selectedOnScreen}
					/>
				)
			) : null}
			{selected?.kind === "shape" && selectedOnScreen && isStill ? (
				<div
					className="absolute -translate-x-1/2 -translate-y-full"
					data-slot="board-selection-bar-anchor"
					style={{
						left: selectedOnScreen.x + selectedOnScreen.width / 2,
						top: selectedOnScreen.y - FRAME_OUTSET - BAR_GAP,
					}}
				>
					<BoardSelectionBar
						onShapeStyleChange={(style) =>
							onIntent({ type: "style", id: selected.id, style })
						}
						shapeStyle={selected.style ?? DEFAULT_SHAPE_STYLE}
					/>
				</div>
			) : null}
			{isConnecting || selectedConnector ? (
				<div
					className={cn(
						"absolute -translate-x-1/2",
						flyoutAbove ? "-translate-y-full" : "bottom-4 left-1/2",
					)}
					data-slot="board-connector-flyout-anchor"
					style={
						flyoutAbove
							? {
									left: flyoutAbove.x + flyoutAbove.width / 2,
									top: flyoutAbove.y - BAR_GAP,
								}
							: undefined
					}
				>
					<BoardConnectorFlyout
						onRoutingChange={pickRouting}
						routing={selectedConnector?.routing ?? routing}
					/>
				</div>
			) : null}
			{pointers.length > 0 ? (
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-0"
					data-slot="board-pointers"
				>
					{pointers.map(({ owner, position }) => (
						<BoardPointer
							key={owner.id}
							owner={owner}
							position={{
								x: Math.round(viewport.offset.x + position.x * viewport.zoom),
								y: Math.round(viewport.offset.y + position.y * viewport.zoom),
							}}
						/>
					))}
				</div>
			) : null}
			<BoardCommentLayer
				boundsOf={liveBounds}
				draft={commentDraft}
				isCommentMode={isCommentMode}
				items={itemsById}
				nodeIdUnder={objectIdUnder}
				objectNodeOf={objectNodeOf}
				onLeaveCommentMode={onLeaveCommentMode}
				onOpenThread={onOpenCommentThread}
				onStartCommentAt={startCommentAt}
				openThread={openCommentThread}
				threads={commentThreads}
				viewport={viewport}
			/>
			{view.objects.length === 0 ? <BoardEmptyHint /> : null}
			{fileDrag ? <BoardFileDropState {...fileDrag} /> : null}
			<input
				accept="image/*"
				className="hidden"
				data-slot="board-image-chooser"
				multiple
				onChange={placeChosenImages}
				ref={imageChooser}
				tabIndex={-1}
				type="file"
			/>
			<BoardDock
				libraryItems={libraryItems}
				onLibraryItemDrop={dropLibraryItem}
				onLibraryItemPick={pickLibraryItem}
				onToolChange={onToolChange}
				tool={tool}
			/>
			<BoardZoomControl
				onZoomIn={() => zoomTo(zoomStepIn)}
				onZoomOut={() => zoomTo(zoomStepOut)}
				zoom={viewport.zoom}
			/>
			<span
				aria-live="polite"
				className="sr-only"
				data-slot="board-announcement"
			>
				{announcement}
			</span>
		</div>
	)
}

const BoardCanvas = ({ status = "ready", ...props }: BoardCanvasProps) =>
	status === "loading" ? (
		<BoardCanvasSkeleton
			className={props.className}
			viewport={props.viewport ?? UNPLACED_VIEWPORT}
		/>
	) : (
		<ReadyBoardCanvas {...props} />
	)

export type { BoardCanvasProps, BoardStatus }
export { BoardCanvas, BoardDotGrid }
