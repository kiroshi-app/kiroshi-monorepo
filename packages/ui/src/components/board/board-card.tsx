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
import { Skeleton } from "@workspace/ui/components/ui/skeleton"
import { cn } from "@workspace/ui/lib/utils"

type BoardCardDrawing = {
	agent: BoardPresenceOwner
	objectId?: string
}

type BoardCardSummary =
	| { status: "loading" }
	| { status: "failed" }
	| { status: "loaded"; itemCount: number; snapshot: BoardSnapshot }

type BoardCardProps = {
	title: string
	summary: BoardCardSummary
	drawing?: BoardCardDrawing
	editedLabel: string
	pointers: readonly BoardPointerPlacement[]
	isOpenBeside?: boolean
	onOpen: () => void
}

const SKELETON = "animate-none bg-border"

type BoardCardPreviewProps = {
	snapshot: BoardSnapshot
	drawing?: BoardCardDrawing
	pointers: readonly BoardPointerPlacement[]
}

const BoardCardPreview = ({
	snapshot,
	drawing,
	pointers,
}: BoardCardPreviewProps) => {
	const outlines: BoardObjectOutlineSpec[] = drawing?.objectId
		? [{ objectId: drawing.objectId, owner: drawing.agent, state: "drawing" }]
		: []
	const drawerPointers = drawing
		? pointers.filter(({ owner }) => owner.id === drawing.agent.id)
		: []

	return (
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
	)
}

const BoardCard = ({
	title,
	summary,
	drawing,
	editedLabel,
	pointers,
	isOpenBeside = false,
	onOpen,
}: BoardCardProps) => {
	const { t } = useTranslation("common")
	const titleId = useId()
	const lineId = useId()
	const isLoading = summary.status === "loading"
	const lineOf = (itemCount: number) =>
		drawing
			? t("board.card.drawing", { name: drawing.agent.name, count: itemCount })
			: t("board.card.atRest", { count: itemCount, edited: editedLabel })

	return (
		<article
			aria-busy={isLoading || undefined}
			aria-labelledby={isLoading ? titleId : `${titleId} ${lineId}`}
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
					{isLoading ? (
						<Skeleton
							className={cn(SKELETON, "h-4 w-40 max-w-full rounded-sm")}
							data-slot="board-card-line-skeleton"
						/>
					) : (
						<p
							className="break-words text-muted-foreground text-xs leading-4 tabular-nums"
							data-slot="board-card-line"
							id={lineId}
						>
							{summary.status === "failed"
								? t("board.card.failed")
								: lineOf(summary.itemCount)}
						</p>
					)}
				</div>
				<Button
					aria-describedby={titleId}
					className={cn(
						"h-auto shrink-0 gap-1.5 rounded-full border-border p-1.5 text-compact text-foreground leading-4 transition-none hover:bg-foreground/8 active:bg-foreground/12 dark:hover:bg-foreground/8",
						FOCUS_OUTLINE,
					)}
					onClick={onOpen}
					variant="ghost"
				>
					<Icons.SidePanel aria-hidden="true" className="size-3.5" />
					<span className="pe-1">{t("board.card.open")}</span>
				</Button>
			</div>
			{summary.status === "loaded" ? (
				<BoardCardPreview
					drawing={drawing}
					pointers={pointers}
					snapshot={summary.snapshot}
				/>
			) : null}
			{isLoading ? (
				<Skeleton
					className={cn(SKELETON, "h-46 rounded-md")}
					data-slot="board-card-preview-skeleton"
				/>
			) : null}
		</article>
	)
}

export {
	BoardCard,
	type BoardCardDrawing,
	type BoardCardProps,
	type BoardCardSummary,
}
