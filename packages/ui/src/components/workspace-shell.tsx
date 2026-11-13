import { type CSSProperties, type ReactNode, useId } from "react"

import {
	ContentCard,
	ContentCardLandmarkId,
} from "@workspace/ui/components/content-card"
import { hueStyle } from "@workspace/ui/components/hue-palette"
import { ShellSidebarProvider } from "@workspace/ui/components/shell-sidebar-provider"
import { SidebarPeekProvider } from "@workspace/ui/components/sidebar-peek"
import { SidebarResizeProvider } from "@workspace/ui/components/sidebar-resize"
import { SkipLink } from "@workspace/ui/components/skip-link"
import { cn } from "@workspace/ui/lib/utils"

const SIDEBAR_INSIDE_SHELL =
	"**:data-[slot=sidebar-container]:absolute **:data-[slot=sidebar-container]:top-10 **:data-[slot=sidebar-container]:bottom-(--shell-inset) **:data-[slot=sidebar-container]:h-auto"

const TITLE_BAR_AND_GUTTER = "pt-10 pe-1 pb-1"

const CARD_ON_SHELL_INSET =
	"*:data-content-card:me-[calc(var(--shell-inset)-var(--spacing))] *:data-content-card:mb-[calc(var(--shell-inset)-var(--spacing))]"

const SIDEBAR_WIDTH_STOPS_AT_THE_CARD =
	"*:data-content-card:[--sidebar-width:initial]"

const SETTINGS_MENU_ON_SHELL_INSET =
	"*:data-[slot=settings-menu]:mb-[calc(var(--shell-inset)-var(--spacing))]"

const SLIDE_DISTANCE =
	"[--sidebar-slide:calc(var(--sidebar-width)-var(--shell-inset))]"

const SLIDE_TIMING = "[--sidebar-slide-timing:150ms_var(--ease-out)]"

const SIDEBAR_SLIDES_OVER_THE_CARD =
	"motion-safe:data-[sidebar-sliding=true]:*:data-[slot=navigation-sidebar]:[transition:translate_var(--sidebar-slide-timing)] data-[sidebar-sliding=true]:*:data-[slot=navigation-sidebar]:surface-shell data-[sidebar-sliding=true]:*:data-[slot=navigation-sidebar]:z-40 data-[sidebar-sliding=true]:*:data-[slot=navigation-sidebar]:-me-(--sidebar-slide) data-[sidebar-open=false]:*:data-[slot=navigation-sidebar]:-translate-x-full data-[sidebar-layout=collapsed]:*:data-[slot=navigation-sidebar]:starting:-translate-x-full"

const SHELL_TITLE_BAR_HEIGHT = 40

const SHELL_GUTTER = 4

const SHELL = `surface-shell relative h-svh ${TITLE_BAR_AND_GUTTER} ${CARD_ON_SHELL_INSET} ${SIDEBAR_WIDTH_STOPS_AT_THE_CARD} ${SETTINGS_MENU_ON_SHELL_INSET} min-h-full max-h-full min-w-0 overflow-hidden ${SIDEBAR_INSIDE_SHELL} ${SLIDE_DISTANCE} ${SLIDE_TIMING} ${SIDEBAR_SLIDES_OVER_THE_CARD}`

const HELD_HANDLE_OVERLAY = "fixed inset-0 z-50 cursor-col-resize"

type ShellStyle = CSSProperties & { "--sidebar-width": string }

const shellStyle = (width: number, hue?: number): ShellStyle => ({
	"--sidebar-width": `${width}px`,
	...(hue === undefined ? undefined : hueStyle(hue)),
})

interface WorkspaceShellRootProps {
	width?: number
	onWidthChange?: (width: number) => void
	isResizable?: boolean
	className?: string
	spaceTint?: number | null
	isLandmark?: boolean
	open?: boolean
	onOpenChange?: (open: boolean) => void
	children: ReactNode
}

const WorkspaceShellRoot = ({
	spaceTint,
	isLandmark = true,
	width,
	onWidthChange,
	isResizable,
	open = true,
	onOpenChange,
	children,
	className,
}: WorkspaceShellRootProps) => {
	const mainId = useId()
	const spaceHue = spaceTint ?? undefined

	return (
		<SidebarResizeProvider
			isResizable={isResizable}
			onWidthChange={onWidthChange}
			width={width}
		>
			{(resize) => (
				<SidebarPeekProvider isDocked={open} isResizing={resize.isResizing}>
					{(dock) => (
						<ShellSidebarProvider
							className={cn(SHELL, className)}
							data-sidebar-layout={dock.layout}
							data-sidebar-open={open}
							data-sidebar-sliding={dock.isSliding}
							data-hue={spaceHue}
							onOpenChange={onOpenChange}
							open={open}
							ref={dock.shellRef}
							style={shellStyle(resize.width, spaceHue)}
						>
							<ContentCardLandmarkId value={isLandmark ? mainId : undefined}>
								{isLandmark ? <SkipLink targetId={mainId} /> : null}
								{children}
							</ContentCardLandmarkId>
							{resize.isResizable ? (
								<div
									aria-hidden="true"
									className={cn(
										HELD_HANDLE_OVERLAY,
										!resize.isResizing && "hidden",
									)}
									data-slot="sidebar-resize-overlay"
								/>
							) : null}
						</ShellSidebarProvider>
					)}
				</SidebarPeekProvider>
			)}
		</SidebarResizeProvider>
	)
}

interface WorkspaceShellProps extends WorkspaceShellRootProps {
	sidebar?: ReactNode
}

const WorkspaceShell = ({
	sidebar,
	isLandmark = true,
	children,
	...root
}: WorkspaceShellProps) => (
	<WorkspaceShellRoot isLandmark={isLandmark} {...root}>
		{sidebar}
		<ContentCard isLandmark={isLandmark}>{children}</ContentCard>
	</WorkspaceShellRoot>
)

export {
	SHELL_GUTTER,
	SHELL_TITLE_BAR_HEIGHT,
	WorkspaceShell,
	WorkspaceShellRoot,
	type WorkspaceShellRootProps,
}
