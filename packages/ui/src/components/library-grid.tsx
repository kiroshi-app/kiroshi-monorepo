"use client"

import { useTranslation } from "react-i18next"

import {
	BoardMiniature,
	type BoardSnapshot,
} from "@workspace/ui/components/board/board-miniature"
import type { ImageMenuActions } from "@workspace/ui/components/image-menu"
import {
	type LibraryItemActions,
	LibraryItemContextMenu,
} from "@workspace/ui/components/library-item-menu"
import {
	ListSkeleton,
	SkeletonBar,
} from "@workspace/ui/components/list-skeleton"
import { Markdown } from "@workspace/ui/components/markdown"
import { Skeleton } from "@workspace/ui/components/ui/skeleton"
import { middleClickHandlers } from "@workspace/ui/lib/click-modifiers"
import { libraryDisplayName } from "@workspace/ui/lib/library-display-name"
import { cn } from "@workspace/ui/lib/utils"

type LibraryImageItem = {
	kind: "image"
	id: string
	name: string
	detail: string
	src: string
	importProgress?: number
}

type LibraryDocumentItem = {
	kind: "document"
	id: string
	name: string
	detail: string
	excerpt: string
	importProgress?: number
}

type LibraryBoardItem = {
	kind: "board"
	id: string
	name: string
	detail: string
	snapshot: BoardSnapshot
	importProgress?: never
}

type LibraryItem = LibraryImageItem | LibraryDocumentItem | LibraryBoardItem

const GRID_COLUMNS =
	"grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-x-4"

const SPACE_GROUND = "bg-(--bot-avatar-ground)"

const THUMBNAIL_GROUND: Record<LibraryItem["kind"], string> = {
	image: SPACE_GROUND,
	document: "bg-(--document-ground)",
	board: "bg-board-surface",
}

const PAGE_SHADOW =
	"shadow-[0_1px_2px_rgb(0_0_0/0.4),0_6px_16px_rgb(0_0_0/0.4)]"

const PAGE_TYPE = cn(
	"max-w-none text-[7.5px] text-muted-foreground leading-[11px] [--typeset-flow:0.375rem] [&>:first-child]:mt-0",
	"[&_h1]:text-[11px] [&_h1]:leading-[14px] [&_h2]:mt-1.5 [&_h2]:text-[8px] [&_h2]:leading-[11px] [&_:is(h1,h2)+*]:mt-1.5",
	"[&_li]:mt-0.5 [&_li]:ps-0.5 [&_ul]:ps-3",
)

type LibraryPageProps = {
	excerpt: string
	className: string
}

const LibraryPage = ({ excerpt, className }: LibraryPageProps) => (
	<div
		aria-hidden="true"
		className={cn(
			"pointer-events-none absolute h-42.5 overflow-hidden rounded-sm bg-card-raised p-4",
			PAGE_SHADOW,
			className,
		)}
		data-slot="library-page"
	>
		<Markdown className={PAGE_TYPE} isStatic>
			{excerpt}
		</Markdown>
	</div>
)

type LibraryThumbnailProps = {
	item: LibraryItem
}

const LibraryThumbnailContent = ({ item }: LibraryThumbnailProps) => {
	switch (item.kind) {
		case "image":
			return (
				<img
					alt=""
					className="size-full object-cover"
					draggable={false}
					src={item.src}
				/>
			)
		case "document":
			return (
				<LibraryPage
					className="start-9 top-5.5 w-49.75"
					excerpt={item.excerpt}
				/>
			)
		case "board":
			return <BoardMiniature snapshot={item.snapshot} />
	}
}

const LibraryThumbnail = ({ item }: LibraryThumbnailProps) => (
	<span
		className={cn(
			"relative block h-45 overflow-hidden rounded-control border border-shell-border group-hover/library-item:border-input",
			THUMBNAIL_GROUND[item.kind],
		)}
		data-slot="library-thumbnail"
	>
		<LibraryThumbnailContent item={item} />
	</span>
)

const holdFocusForItsReturn = (pressed: HTMLButtonElement) => pressed.focus()

type LibraryItemCaptionProps = {
	name: string
	detail: string
}

const LibraryItemCaption = ({ name, detail }: LibraryItemCaptionProps) => {
	const { t } = useTranslation("common")
	const shownName = libraryDisplayName(name, t)

	return (
		<span className="flex min-w-0 flex-col gap-0.5">
			<span
				className="truncate font-medium text-compact text-foreground leading-4.5"
				title={shownName}
			>
				{shownName}
			</span>
			<span className="truncate text-muted-foreground text-xs tabular-nums">
				{detail}
			</span>
		</span>
	)
}

type LibraryImageActions = Pick<
	ImageMenuActions<LibraryImageItem>,
	"onSaveToLibrary" | "onCopyImage"
>

type LibraryGridItemProps = LibraryItemActions<LibraryItem> &
	LibraryImageActions & {
		item: LibraryItem
		onPress: (item: LibraryItem) => void
	}

const LibraryGridItem = ({
	item,
	onPress,
	onSaveToLibrary,
	onCopyImage,
	...actions
}: LibraryGridItemProps) => {
	const trigger = (
		<button
			className="group/library-item flex min-w-0 flex-col gap-2.5 rounded-control text-start focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2"
			data-slot="library-item"
			onClick={(event) => {
				holdFocusForItsReturn(event.currentTarget)
				onPress(item)
			}}
			{...middleClickHandlers(() => onPress(item))}
			type="button"
		>
			<LibraryThumbnail item={item} />
			<LibraryItemCaption detail={item.detail} name={item.name} />
		</button>
	)

	return item.kind === "image" ? (
		<LibraryItemContextMenu
			{...actions}
			item={item}
			onCopyImage={onCopyImage}
			onSaveToLibrary={onSaveToLibrary}
			trigger={trigger}
		/>
	) : (
		<LibraryItemContextMenu {...actions} item={item} trigger={trigger} />
	)
}

type LibraryImportingItemProps = {
	item: LibraryItem
	progress: number
}

const LibraryImportingItem = ({
	item,
	progress,
}: LibraryImportingItemProps) => {
	const { t } = useTranslation("common")
	const percent = Math.round(progress * 100)

	return (
		<div className="flex min-w-0 flex-col gap-2.5" data-slot="library-item">
			<span className="relative block">
				<LibraryThumbnail item={item} />
				<span
					className="absolute inset-0 flex items-end rounded-control bg-card/72 p-4"
					data-slot="library-import-scrim"
				>
					<span
						aria-label={t("library.importing.label", {
							name: libraryDisplayName(item.name, t),
						})}
						aria-valuemax={100}
						aria-valuemin={0}
						aria-valuenow={percent}
						className="block h-1 flex-1 overflow-hidden rounded-xs bg-foreground/12"
						role="progressbar"
					>
						<span
							className="block h-full bg-primary"
							data-slot="library-import-progress"
							style={{ width: `${percent}%` }}
						/>
					</span>
				</span>
			</span>
			<LibraryItemCaption
				detail={t("library.importing.detail", { percent })}
				name={item.name}
			/>
		</div>
	)
}

type LibraryGridProps = LibraryItemActions<LibraryItem> &
	LibraryImageActions & {
		items: LibraryItem[]
		onOpenItem: (item: LibraryItem) => void
	}

const LibraryGrid = ({
	items,
	onOpenItem,
	...itemActions
}: LibraryGridProps) => (
	<ul className={cn(GRID_COLUMNS, "gap-y-7")} data-slot="library-grid">
		{items.map((item) => (
			<li className="flex min-w-0 flex-col" key={item.id}>
				{item.importProgress === undefined ? (
					<LibraryGridItem {...itemActions} item={item} onPress={onOpenItem} />
				) : (
					<LibraryImportingItem item={item} progress={item.importProgress} />
				)}
			</li>
		))}
	</ul>
)

const SKELETON_TILE_KEYS = Array.from(
	{ length: 12 },
	(_, index) => `tile-${index}`,
)

const SkeletonGridRow = () => (
	<div
		className={cn(
			GRID_COLUMNS,
			"grid-rows-[auto] auto-rows-[0] overflow-hidden",
		)}
	>
		{SKELETON_TILE_KEYS.map((key) => (
			<div className="flex flex-col gap-2.5" key={key}>
				<Skeleton className="h-45 animate-none rounded-control bg-border" />
				<div className="flex flex-col gap-0.5">
					<div className="flex h-4.5 items-center">
						<SkeletonBar className="w-32" />
					</div>
					<div className="flex h-4 items-center">
						<SkeletonBar className="w-44" isFaint />
					</div>
				</div>
			</div>
		))}
	</div>
)

const LibraryGridSkeleton = () => (
	<div className="min-h-0 flex-1" data-slot="library-grid-skeleton">
		<ListSkeleton className="gap-7" row={<SkeletonGridRow />} />
	</div>
)

export {
	LibraryGrid,
	LibraryGridSkeleton,
	type LibraryImageActions,
	type LibraryItem,
	LibraryPage,
	SPACE_GROUND,
}
