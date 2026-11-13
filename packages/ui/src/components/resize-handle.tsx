"use client"

import {
	type KeyboardEvent as ReactKeyboardEvent,
	type MouseEvent as ReactMouseEvent,
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useMemo,
	useState,
} from "react"

import { cn } from "@workspace/ui/lib/utils"

const RESIZE_STEP = 16

const HANDLE =
	"absolute inset-y-0 z-30 hidden w-2 cursor-col-resize touch-none outline-none md:block"

const HANDLE_EDGE = "data-[side=left]:-end-1.5 data-[side=right]:-start-1.5"

const HANDLE_GRIP =
	"after:absolute after:top-1/2 after:left-1/2 after:h-10 after:w-1 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:bg-transparent"

const HANDLE_LIT =
	"hover:after:bg-sidebar-border focus-visible:after:bg-sidebar-ring"

type WidthBounds = {
	minWidth: number
	maxWidth: number
}

type ResizableWidth = WidthBounds & {
	width: number
	defaultWidth: number
	isResizing: boolean
	resizeTo: (width: number) => void
	commitWidth: (width: number) => void
}

type ResizableWidthOptions = WidthBounds & {
	width?: number
	defaultWidth: number
	onWidthChange?: (width: number) => void
}

const useResizableWidth = ({
	width,
	defaultWidth,
	onWidthChange,
	minWidth,
	maxWidth,
}: ResizableWidthOptions): ResizableWidth => {
	const clamp = useCallback(
		(next: number) => Math.min(Math.max(Math.round(next), minWidth), maxWidth),
		[maxWidth, minWidth],
	)
	const boundedDefaultWidth = clamp(defaultWidth)
	const [ownWidth, setOwnWidth] = useState(boundedDefaultWidth)
	const [draftWidth, setDraftWidth] = useState<number | null>(null)

	const resizeTo = useCallback(
		(next: number) => setDraftWidth(clamp(next)),
		[clamp],
	)

	const commitWidth = useCallback(
		(next: number) => {
			const bounded = clamp(next)
			setDraftWidth(null)
			if (width === undefined) setOwnWidth(bounded)
			onWidthChange?.(bounded)
		},
		[clamp, onWidthChange, width],
	)

	return useMemo(
		() => ({
			width: draftWidth ?? clamp(width ?? ownWidth),
			defaultWidth: boundedDefaultWidth,
			minWidth,
			maxWidth,
			isResizing: draftWidth !== null,
			resizeTo,
			commitWidth,
		}),
		[
			boundedDefaultWidth,
			clamp,
			commitWidth,
			draftWidth,
			maxWidth,
			minWidth,
			ownWidth,
			resizeTo,
			width,
		],
	)
}

const focusWithoutStartingASelection = (
	event: ReactMouseEvent<HTMLDivElement>,
) => {
	event.preventDefault()
	event.currentTarget.focus({ preventScroll: true })
}

type ResizeHandleProps = {
	side: "left" | "right"
	label: string
	resize: ResizableWidth
	slot: string
}

const ResizeHandle = ({ side, label, resize, slot }: ResizeHandleProps) => {
	const towardsWider = side === "left" ? 1 : -1

	const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (event.button !== 0) return
		const originX = event.clientX
		const originWidth = resize.width
		const widthAt = (clientX: number) =>
			originWidth + towardsWider * (clientX - originX)

		let followedWidth: number | null = null
		const stream = new AbortController()
		const { signal } = stream

		const endAt = (width: number | null) => {
			stream.abort()
			if (width !== null) resize.commitWidth(width)
		}

		window.addEventListener(
			"pointermove",
			(move: PointerEvent) => {
				followedWidth = widthAt(move.clientX)
				resize.resizeTo(followedWidth)
			},
			{ signal },
		)
		window.addEventListener(
			"pointerup",
			(up: PointerEvent) =>
				endAt(followedWidth === null ? null : widthAt(up.clientX)),
			{ signal },
		)
		window.addEventListener("pointercancel", () => endAt(followedWidth), {
			signal,
		})
	}

	const stepWidth = (event: ReactKeyboardEvent<HTMLDivElement>) => {
		if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
		event.preventDefault()
		const step = event.key === "ArrowRight" ? towardsWider : -towardsWider
		resize.commitWidth(resize.width + step * RESIZE_STEP)
	}

	return (
		<div
			aria-label={label}
			aria-orientation="vertical"
			aria-valuemax={resize.maxWidth}
			aria-valuemin={resize.minWidth}
			aria-valuenow={resize.width}
			className={cn(HANDLE, HANDLE_EDGE, HANDLE_GRIP, HANDLE_LIT)}
			data-side={side}
			data-slot={slot}
			data-tauri-drag-region="false"
			onDoubleClick={() => resize.commitWidth(resize.defaultWidth)}
			onKeyDown={stepWidth}
			onMouseDown={focusWithoutStartingASelection}
			onPointerDown={startResize}
			role="separator"
			tabIndex={0}
		/>
	)
}

export { RESIZE_STEP, type ResizableWidth, ResizeHandle, useResizableWidth }
