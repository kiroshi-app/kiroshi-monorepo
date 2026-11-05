"use client"

import {
	type ComponentType,
	type KeyboardEvent,
	type PointerEvent,
	type ReactNode,
	useCallback,
	useId,
	useLayoutEffect,
	useRef,
	useState,
} from "react"
import { useTranslation } from "react-i18next"

import {
	BoardObjectOutline,
	type BoardObjectOutlineSpec,
	BoardPointer,
	type BoardPointerPlacement,
} from "@workspace/ui/components/board/board-presence"
import { BoardSelectionBar } from "@workspace/ui/components/board/board-selection-bar"
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
	BoardIntent,
	BoardItem,
	BoardItemKind,
	BoardObject,
	BoardPoint,
	BoardRect,
	BoardShapeStyle,
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
	panBy,
	pinchZoom,
	zoomAround,
	zoomStepIn,
	zoomStepOut,
} from "@workspace/ui/components/board-viewport"
import { Icons } from "@workspace/ui/components/icons"
import { Button } from "@workspace/ui/components/ui/button"
import { cn } from "@workspace/ui/lib/utils"

type BoardCanvasProps = {
	view: BoardView
	viewport: BoardViewport
	onViewportChange: (viewport: BoardViewport) => void
	onIntent: (intent: BoardIntent) => void
	renderObject: (object: BoardObject) => ReactNode
	pointers?: readonly BoardPointerPlacement[]
	outlines?: readonly BoardObjectOutlineSpec[]
	className?: string
}

type PointerPosition = {
	clientX: number
	clientY: number
}

type SafariGestureEvent = Event & PointerPosition & { scale: number }

const NO_SIZE: BoardSize = { width: 0, height: 0 }

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
			className="absolute end-5 bottom-5 flex items-center gap-0.5 rounded-lg bg-board-control p-1 text-board-control-foreground shadow-board-control"
			data-slot="board-zoom-control"
			role="application"
		>
			<BoardZoomButton
				icon={Icons.ZoomOut}
				isDisabled={isAtZoomMin(zoom)}
				label={t("board.zoom.zoomOut")}
				onClick={() => announce(onZoomOut())}
			/>
			<span
				className="min-w-11 px-1.5 text-center font-medium text-xs tabular-nums"
				data-slot="board-zoom-level"
			>
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
	"top-left": "-top-[7px] -left-[7px] cursor-nwse-resize",
	"top-right": "-top-[7px] -right-[7px] cursor-nesw-resize",
	"bottom-left": "-bottom-[7px] -left-[7px] cursor-nesw-resize",
	"bottom-right": "-right-[7px] -bottom-[7px] cursor-nwse-resize",
}

type BoardGesture = {
	id: string
	rect: BoardRect
}

type BoardEditing = {
	id: string
	text: string
}

type BoardReshape = (rect: BoardRect, delta: BoardPoint) => BoardRect

const placeOf = (rect: BoardRect) => ({
	left: rect.x,
	top: rect.y,
	width: rect.width,
	height: rect.height,
})

const hasText = (item: BoardItem) => TEXT_KINDS.has(item.kind)

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

const BoardCanvas = ({
	view,
	viewport,
	onViewportChange,
	onIntent,
	renderObject,
	pointers = [],
	outlines = [],
	className,
}: BoardCanvasProps) => {
	const { t } = useTranslation("common")
	const { attach, canvas, pan, size, zoomTo } = useBoardGestures(
		viewport,
		onViewportChange,
	)
	const [selectedId, setSelectedId] = useState<string | null>(null)
	const [editing, setEditing] = useState<BoardEditing | null>(null)
	const [gesture, setGesture] = useState<BoardGesture | null>(null)
	const [announcement, setAnnouncement] = useState("")

	const mounted = cullBoardObjects(view.objects, viewport, size)
	const mountedItems = mounted.flatMap(({ object }) =>
		isItem(object) ? [object] : [],
	)
	const selected = view.objects
		.filter(isItem)
		.find((item) => item.id === selectedId)
	const liveBounds = (item: BoardItem) =>
		gesture?.id === item.id ? gesture.rect : itemBounds(item)

	const nameOf = (item: BoardItem) => {
		const kind = t(`board.object.kind.${item.kind}`)
		return item.text ? t("board.object.named", { kind, text: item.text }) : kind
	}

	const focusObject = (id: string) =>
		canvas.current
			?.querySelector<HTMLElement>(
				`[data-slot="board-object"][data-object-id="${CSS.escape(id)}"]`,
			)
			?.focus()

	const clearSelection = () => {
		setSelectedId(null)
		canvas.current?.focus()
	}

	const startEditing = (item: BoardItem) => {
		if (!hasText(item)) return
		setSelectedId(item.id)
		setEditing({ id: item.id, text: item.text })
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

	const pressKey = (event: KeyboardEvent<HTMLDivElement>) => {
		const target = event.target as HTMLElement
		const isOnBoard =
			target === event.currentTarget || target.dataset.slot === "board-object"
		if (!isOnBoard || event.metaKey || event.ctrlKey) return
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

	return (
		<div
			aria-label={t("board.canvas.label")}
			className={cn(
				"relative isolate size-full overflow-hidden border-shell-border border-t bg-board-surface select-none -outline-offset-2",
				className,
			)}
			data-slot="board-canvas"
			onKeyDown={pressKey}
			onPointerDown={pressCanvas}
			ref={attach}
			role="application"
			// biome-ignore lint/a11y/noNoninteractiveTabindex: the board pans with the arrow keys and hands Tab to its objects, so it takes keyboard focus
			tabIndex={0}
		>
			<BoardDotGrid
				offset={viewport.offset}
				pitch={gridScreenPitch(viewport.zoom)}
			/>
			<div
				aria-label={t("board.canvas.objects")}
				className="absolute top-0 left-0 origin-top-left"
				role="listbox"
				style={{
					transform: `translate(${viewport.offset.x}px, ${viewport.offset.y}px) scale(${viewport.zoom})`,
				}}
			>
				{mounted.map(({ object, bounds }) =>
					isItem(object) ? (
						<div
							aria-label={nameOf(object)}
							aria-selected={object.id === selectedId}
							className="absolute outline-none"
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
								outline={outlines.find(
									({ objectId }) => objectId === object.id,
								)}
							>
								{renderObject(object)}
							</OutlinedObject>
						</div>
					) : (
						<div
							className="absolute"
							data-object-id={object.id}
							data-slot="board-object"
							key={object.id}
							style={{ ...placeOf(bounds), zIndex: object.zOrder }}
						>
							<OutlinedObject
								outline={outlines.find(
									({ objectId }) => objectId === object.id,
								)}
							>
								{renderObject(object)}
							</OutlinedObject>
						</div>
					),
				)}
				{editing && editedItem ? (
					<textarea
						aria-label={t("board.object.editText")}
						className="absolute resize-none rounded-[3px] bg-board-shape-surface p-3 text-board-foreground text-sm leading-4.5 outline-none wrap-break-word select-text"
						data-slot="board-text-editor"
						onBlur={finishEditing}
						onChange={(event) =>
							setEditing({ id: editing.id, text: event.target.value })
						}
						onKeyDown={(event) => {
							if (event.key !== "Escape") return
							event.preventDefault()
							focusObject(editing.id)
						}}
						ref={placeCaretAtEnd}
						style={{
							...placeOf(itemBounds(editedItem)),
							zIndex: editedItem.zOrder,
						}}
						value={editing.text}
					/>
				) : null}
			</div>
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

export type { BoardCanvasProps }
export { BoardCanvas, BoardDotGrid }
