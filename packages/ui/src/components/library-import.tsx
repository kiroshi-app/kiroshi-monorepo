"use client"

import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import { SPACE_GROUND } from "@workspace/ui/components/library-grid"
import { cn } from "@workspace/ui/lib/utils"

const GHOST_OFFSET_BELOW_CURSOR = 14

type LibraryDropOverlayProps = {
	fileCount: number
}

const LibraryDropOverlay = ({ fileCount }: LibraryDropOverlayProps) => {
	const { t } = useTranslation("common")

	return (
		<div
			className="pointer-events-none absolute inset-0 flex bg-card/86 p-4"
			data-slot="library-drop-overlay"
		>
			<div
				className="flex flex-1 flex-col items-center justify-center gap-4 rounded-control border-2 border-primary border-dashed bg-primary/8 p-4 text-center"
				data-slot="library-drop-zone"
				role="status"
			>
				<span
					aria-hidden="true"
					className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground"
					data-slot="library-drop-badge"
				>
					<Icons.Import className="size-6" strokeWidth={2} />
				</span>
				<span className="flex flex-col gap-1">
					<span className="break-words font-semibold text-foreground text-xl leading-6.5 tracking-[-0.01em]">
						{t("library.drop.title", { count: fileCount })}
					</span>
					<span className="text-soft-foreground text-sm leading-5">
						{t("library.bringIn.formats")}
					</span>
				</span>
			</div>
		</div>
	)
}

type CursorPosition = {
	x: number
	y: number
}

type LibraryDragGhostProps = {
	names: string[]
	position: CursorPosition
	previewSrc?: string
}

const LibraryDragGhost = ({
	names,
	position,
	previewSrc,
}: LibraryDragGhostProps) => {
	const { t } = useTranslation("common")
	const [firstName, ...otherNames] = names

	return (
		<div
			aria-hidden="true"
			className="pointer-events-none fixed top-0 left-0 z-50 flex max-w-72 items-center gap-2 rounded-lg bg-card-raised py-1.5 ps-1.5 pe-2.5 shadow-popover"
			data-slot="library-drag-ghost"
			style={{
				transform: `translate(${position.x}px, ${position.y + GHOST_OFFSET_BELOW_CURSOR}px)`,
			}}
		>
			<span
				className={cn(
					"size-8 shrink-0 overflow-hidden rounded-sm",
					SPACE_GROUND,
				)}
			>
				{previewSrc ? (
					<img
						alt=""
						className="size-full object-cover"
						draggable={false}
						src={previewSrc}
					/>
				) : null}
			</span>
			<span className="flex min-w-0 flex-1 flex-col">
				<span
					className="truncate font-medium text-compact text-foreground leading-4"
					title={firstName}
				>
					{firstName}
				</span>
				{otherNames.length > 0 ? (
					<span className="truncate text-muted-foreground text-xs leading-4">
						{t("library.drop.more", { count: otherNames.length })}
					</span>
				) : null}
			</span>
			<span
				className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 font-semibold text-primary-foreground text-xs tabular-nums"
				data-slot="library-drag-count"
			>
				{names.length}
			</span>
		</div>
	)
}

export {
	type CursorPosition,
	LibraryDragGhost,
	type LibraryDragGhostProps,
	LibraryDropOverlay,
	type LibraryDropOverlayProps,
}
