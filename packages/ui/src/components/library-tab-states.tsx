"use client"

import { type ReactNode, useId } from "react"
import { useTranslation } from "react-i18next"

import { HeaderIsland } from "@workspace/ui/components/header-island"
import { Icons } from "@workspace/ui/components/icons"
import {
	FAILURE_CARD,
	FAILURE_LINE,
	FAILURE_PRIMARY_PILL,
} from "@workspace/ui/components/library-document-states"
import { DOCUMENT_COLUMN_MEASURE } from "@workspace/ui/components/library-document-view"
import {
	LIBRARY_ISLAND_CONTEXT,
	LIBRARY_OVERLAY_ISLAND,
} from "@workspace/ui/components/library-item-menu"
import { LIGHTBOX_SURFACE } from "@workspace/ui/components/library-lightbox"
import {
	ListSkeleton,
	SkeletonBar,
} from "@workspace/ui/components/list-skeleton"
import { FLOATING_HEADER } from "@workspace/ui/components/screen-layout"
import { Button } from "@workspace/ui/components/ui/button"
import { Skeleton } from "@workspace/ui/components/ui/skeleton"
import { libraryDisplayName } from "@workspace/ui/lib/library-display-name"
import { cn } from "@workspace/ui/lib/utils"

const PULSE = "animate-pulse motion-reduce:animate-none"

type SkeletonCircleProps = {
	className: string
}

const SkeletonCircle = ({ className }: SkeletonCircleProps) => (
	<Skeleton
		className={cn("shrink-0 animate-none rounded-full bg-border", className)}
	/>
)

const SkeletonControl = () => (
	<span className="flex size-8 shrink-0 items-center justify-center">
		<Skeleton className="size-4 animate-none rounded-sm bg-border" />
	</span>
)

type SkeletonIslandsProps = {
	children: ReactNode
	islandClassName?: string
}

const SkeletonIslands = ({
	children,
	islandClassName,
}: SkeletonIslandsProps) => (
	<div aria-hidden="true" className={FLOATING_HEADER}>
		<HeaderIsland className={cn(LIBRARY_ISLAND_CONTEXT, islandClassName)}>
			<div className={cn("flex min-w-0 items-center gap-0.5", PULSE)}>
				<SkeletonControl />
				<div className="flex h-8 min-w-0 items-center gap-2.5 px-2">
					{children}
				</div>
			</div>
		</HeaderIsland>
		<HeaderIsland className={islandClassName}>
			<div className={cn("flex items-center gap-0.5", PULSE)}>
				<SkeletonControl />
				<SkeletonControl />
				<SkeletonControl />
			</div>
		</HeaderIsland>
	</div>
)

const PARAGRAPH_ENDS = ["w-3/5", "w-4/5", "w-2/5"] as const

const SkeletonDocumentHeader = () => (
	<div className="flex flex-col gap-1.5 pb-5">
		<div className="flex h-8.5 items-center">
			<SkeletonBar className="h-5 w-72 max-w-full" />
		</div>
		<div className="flex h-4.5 items-center">
			<SkeletonBar className="w-48 max-w-full" isFaint />
		</div>
	</div>
)

type SkeletonParagraphProps = {
	end: string
}

const SkeletonParagraph = ({ end }: SkeletonParagraphProps) => (
	<div className="flex flex-col pb-3.5">
		<div className="flex h-6 items-center">
			<SkeletonBar className="w-full" />
		</div>
		<div className="flex h-6 items-center">
			<SkeletonBar className="w-11/12" />
		</div>
		<div className="flex h-6 items-center">
			<SkeletonBar className={end} />
		</div>
	</div>
)

const documentSkeletonRowAt = (index: number) =>
	index === 0 ? (
		<SkeletonDocumentHeader />
	) : (
		<SkeletonParagraph end={PARAGRAPH_ENDS[index % PARAGRAPH_ENDS.length]} />
	)

const LibraryDocumentSkeleton = () => {
	const { t } = useTranslation("common")

	return (
		<section
			aria-busy="true"
			aria-label={t("library.tab.loadingDocument")}
			className="relative flex size-full min-h-0 flex-col"
			data-slot="library-document-skeleton"
		>
			<SkeletonIslands>
				<SkeletonBar className="w-32" />
			</SkeletonIslands>
			<div className="flex min-h-0 flex-1 flex-col px-10 pt-14 pb-10">
				<div
					className={cn(
						"mx-auto flex min-h-0 w-full flex-1 flex-col",
						DOCUMENT_COLUMN_MEASURE,
					)}
				>
					<ListSkeleton
						className="min-h-0 flex-1 gap-0"
						row={documentSkeletonRowAt}
					/>
				</div>
			</div>
		</section>
	)
}

const LibraryImageSkeleton = () => {
	const { t } = useTranslation("common")

	return (
		<section
			aria-busy="true"
			aria-label={t("library.tab.loadingImage")}
			className={cn(
				LIGHTBOX_SURFACE,
				"relative flex size-full min-h-0 flex-col",
			)}
			data-slot="library-image-skeleton"
		>
			<SkeletonIslands islandClassName={LIBRARY_OVERLAY_ISLAND}>
				<SkeletonBar className="w-40" />
				<SkeletonBar className="w-24" isFaint />
			</SkeletonIslands>
			<div
				aria-hidden="true"
				className={cn("relative flex min-h-0 flex-1 flex-col", PULSE)}
			>
				<div className="flex min-h-0 flex-1 items-center gap-5 px-5 pb-18">
					<SkeletonCircle className="mt-14 size-10" />
					<div className="flex h-full min-w-0 flex-1 pt-14">
						<Skeleton
							className="h-full min-w-0 flex-1 animate-none rounded-md bg-border/60"
							data-slot="library-image-skeleton-stage"
						/>
					</div>
					<SkeletonCircle className="mt-14 size-10" />
				</div>
				<div className="absolute inset-x-0 bottom-0 flex h-18 items-center justify-center">
					<Skeleton className="h-9 w-56 animate-none rounded-full bg-border" />
				</div>
			</div>
		</section>
	)
}

type LibraryItemUnavailableReason = "missing" | "unreadable"

type LibraryItemUnavailableProps = {
	name: string
	reason: LibraryItemUnavailableReason
	onAction: () => void
}

const LibraryItemUnavailable = ({
	name,
	reason,
	onAction,
}: LibraryItemUnavailableProps) => {
	const { t } = useTranslation("common")
	const lineId = useId()
	const reasonId = useId()
	const line = t(`library.tab.unavailable.${reason}.title`, {
		name: libraryDisplayName(name, t),
	})
	const reasonLine = t(`library.tab.unavailable.${reason}.body`)

	return (
		<div
			className="flex size-full min-h-0 items-center justify-center p-6"
			data-slot="library-item-unavailable"
		>
			<div
				aria-describedby={reasonId}
				aria-labelledby={lineId}
				className={cn(FAILURE_CARD, "w-full max-w-sm rounded-control")}
				role="group"
			>
				<div className="flex min-w-0 flex-col gap-1" role="alert">
					<p className={FAILURE_LINE}>
						<Icons.Error
							aria-hidden="true"
							className="size-4 shrink-0 text-destructive"
						/>
						<span className="truncate" id={lineId} title={line}>
							{line}
						</span>
					</p>
					<p
						className="text-pretty text-muted-foreground text-xs leading-4"
						id={reasonId}
					>
						{reasonLine}
					</p>
				</div>
				<Button
					className={cn(FAILURE_PRIMARY_PILL, "self-start")}
					onClick={onAction}
					variant="ghost"
				>
					{t(`library.tab.unavailable.${reason}.action`)}
				</Button>
			</div>
		</div>
	)
}

export {
	LibraryDocumentSkeleton,
	LibraryImageSkeleton,
	LibraryItemUnavailable,
	type LibraryItemUnavailableProps,
	type LibraryItemUnavailableReason,
}
