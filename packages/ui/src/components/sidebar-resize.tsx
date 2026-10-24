"use client"

import {
	createContext,
	type KeyboardEvent as ReactKeyboardEvent,
	type ReactNode,
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react"
import { useTranslation } from "react-i18next"

import { useSidebar } from "@workspace/ui/components/ui/sidebar"
import { cn } from "@workspace/ui/lib/utils"

const SIDEBAR_DEFAULT_WIDTH = 304
const SIDEBAR_MIN_WIDTH = 224
const SIDEBAR_MAX_WIDTH = 416
const SIDEBAR_WIDTH_STEP = 16

const clampSidebarWidth = (width: number) =>
	Math.min(Math.max(Math.round(width), SIDEBAR_MIN_WIDTH), SIDEBAR_MAX_WIDTH)

const HANDLE =
	"absolute inset-y-0 z-30 hidden w-2 cursor-col-resize touch-none outline-none md:block"

const HANDLE_EDGE = "data-[side=left]:-end-1.5 data-[side=right]:-start-1.5"

const HANDLE_GRIP =
	"after:absolute after:top-1/2 after:left-1/2 after:h-10 after:w-1 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:bg-transparent after:transition-colors motion-reduce:after:transition-none"

const HANDLE_LIT =
	"hover:after:bg-sidebar-border focus-visible:after:bg-sidebar-ring"

type SidebarResize = {
	width: number
	defaultWidth: number
	isResizable: boolean
	isResizing: boolean
	resizeTo: (width: number) => void
	commitWidth: (width: number) => void
}

const SidebarResizeContext = createContext<SidebarResize | null>(null)

interface SidebarResizeProviderProps {
	width?: number
	defaultWidth?: number
	onWidthChange?: (width: number) => void
	isResizable?: boolean
	children: (resize: SidebarResize) => ReactNode
}

const SidebarResizeProvider = ({
	width,
	defaultWidth = SIDEBAR_DEFAULT_WIDTH,
	onWidthChange,
	isResizable = true,
	children,
}: SidebarResizeProviderProps) => {
	const boundedDefaultWidth = clampSidebarWidth(defaultWidth)
	const [ownWidth, setOwnWidth] = useState(boundedDefaultWidth)
	const [draftWidth, setDraftWidth] = useState<number | null>(null)

	const resizeTo = useCallback((next: number) => {
		setDraftWidth(clampSidebarWidth(next))
	}, [])

	const commitWidth = useCallback(
		(next: number) => {
			const bounded = clampSidebarWidth(next)
			setDraftWidth(null)
			if (width === undefined) setOwnWidth(bounded)
			onWidthChange?.(bounded)
		},
		[onWidthChange, width],
	)

	const resize = useMemo<SidebarResize>(
		() => ({
			width: draftWidth ?? clampSidebarWidth(width ?? ownWidth),
			defaultWidth: boundedDefaultWidth,
			isResizable,
			isResizing: draftWidth !== null,
			resizeTo,
			commitWidth,
		}),
		[
			boundedDefaultWidth,
			commitWidth,
			draftWidth,
			isResizable,
			ownWidth,
			resizeTo,
			width,
		],
	)

	return (
		<SidebarResizeContext.Provider value={resize}>
			{children(resize)}
		</SidebarResizeContext.Provider>
	)
}

interface SidebarResizeHandleProps {
	side: "left" | "right"
}

const SidebarResizeHandle = ({ side }: SidebarResizeHandleProps) => {
	const { t } = useTranslation("common")
	const { isMobile, state } = useSidebar()
	const resize = useContext(SidebarResizeContext)
	const towardsWider = side === "left" ? 1 : -1

	if (!resize?.isResizable) return null
	if (isMobile || state === "collapsed") return null

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
		resize.commitWidth(resize.width + step * SIDEBAR_WIDTH_STEP)
	}

	return (
		<div
			aria-label={t("sidebar.resize")}
			aria-orientation="vertical"
			aria-valuemax={SIDEBAR_MAX_WIDTH}
			aria-valuemin={SIDEBAR_MIN_WIDTH}
			aria-valuenow={resize.width}
			className={cn(HANDLE, HANDLE_EDGE, HANDLE_GRIP, HANDLE_LIT)}
			data-side={side}
			data-slot="sidebar-resize-handle"
			data-tauri-drag-region="false"
			onDoubleClick={() => resize.commitWidth(resize.defaultWidth)}
			onKeyDown={stepWidth}
			onPointerDown={startResize}
			role="separator"
			tabIndex={0}
		/>
	)
}

export {
	SIDEBAR_DEFAULT_WIDTH,
	SIDEBAR_MAX_WIDTH,
	SIDEBAR_MIN_WIDTH,
	SIDEBAR_WIDTH_STEP,
	SidebarResizeHandle,
	SidebarResizeProvider,
}
