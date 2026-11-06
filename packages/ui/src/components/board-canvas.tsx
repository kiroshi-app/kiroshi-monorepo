"use client"

import {
	type ClipboardEvent,
	type ComponentType,
	type CSSProperties,
	type DragEvent,
	type KeyboardEvent,
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
	anchorOf,
	arrowheadPathData,
	BOARD_SIDES,
	type BoardRoute,
	looseEnd,
	routeConnector,
	routePathData,
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

const OPENING_MARGIN = "p-16"

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

const openingMarginOf = (element: HTMLElement) =>
	Number.parseFloat(getComputedStyle(element).paddingTop) || 0

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
const BAR_GAP = 16
const TEXT_KINDS: ReadonlySet<BoardItemKind> = new Set([
	"sticky",
	"text",
	"shape",
])
const DEFAULT_SHAPE_STYLE: BoardShapeStyle = {
	shape: "rounded-rectangle",
	fill: "surface",
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

type BoardDraft = {
	from: BoardAnchor
	pointer: BoardPoint
	target: BoardAnchor | null
}

type ShownConnector = {
	connector: BoardConnector
	bounds: BoardRect
	route: BoardRoute
}

const NO_HOVER: BoardHover = { id: null, anchor: null }
const CONNECTOR_STROKE = 2
const CONNECTOR_HIT_STROKE = 24
const SOURCE_DOT_RADIUS = 4
const ANCHOR_PLACE: Record<BoardSide, string> = {
	top: "top-0 left-1/2",
	right: "top-1/2 left-full",
	bottom: "top-full left-1/2",
	left: "top-1/2 left-0",
}

const toScreenPoint = (point: BoardPoint, viewport: BoardViewport) => ({
	x: viewport.offset.x + point.x * viewport.zoom,
	y: viewport.offset.y + point.y * viewport.zoom,
})

const toBoardPoint = (point: BoardPoint, viewport: BoardViewport) => ({
	x: (point.x - viewport.offset.x) / viewport.zoom,
	y: (point.y - viewport.offset.y) / viewport.zoom,
})

const onScreen = (route: BoardRoute, viewport: BoardViewport): BoardRoute => ({
	points: route.points.map((point) => toScreenPoint(point, viewport)),
	arrow: route.arrow,
})

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
type BoardConnectorLineProps = {
	route: BoardRoute
	isAccent: boolean
	slot: "board-connector" | "board-connector-draft"
}

const BoardConnectorLine = ({
	route,
	isAccent,
	slot,
}: BoardConnectorLineProps) => {
	const tip = route.points.at(-1)
	return (
		<g
			className={isAccent ? "stroke-user-bubble" : "stroke-board-shape-border"}
			data-slot={slot}
			fill="none"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth={CONNECTOR_STROKE}
		>
			<path d={routePathData(route.points)} data-slot="board-connector-path" />
			{tip ? (
				<path
					d={arrowheadPathData(tip, route.arrow)}
					data-slot="board-connector-arrowhead"
				/>
			) : null}
		</g>
	)
}

type BoardAnchorFrameProps = {
	id: string
	rect: BoardRect
	activeSide?: BoardSide
	onPressAnchor: (
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
		data-slot="board-anchor-frame"
		style={placeOf(rect)}
	>
		<div
			className="absolute -inset-1 rounded-[14px] border-2 border-user-bubble/50"
			data-slot="board-hover-outline"
		/>
		{BOARD_SIDES.map((side) => (
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
				onPointerDown={onPressAnchor({ id, side })}
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
	isConnecting = false,
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
	const [routing, setRouting] = useState<BoardRouting>("straight")
	const [hover, setHover] = useState(NO_HOVER)
	const [draft, setDraft] = useState<BoardDraft | null>(null)
	const stopDrafting = useRef<(() => void) | null>(null)

	useEffect(() => () => stopDrafting.current?.(), [])

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

	const mounted = cullBoardObjects(view.objects, viewport, size)
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

	const routeOf = (connector: BoardConnector) => {
		const from = itemsById.get(connector.from)
		const to = itemsById.get(connector.to)
		if (!from || !to) return null
		return routeConnector(
			{ rect: liveBounds(from), side: connector.fromSide },
			{ rect: liveBounds(to), side: connector.toSide },
			connector.routing,
		)
	}

	const shownConnectors = mounted.flatMap(
		({ object, bounds }): ShownConnector[] => {
			if (object.kind !== "connector") return []
			const route = routeOf(object)
			return route
				? [{ connector: object, bounds, route: onScreen(route, viewport) }]
				: []
		},
	)

	const draftRouteOf = ({ from, pointer, target }: BoardDraft) => {
		const source = itemsById.get(from.id)
		if (!source) return null
		const sourceEnd = { rect: liveBounds(source), side: from.side }
		const targetItem = target ? itemsById.get(target.id) : undefined
		const targetEnd =
			target && targetItem
				? { rect: liveBounds(targetItem), side: target.side }
				: looseEnd(pointer, anchorOf(sourceEnd))
		return onScreen(routeConnector(sourceEnd, targetEnd, routing), viewport)
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
			setGesture({ id: item.id, rect: latest })
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

	const pressConnector =
		(connector: BoardConnector) => (event: PointerEvent<SVGPathElement>) => {
			if (event.button !== 0) return
			setSelectedId(connector.id)
			canvas.current?.focus()
		}

	const pressAnchor =
		(from: BoardAnchor) => (event: PointerEvent<HTMLElement>) => {
			const element = canvas.current
			if (event.button !== 0 || !element) return
			event.preventDefault()
			const boardAt = (at: PointerPosition) =>
				toBoardPoint(pointerIn(element, at), viewport)
			const track = (moved: PointerPosition) => {
				const under = hoverOf(
					document.elementFromPoint(moved.clientX, moved.clientY),
				)
				const target = under.anchor?.id === from.id ? null : under.anchor
				setHover(under.id === from.id ? NO_HOVER : under)
				setDraft({ from, pointer: boardAt(moved), target })
				return target
			}
			const stop = () => {
				window.removeEventListener("pointermove", track)
				window.removeEventListener("pointerup", finish)
				window.removeEventListener("pointercancel", finish)
				window.removeEventListener("keydown", cancelOnEscape)
				stopDrafting.current = null
			}
			const cancelOnEscape = (key: globalThis.KeyboardEvent) => {
				if (key.key !== "Escape") return
				key.preventDefault()
				stop()
				setDraft(null)
			}
			const finish = (end: globalThis.PointerEvent) => {
				stop()
				const target = end.type === "pointerup" ? track(end) : null
				setDraft(null)
				if (target)
					onIntent({
						type: "connect",
						id: crypto.randomUUID(),
						from: from.id,
						fromSide: from.side,
						to: target.id,
						toSide: target.side,
						routing,
					})
			}
			setDraft({ from, pointer: boardAt(event), target: null })
			window.addEventListener("pointermove", track)
			window.addEventListener("pointerup", finish)
			window.addEventListener("pointercancel", finish)
			window.addEventListener("keydown", cancelOnEscape)
			stopDrafting.current = stop
		}

	const hoverOver = (event: PointerEvent<HTMLDivElement>) => {
		if (isConnecting && !draft) setHover(hoverOf(event.target as Element))
	}

	const pickRouting = (next: BoardRouting) => {
		if (!selectedConnector) {
			setRouting(next)
			return
		}
		onIntent({
			type: "style",
			id: selectedConnector.id,
			style: { routing: next },
		})
	}

	const reportPointer = (event: PointerEvent<HTMLDivElement>) =>
		onPointerMove?.(boardPointAt(pointerIn(event.currentTarget, event)))

	const leaveCanvas = () => {
		setHover(NO_HOVER)
		onPointerMove?.(null)
	}

	const pressCanvas = (event: PointerEvent<HTMLDivElement>) => {
		if (event.target !== event.currentTarget || editing) return
		setSelectedId(null)
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
		if (event.metaKey || event.ctrlKey) return
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
	const isStill = !gesture && !editing
	const editedItem = editing
		? mountedItems.find((item) => item.id === editing.id)
		: undefined
	const hoveredItem =
		isConnecting && hover.id ? itemsById.get(hover.id) : undefined
	const draftRoute = draft ? draftRouteOf(draft) : null

	return (
		<div
			aria-label={t("board.canvas.label")}
			className={cn(CANVAS_SURFACE, OPENING_MARGIN, className)}
			data-slot="board-canvas"
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
					{shownConnectors.map(({ connector, route }) => (
						<path
							className="pointer-events-auto cursor-pointer"
							d={routePathData(route.points)}
							data-connector-id={connector.id}
							fill="none"
							key={connector.id}
							onPointerDown={pressConnector(connector)}
							stroke="transparent"
							strokeWidth={CONNECTOR_HIT_STROKE}
						/>
					))}
				</svg>
			) : null}
			<div
				aria-label={t("board.canvas.objects")}
				className="absolute top-0 left-0 origin-top-left"
				role="listbox"
				style={{
					transform: `translate(${viewport.offset.x}px, ${viewport.offset.y}px) scale(${viewport.zoom})`,
				}}
			>
				{mountedItems.map((object) => (
					<div
						aria-label={nameOf(object)}
						aria-selected={object.id === selectedId}
						className={cn(
							"absolute outline-none",
							object.id === editing?.id && "[&_[data-board-text]]:invisible",
						)}
						data-object-id={object.id}
						data-slot="board-object"
						key={object.id}
						onDoubleClick={() => startEditing(object)}
						onFocus={() => setSelectedId(object.id)}
						onPointerDown={pressObject(object)}
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
					{shownConnectors.map(({ connector, route }) => (
						<BoardConnectorLine
							isAccent={connector.id === selectedId}
							key={connector.id}
							route={route}
							slot="board-connector"
						/>
					))}
					{draftRoute ? (
						<>
							<BoardConnectorLine
								isAccent
								route={draftRoute}
								slot="board-connector-draft"
							/>
							<circle
								className="fill-board-surface stroke-user-bubble"
								cx={draftRoute.points[0].x}
								cy={draftRoute.points[0].y}
								data-slot="board-connector-source"
								r={SOURCE_DOT_RADIUS}
								strokeWidth={CONNECTOR_STROKE}
							/>
						</>
					) : null}
				</svg>
			) : null}
			{hoveredItem && hoveredItem.id !== draft?.from.id ? (
				<BoardAnchorFrame
					activeSide={
						hover.anchor?.id === hoveredItem.id ? hover.anchor.side : undefined
					}
					id={hoveredItem.id}
					onPressAnchor={pressAnchor}
					rect={toScreenRect(liveBounds(hoveredItem), viewport)}
				/>
			) : null}
			{selected && selectedOnScreen ? (
				<BoardSelectionFrame
					hasHandles={!editing}
					onPressHandle={pressHandle}
					rect={selectedOnScreen}
				/>
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
					className="absolute bottom-4 left-1/2 -translate-x-1/2"
					data-slot="board-connector-flyout-anchor"
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
			{view.objects.length === 0 ? <BoardEmptyHint /> : null}
			{fileDrag ? <BoardFileDropState {...fileDrag} /> : null}
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
