"use client"

import { type ReactNode, useId, useState } from "react"
import { useTranslation } from "react-i18next"

import { DocumentGlyph } from "@workspace/ui/components/document-card"
import { panelWidthsInRoom } from "@workspace/ui/components/document-panel-widths"
import { Icons } from "@workspace/ui/components/icons"
import { FOCUS_OUTLINE } from "@workspace/ui/components/library-document-agents"
import { LIBRARY_BAR_BARE } from "@workspace/ui/components/library-item-menu"
import {
	ResizeHandle,
	useResizableWidth,
} from "@workspace/ui/components/resize-handle"
import { TooltipButton } from "@workspace/ui/components/tooltip-button"
import { useRenderedWidth } from "@workspace/ui/hooks/use-rendered-width"
import { libraryDisplayName } from "@workspace/ui/lib/library-display-name"
import { cn } from "@workspace/ui/lib/utils"

const BAR_BUTTON = cn(
	LIBRARY_BAR_BARE,
	"active:bg-foreground/12 dark:hover:bg-foreground/8",
	FOCUS_OUTLINE,
)

const DOCUMENT_PANEL_DEFAULT_WIDTH = 600
const DOCUMENT_PANEL_MIN_WIDTH = 400
const DOCUMENT_PANEL_MAX_WIDTH = 800
const THREAD_MIN_WIDTH = 320

type DocumentPanelProps = {
	title: string
	width?: number
	defaultWidth?: number
	onWidthChange?: (width: number) => void
	presence?: ReactNode
	onOpenInLibrary: () => void
	onClose: () => void
	children: ReactNode
}

const DocumentPanel = ({
	title,
	width,
	defaultWidth = DOCUMENT_PANEL_DEFAULT_WIDTH,
	onWidthChange,
	presence,
	onOpenInLibrary,
	onClose,
	children,
}: DocumentPanelProps) => {
	const { t } = useTranslation("common")
	const titleId = useId()
	const shownTitle = libraryDisplayName(title, t)
	const resize = useResizableWidth({
		width,
		defaultWidth,
		onWidthChange,
		minWidth: DOCUMENT_PANEL_MIN_WIDTH,
		maxWidth: DOCUMENT_PANEL_MAX_WIDTH,
	})
	const [panel, setPanel] = useState<HTMLElement | null>(null)
	const room = useRenderedWidth(panel?.parentElement ?? null)
	const fittedResize =
		room === null
			? resize
			: {
					...resize,
					...panelWidthsInRoom({
						room,
						askedWidth: resize.width,
						minWidth: DOCUMENT_PANEL_MIN_WIDTH,
						maxWidth: DOCUMENT_PANEL_MAX_WIDTH,
						threadMinWidth: THREAD_MIN_WIDTH,
					}),
				}
	const reachableResize = {
		...fittedResize,
		commitWidth: (next: number) =>
			resize.commitWidth(Math.min(next, fittedResize.maxWidth)),
	}

	return (
		<aside
			aria-labelledby={titleId}
			className="relative flex h-full min-w-0 max-w-full shrink flex-col border-foreground/8 border-s bg-card text-foreground"
			data-resizing={resize.isResizing}
			data-slot="document-panel"
			ref={setPanel}
			style={{ width: reachableResize.width }}
		>
			<ResizeHandle
				label={t("library.panel.resize")}
				resize={reachableResize}
				side="right"
				slot="document-panel-resize-handle"
			/>
			<div
				className="flex h-12 shrink-0 items-center gap-2 border-foreground/6 border-b px-3 pt-px"
				data-slot="document-panel-header"
			>
				<DocumentGlyph />
				<p
					className="min-w-0 flex-1 truncate font-medium text-sm leading-5"
					id={titleId}
					title={shownTitle}
				>
					{shownTitle}
				</p>
				{presence}
				<TooltipButton
					aria-label={t("library.panel.openInLibrary")}
					className={BAR_BUTTON}
					onClick={onOpenInLibrary}
					size="icon"
					tooltip={t("library.panel.openInLibrary")}
					tooltipSide="bottom"
					variant="ghost"
				>
					<Icons.Library aria-hidden="true" />
				</TooltipButton>
				<TooltipButton
					aria-label={t("library.panel.close")}
					className={BAR_BUTTON}
					onClick={onClose}
					size="icon"
					tooltip={t("library.panel.close")}
					tooltipSide="bottom"
					variant="ghost"
				>
					<Icons.Close aria-hidden="true" />
				</TooltipButton>
			</div>
			<div
				className="min-h-0 flex-1 overflow-y-auto"
				data-slot="document-panel-column"
			>
				<div className="flex flex-col gap-3.5 p-8">
					<h2 className="break-words font-heading font-semibold text-2xl leading-7.5 tracking-[-0.02em]">
						{shownTitle}
					</h2>
					{children}
				</div>
			</div>
		</aside>
	)
}

export {
	DOCUMENT_PANEL_DEFAULT_WIDTH,
	DOCUMENT_PANEL_MAX_WIDTH,
	DOCUMENT_PANEL_MIN_WIDTH,
	DocumentPanel,
	type DocumentPanelProps,
	THREAD_MIN_WIDTH,
}
