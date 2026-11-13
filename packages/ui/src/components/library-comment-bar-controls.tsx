"use client"

import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import { type ReactNode, useRef } from "react"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import type { LibraryCommentsCounts } from "@workspace/ui/components/library-comments-list"
import { Button } from "@workspace/ui/components/ui/button"
import { Kbd } from "@workspace/ui/components/ui/kbd"
import { Popover, PopoverTrigger } from "@workspace/ui/components/ui/popover"
import { STILL_UNDER_REDUCED_MOTION } from "@workspace/ui/lib/reduced-motion"
import { cn } from "@workspace/ui/lib/utils"

type LibraryCommentBarControlsProps = {
	counts: LibraryCommentsCounts
	isCommentMode: boolean
	onCommentModeChange: (isCommentMode: boolean) => void
	list: ReactNode
	isOnDarkStage?: boolean
}

const COMMENT_TOGGLE_SLOT = "library-comment-toggle"

const BAR_PILL =
	"h-8 gap-1.5 rounded-full p-2 font-medium text-compact text-foreground leading-4 transition-none hover:bg-foreground/8 active:bg-foreground/12 dark:hover:bg-foreground/8"

const KEYCAP =
	"h-auto min-w-4.5 rounded-[0.25rem] bg-transparent p-0.5 text-[11px]/3.5 inset-ring inset-ring-foreground/17 group-aria-pressed/button:text-primary group-aria-pressed/button:inset-ring-primary/35 dark:inset-ring-foreground/20 dark:group-aria-pressed/button:inset-ring-primary/40"

const LibraryCommentBarControls = ({
	counts,
	isCommentMode,
	onCommentModeChange,
	list,
	isOnDarkStage = false,
}: LibraryCommentBarControlsProps) => {
	const { t } = useTranslation("common")
	const groupRef = useRef<HTMLDivElement>(null)
	const hasThreads = counts.open + counts.resolved > 0

	return (
		<div
			className="flex shrink-0 items-center gap-1"
			data-slot="library-comment-bar-controls"
			ref={groupRef}
		>
			{hasThreads ? (
				<Popover>
					<PopoverTrigger
						render={
							<Button
								aria-label={t("library.comments.bar.count", {
									count: counts.open,
								})}
								className={cn(
									BAR_PILL,
									"tabular-nums aria-expanded:bg-foreground/8",
								)}
								data-slot="library-comment-counter"
								variant="ghost"
							/>
						}
					>
						<Icons.Comments aria-hidden="true" />
						{counts.open}
					</PopoverTrigger>
					<PopoverPrimitive.Portal>
						<PopoverPrimitive.Positioner
							align="end"
							anchor={groupRef}
							className="isolate z-50"
							side="bottom"
							sideOffset={4}
						>
							<PopoverPrimitive.Popup
								aria-label={t("library.comments.list.label")}
								className={cn(
									"origin-(--transform-origin) rounded-control outline-hidden duration-100 data-closed:fade-out-0 data-closed:zoom-out-95 data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-open:animate-in",
									isOnDarkStage && "dark",
									STILL_UNDER_REDUCED_MOTION,
								)}
								data-slot="library-comments-popover"
							>
								{list}
							</PopoverPrimitive.Popup>
						</PopoverPrimitive.Positioner>
					</PopoverPrimitive.Portal>
				</Popover>
			) : null}
			<Button
				aria-keyshortcuts={t("library.comments.bar.shortcut")}
				aria-pressed={isCommentMode}
				className={cn(
					BAR_PILL,
					"aria-pressed:bg-primary-soft aria-pressed:text-primary aria-pressed:hover:bg-primary-soft",
				)}
				data-slot={COMMENT_TOGGLE_SLOT}
				onClick={() => onCommentModeChange(!isCommentMode)}
				variant="ghost"
			>
				<Icons.Comment aria-hidden="true" />
				{t("library.comments.bar.comment")}
				<Kbd aria-hidden="true" className={KEYCAP}>
					{t("library.comments.bar.shortcut")}
				</Kbd>
			</Button>
		</div>
	)
}

export {
	COMMENT_TOGGLE_SLOT,
	LibraryCommentBarControls,
	type LibraryCommentBarControlsProps,
}
