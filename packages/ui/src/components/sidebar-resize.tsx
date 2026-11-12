"use client"

import { createContext, type ReactNode, useContext, useMemo } from "react"
import { useTranslation } from "react-i18next"

import {
	RESIZE_STEP,
	type ResizableWidth,
	ResizeHandle,
	useResizableWidth,
} from "@workspace/ui/components/resize-handle"
import { useSidebar } from "@workspace/ui/components/ui/sidebar"

const SIDEBAR_DEFAULT_WIDTH = 288
const SIDEBAR_MIN_WIDTH = 224
const SIDEBAR_MAX_WIDTH = 416
const SIDEBAR_WIDTH_STEP = RESIZE_STEP
const SIDEBAR_FOLD_MOTION =
	"transition-[width] duration-180 ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:duration-[0.01ms] in-data-[resizing=true]:transition-none"

type SidebarResize = ResizableWidth & {
	isResizable: boolean
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
	const resizableWidth = useResizableWidth({
		width,
		defaultWidth,
		onWidthChange,
		minWidth: SIDEBAR_MIN_WIDTH,
		maxWidth: SIDEBAR_MAX_WIDTH,
	})
	const resize = useMemo<SidebarResize>(
		() => ({ ...resizableWidth, isResizable }),
		[isResizable, resizableWidth],
	)

	return (
		<SidebarResizeContext.Provider value={resize}>
			{children(resize)}
		</SidebarResizeContext.Provider>
	)
}

const useIsSidebarResizing = () =>
	useContext(SidebarResizeContext)?.isResizing ?? false

interface SidebarResizeHandleProps {
	side: "left" | "right"
}

const SidebarResizeHandle = ({ side }: SidebarResizeHandleProps) => {
	const { t } = useTranslation("common")
	const { isMobile, state } = useSidebar()
	const resize = useContext(SidebarResizeContext)

	if (!resize?.isResizable) return null
	if (isMobile || state === "collapsed") return null

	return (
		<ResizeHandle
			label={t("sidebar.resize")}
			resize={resize}
			side={side}
			slot="sidebar-resize-handle"
		/>
	)
}

export {
	SIDEBAR_DEFAULT_WIDTH,
	SIDEBAR_FOLD_MOTION,
	SIDEBAR_MAX_WIDTH,
	SIDEBAR_MIN_WIDTH,
	SIDEBAR_WIDTH_STEP,
	SidebarResizeHandle,
	SidebarResizeProvider,
	useIsSidebarResizing,
}
