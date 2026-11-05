"use client"

import {
	type ComponentType,
	type ReactNode,
	useCallback,
	useId,
	useLayoutEffect,
	useRef,
	useState,
} from "react"
import { useTranslation } from "react-i18next"

import type {
	BoardObject,
	BoardPoint,
	BoardSize,
	BoardView,
	BoardViewport,
} from "@workspace/ui/components/board-view"
import {
	cullBoardObjects,
	gridScreenPitch,
	isAtZoomMax,
	isAtZoomMin,
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
	renderObject: (object: BoardObject) => ReactNode
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
		},
		[],
	)

	const attach = useCallback(
		(element: HTMLDivElement | null) => {
			if (!element) return
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

	return { attach, size, zoomTo }
}

type BoardDotGridProps = {
	viewport: BoardViewport
}

const BoardDotGrid = ({ viewport }: BoardDotGridProps) => {
	const patternId = useId()
	const pitch = gridScreenPitch(viewport.zoom)

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
				x={viewport.offset.x}
				y={viewport.offset.y}
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
				<div aria-hidden="true" className="relative h-15 w-18">
					<div className="absolute top-0 right-0 size-13 rotate-8 rounded-[3px] bg-board-sticky-green" />
					<div className="absolute bottom-0 left-0 size-13 -rotate-5 rounded-[3px] bg-board-sticky-yellow" />
				</div>
				<h2 className="text-[17px] text-foreground leading-6">
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
		className="rounded-[7px] text-board-control-foreground hover:bg-muted hover:text-board-control-foreground active:bg-input data-disabled:pointer-events-none data-disabled:text-disabled-foreground dark:hover:bg-muted"
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
	onZoomOut: () => void
	onZoomIn: () => void
}

const BoardZoomControl = ({
	zoom,
	onZoomOut,
	onZoomIn,
}: BoardZoomControlProps) => {
	const { t } = useTranslation("common")

	return (
		<div
			aria-label={t("board.zoom.controls")}
			className="absolute end-5 bottom-5 flex items-center gap-0.5 rounded-lg bg-board-control p-1 text-board-control-foreground shadow-board-control"
			data-slot="board-zoom-control"
			role="group"
		>
			<BoardZoomButton
				icon={Icons.ZoomOut}
				isDisabled={isAtZoomMin(zoom)}
				label={t("board.zoom.zoomOut")}
				onClick={onZoomOut}
			/>
			<output className="min-w-11 px-1.5 text-center font-medium text-xs tabular-nums">
				{t("board.zoom.level", { percent: Math.round(zoom * 100) })}
			</output>
			<BoardZoomButton
				icon={Icons.ZoomIn}
				isDisabled={isAtZoomMax(zoom)}
				label={t("board.zoom.zoomIn")}
				onClick={onZoomIn}
			/>
		</div>
	)
}

const BoardCanvas = ({
	view,
	viewport,
	onViewportChange,
	renderObject,
	className,
}: BoardCanvasProps) => {
	const { attach, size, zoomTo } = useBoardGestures(viewport, onViewportChange)
	const mounted = cullBoardObjects(view.objects, viewport, size)

	return (
		<div
			className={cn(
				"relative isolate size-full overflow-hidden border-shell-border border-t bg-board-surface",
				className,
			)}
			data-slot="board-canvas"
			ref={attach}
		>
			<BoardDotGrid viewport={viewport} />
			<div
				className="absolute top-0 left-0 origin-top-left"
				style={{
					transform: `translate(${viewport.offset.x}px, ${viewport.offset.y}px) scale(${viewport.zoom})`,
				}}
			>
				{mounted.map(({ object, bounds }) => (
					<div
						className="absolute"
						data-object-id={object.id}
						data-slot="board-object"
						key={object.id}
						style={{
							left: bounds.x,
							top: bounds.y,
							width: bounds.width,
							height: bounds.height,
							zIndex: object.zOrder,
						}}
					>
						{renderObject(object)}
					</div>
				))}
			</div>
			{view.objects.length === 0 ? <BoardEmptyHint /> : null}
			<BoardZoomControl
				onZoomIn={() => zoomTo(zoomStepIn)}
				onZoomOut={() => zoomTo(zoomStepOut)}
				zoom={viewport.zoom}
			/>
		</div>
	)
}

export type { BoardCanvasProps }
export { BoardCanvas }
