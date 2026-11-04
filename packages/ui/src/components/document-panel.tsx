"use client"

import { type ReactNode, useId } from "react"
import { useTranslation } from "react-i18next"

import { DocumentGlyph } from "@workspace/ui/components/document-card"
import { Icons } from "@workspace/ui/components/icons"
import { FOCUS_OUTLINE } from "@workspace/ui/components/library-document-agents"
import { LIBRARY_BAR_BARE } from "@workspace/ui/components/library-item-menu"
import { TooltipButton } from "@workspace/ui/components/tooltip-button"
import { libraryDisplayName } from "@workspace/ui/lib/library-display-name"
import { cn } from "@workspace/ui/lib/utils"

const BAR_BUTTON = cn(
	LIBRARY_BAR_BARE,
	"active:bg-foreground/12 dark:hover:bg-foreground/8",
	FOCUS_OUTLINE,
)

type DocumentPanelProps = {
	title: string
	presence?: ReactNode
	onOpenInLibrary: () => void
	onClose: () => void
	children: ReactNode
}

const DocumentPanel = ({
	title,
	presence,
	onOpenInLibrary,
	onClose,
	children,
}: DocumentPanelProps) => {
	const { t } = useTranslation("common")
	const titleId = useId()
	const shownTitle = libraryDisplayName(title, t)

	return (
		<aside
			aria-labelledby={titleId}
			className="flex h-full w-150 min-w-0 max-w-full shrink-0 flex-col border-foreground/8 border-s bg-card text-foreground"
			data-slot="document-panel"
		>
			<div className="flex h-13 shrink-0 items-center gap-2 border-foreground/6 border-b px-3">
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

export { DocumentPanel, type DocumentPanelProps }
