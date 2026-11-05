"use client"

import { useId } from "react"
import { useTranslation } from "react-i18next"

import {
	BoardMiniature,
	type BoardSnapshot,
} from "@workspace/ui/components/board/board-miniature"
import type {
	BoardObjectOutlineSpec,
	BoardPointerPlacement,
	BoardPresenceOwner,
} from "@workspace/ui/components/board/board-presence"
import { BoardGlyph } from "@workspace/ui/components/document-panel"
import { Icons } from "@workspace/ui/components/icons"
import { FOCUS_OUTLINE } from "@workspace/ui/components/library-document-agents"
import { Button } from "@workspace/ui/components/ui/button"
import { cn } from "@workspace/ui/lib/utils"

type BoardCardDrawing = {
	agent: BoardPresenceOwner
	objectId: string
}

type BoardCardProps = {
	title: string
	itemCount: number
	drawing?: BoardCardDrawing
	editedLabel: string
	snapshot: BoardSnapshot
	pointers: readonly BoardPointerPlacement[]
	isOpenBeside?: boolean
	onOpen: () => void
}

const BoardCard = ({
	title,
	itemCount,
	drawing,
	editedLabel,
	snapshot,
	pointers,
	isOpenBeside = false,
	onOpen,
}: BoardCardProps) => {
	const { t } = useTranslation("common")
	const titleId = useId()
	const lineId = useId()
	const line = drawing
		? t("board.card.drawing", { name: drawing.agent.name, count: itemCount })
		: t("board.card.atRest", { count: itemCount, edited: editedLabel })
	const outlines: BoardObjectOutlineSpec[] = drawing
		? [{ objectId: drawing.objectId, owner: drawing.agent, state: "drawing" }]
		: []
	const drawerPointers = drawing
		? pointers.filter(({ owner }) => owner.id === drawing.agent.id)
		: []

	return (
		<article
			aria-labelledby={`${titleId} ${lineId}`}
			className={cn(
				"flex w-full min-w-0 flex-col gap-3 rounded-control border bg-card text-foreground",
				isOpenBeside ? "border-2 border-primary p-2.75" : "border-border p-3",
			)}
			data-slot="board-card"
			data-state={isOpenBeside ? "open" : "rest"}
		>
			<div className="flex items-start gap-2.5">
				<BoardGlyph />
				<div className="flex min-w-0 flex-1 flex-col">
					<p
						className="break-words font-semibold text-reading leading-5"
						data-slot="board-card-title"
						id={titleId}
					>
						{title}
					</p>
					<p
						className="break-words text-muted-foreground text-xs leading-4 tabular-nums"
						data-slot="board-card-line"
						id={lineId}
					>
						{line}
					</p>
				</div>
				<Button
					className={cn(
						"h-auto shrink-0 gap-1.5 rounded-full border-border p-1.5 text-compact text-foreground leading-4 transition-none hover:bg-foreground/8 active:bg-foreground/12 dark:hover:bg-foreground/8",
						FOCUS_OUTLINE,
					)}
					onClick={onOpen}
					variant="ghost"
				>
					<Icons.SidePanel aria-hidden="true" className="size-3.5" />
					{t("board.card.open")}
				</Button>
			</div>
			<div
				className="relative h-46 overflow-hidden rounded-md border border-foreground/6 bg-board-surface"
				data-slot="board-card-preview"
			>
				<BoardMiniature
					outlines={outlines}
					pointers={drawerPointers}
					snapshot={snapshot}
				/>
			</div>
		</article>
	)
}

export { BoardCard, type BoardCardDrawing, type BoardCardProps }
