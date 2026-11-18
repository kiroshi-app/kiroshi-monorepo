"use client"

import {
	createContext,
	type ReactNode,
	type RefObject,
	useContext,
	useMemo,
	useState,
} from "react"
import { useTranslation } from "react-i18next"

import {
	APP_HEADER_TITLE,
	AppHeader,
	AppHeaderText,
} from "@workspace/ui/components/app-header"
import { Icons } from "@workspace/ui/components/icons"
import {
	LibraryEmptyState,
	type LibraryTemplate,
} from "@workspace/ui/components/library-empty-state"
import {
	LibraryGrid,
	LibraryGridSkeleton,
	type LibraryImageActions,
	type LibraryItem,
} from "@workspace/ui/components/library-grid"
import type { LibraryItemActions } from "@workspace/ui/components/library-item-menu"
import { ScreenLayout } from "@workspace/ui/components/screen-layout"
import {
	SlidingTab,
	SlidingTabCount,
	SlidingTabs,
} from "@workspace/ui/components/sliding-tabs"
import { TooltipHint } from "@workspace/ui/components/tooltip-hint"
import { Input } from "@workspace/ui/components/ui/input"
import { Skeleton } from "@workspace/ui/components/ui/skeleton"
import { useIsNarrowerThan } from "@workspace/ui/hooks/use-is-narrower-than"
import { useSkeletonTiming } from "@workspace/ui/hooks/use-skeleton-timing"
import { cn } from "@workspace/ui/lib/utils"

type LibraryFilter = "all" | "images" | "documents" | "boards"

type LibraryPanelState = "loading" | "ready"

const KIND_OF_FILTER = {
	images: "image",
	documents: "document",
	boards: "board",
} as const satisfies Record<Exclude<LibraryFilter, "all">, LibraryItem["kind"]>

const LibraryOverlayContainer =
	createContext<RefObject<HTMLDivElement | null> | null>(null)

const useLibraryOverlayContainer = () => useContext(LibraryOverlayContainer)

const SKELETON_FILTER_WIDTHS = ["w-11", "w-16", "w-21", "w-15.5"]

const FiltersSkeleton = () => (
	<div
		aria-hidden="true"
		className="flex animate-pulse gap-0.75 p-0.75 motion-reduce:animate-none"
		data-slot="library-filters-skeleton"
	>
		{SKELETON_FILTER_WIDTHS.map((width) => (
			<Skeleton
				className={cn("h-6.5 animate-none rounded-sm bg-border", width)}
				key={width}
			/>
		))}
	</div>
)

type FilterSegmentProps = {
	value: LibraryFilter
	label: string
	count: number
}

const FilterSegment = ({ value, label, count }: FilterSegmentProps) => (
	<SlidingTab value={value}>
		{label}
		<SlidingTabCount>{count}</SlidingTabCount>
	</SlidingTab>
)

type LibraryFiltersProps = {
	filter: LibraryFilter
	counts: Record<LibraryFilter, number>
	onFilterChange: (filter: LibraryFilter) => void
}

const LibraryFilters = ({
	filter,
	counts,
	onFilterChange,
}: LibraryFiltersProps) => {
	const { t } = useTranslation("common")

	return (
		<SlidingTabs
			aria-label={t("library.filters.label")}
			data-slot="library-filters"
			kind="filters"
			onValueChange={onFilterChange}
			value={filter}
		>
			<FilterSegment
				count={counts.all}
				label={t("library.filters.all")}
				value="all"
			/>
			<FilterSegment
				count={counts.images}
				label={t("library.filters.images")}
				value="images"
			/>
			<FilterSegment
				count={counts.documents}
				label={t("library.filters.documents")}
				value="documents"
			/>
			<FilterSegment
				count={counts.boards}
				label={t("library.filters.boards")}
				value="boards"
			/>
		</SlidingTabs>
	)
}

type LibrarySearchProps = {
	query: string
	onQueryChange: (query: string) => void
}

const LibrarySearch = ({ query, onQueryChange }: LibrarySearchProps) => {
	const { t } = useTranslation("common")

	return (
		<div
			className="group/search relative min-w-40 max-w-60 flex-1 basis-40 @max-xl:max-w-none @max-xl:basis-full"
			data-slot="library-search"
		>
			<Icons.Search
				aria-hidden="true"
				className="pointer-events-none absolute inset-y-0 start-3.25 my-auto size-3.5 text-muted-foreground group-focus-within/search:text-soft-foreground"
			/>
			<Input
				aria-label={t("library.search")}
				className="text-ellipsis rounded-full border-foreground/12 bg-foreground/3 ps-8.5 pe-3 text-compact text-foreground leading-4 transition-none focus-visible:bg-transparent focus-visible:ring-4 md:text-compact"
				onChange={(event) => onQueryChange(event.target.value)}
				placeholder={t("library.search")}
				type="search"
				value={query}
			/>
		</div>
	)
}

const FILTERS_STRIP_WITH_FOCUS_RING_ROOM =
	"scrollbar-hide -m-0.5 max-w-[calc(100%+--spacing(1))] overflow-x-auto p-0.5"

const LABELS_MIN_WIDTH = {
	withoutImport: { secondary: 512, primary: 340 },
	withImport: { secondary: 672, primary: 380 },
}

const BAR_ACTION =
	"flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 font-medium text-compact leading-4 outline-ring transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:ring-2 focus-visible:ring-background in-data-content-card:focus-visible:ring-card [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0"

const BAR_ACTION_KIND = {
	secondary:
		"border border-foreground/12 bg-background text-foreground in-data-content-card:bg-card dark:bg-foreground/4 hover:bg-foreground/5 dark:hover:bg-foreground/5 active:bg-foreground/10 dark:active:bg-foreground/10 [&_svg]:text-soft-foreground hover:[&_svg]:text-foreground active:[&_svg]:text-foreground",
	primary:
		"bg-(--fill) text-primary-foreground [--fill:var(--primary)] hover:bg-[color-mix(in_oklab,var(--fill),var(--color-black)_8%)] active:bg-[color-mix(in_oklab,var(--fill),var(--color-black)_16.7%)] dark:text-[var(--hue-dark-bubble-foreground,var(--foreground))] dark:[--fill:var(--hue-dark-bubble,var(--hue-blue-bubble))]",
}

type BarActionProps = {
	kind: keyof typeof BAR_ACTION_KIND
	icon: ReactNode
	label: string
	onClick: () => void
	isIconOnly?: boolean
	slot?: "library-action" | "agents-page-create"
}

const BarAction = ({
	kind,
	icon,
	label,
	onClick,
	isIconOnly = false,
	slot = "library-action",
}: BarActionProps) => (
	<TooltipHint content={isIconOnly ? label : null} side="bottom">
		<button
			className={cn(
				BAR_ACTION,
				BAR_ACTION_KIND[kind],
				isIconOnly && "w-8 px-0",
			)}
			data-slot={slot}
			onClick={onClick}
			type="button"
		>
			{icon}
			<span className={isIconOnly ? "sr-only" : undefined}>{label}</span>
		</button>
	</TooltipHint>
)

type LibraryPanelProps = LibraryItemActions<LibraryItem> &
	LibraryImageActions & {
		state: LibraryPanelState
		items: LibraryItem[]
		filter: LibraryFilter
		onFilterChange: (filter: LibraryFilter) => void
		onOpenItem: (item: LibraryItem) => void
		searchQuery?: string
		onSearchQueryChange?: (query: string) => void
		onImport?: () => void
		onNewDocument?: () => void
		onNewBoard?: () => void
		onStartTemplate?: (template: LibraryTemplate) => void
		overlay?: ReactNode
		dragRegion?: "deep"
	}

const LibraryPanel = ({
	state,
	items,
	filter,
	onFilterChange,
	onOpenItem,
	searchQuery = "",
	onSearchQueryChange,
	onImport,
	onNewDocument,
	onNewBoard,
	onStartTemplate,
	overlay,
	dragRegion,
	...itemActions
}: LibraryPanelProps) => {
	const { t } = useTranslation("common")
	const [overlayElement, setOverlayElement] = useState<HTMLDivElement | null>(
		null,
	)
	const overlayContainer = useMemo(
		() => ({ current: overlayElement }),
		[overlayElement],
	)
	const phase = useSkeletonTiming(state === "loading")
	const isSkeletonShown = phase === "skeleton"
	const isAwaiting = isSkeletonShown || phase === "delay"
	const isEmpty = !isAwaiting && items.length === 0 && searchQuery === ""
	const shownItems =
		filter === "all"
			? items
			: items.filter((item) => item.kind === KIND_OF_FILTER[filter])
	const counts = {
		all: items.length,
		images: items.filter((item) => item.kind === "image").length,
		documents: items.filter((item) => item.kind === "document").length,
		boards: items.filter((item) => item.kind === "board").length,
	}

	const labelsMinWidth = onImport
		? LABELS_MIN_WIDTH.withImport
		: LABELS_MIN_WIDTH.withoutImport
	const hasSecondaryIconsOnly = useIsNarrowerThan(
		overlayElement,
		labelsMinWidth.secondary,
	)
	const hasPrimaryIconOnly = useIsNarrowerThan(
		overlayElement,
		labelsMinWidth.primary,
	)

	const actions =
		onImport || onNewBoard || onNewDocument ? (
			<div
				className="flex shrink-0 items-center gap-2"
				data-slot="library-actions"
			>
				{onImport ? (
					<BarAction
						icon={<Icons.LibraryImport aria-hidden="true" />}
						isIconOnly={hasSecondaryIconsOnly}
						kind="secondary"
						label={t("library.import")}
						onClick={onImport}
					/>
				) : null}
				{onNewBoard ? (
					<BarAction
						icon={<Icons.NewBoard aria-hidden="true" />}
						isIconOnly={hasSecondaryIconsOnly}
						kind="secondary"
						label={t("library.newBoard")}
						onClick={onNewBoard}
					/>
				) : null}
				{onNewDocument ? (
					<BarAction
						icon={<Icons.Add aria-hidden="true" />}
						isIconOnly={hasPrimaryIconOnly}
						kind="primary"
						label={t("library.newDocument")}
						onClick={onNewDocument}
					/>
				) : null}
			</div>
		) : null

	const filters = isSkeletonShown ? (
		<FiltersSkeleton />
	) : isAwaiting || isEmpty ? null : (
		<LibraryFilters
			counts={counts}
			filter={filter}
			onFilterChange={onFilterChange}
		/>
	)

	return (
		<LibraryOverlayContainer.Provider value={overlayContainer}>
			<div
				className="relative flex size-full min-h-0 flex-col"
				data-slot="library-panel"
				ref={setOverlayElement}
			>
				<ScreenLayout
					aria-busy={isAwaiting}
					className="@container isolate min-h-0 flex-1"
					contentClassName={cn("gap-4", isSkeletonShown && "h-full pb-0")}
					header={
						<AppHeader
							close={actions}
							data-tauri-drag-region={dragRegion}
							leading={
								<AppHeaderText
									topLine={
										<span className="truncate">{t("library.description")}</span>
									}
								>
									<h1 className={APP_HEADER_TITLE}>{t("library.title")}</h1>
								</AppHeaderText>
							}
						/>
					}
				>
					{filters ? (
						<div
							className="flex flex-wrap items-center justify-between gap-3"
							data-slot="library-controls"
						>
							<div className={FILTERS_STRIP_WITH_FOCUS_RING_ROOM}>
								{filters}
							</div>
							{onSearchQueryChange ? (
								<LibrarySearch
									onQueryChange={onSearchQueryChange}
									query={searchQuery}
								/>
							) : null}
						</div>
					) : null}
					{isSkeletonShown ? (
						<LibraryGridSkeleton />
					) : isAwaiting ? null : isEmpty ? (
						<LibraryEmptyState
							onImport={onImport}
							onNewBoard={onNewBoard}
							onNewDocument={onNewDocument}
							onStartTemplate={onStartTemplate}
						/>
					) : shownItems.length === 0 ? (
						<p
							className="break-words text-compact text-muted-foreground leading-4.5"
							data-slot="library-no-result"
							role="status"
						>
							{searchQuery !== ""
								? t("library.noResult.search", { query: searchQuery })
								: filter === "images"
									? t("library.noResult.images")
									: filter === "boards"
										? t("library.noResult.boards")
										: t("library.noResult.documents")}
						</p>
					) : (
						<LibraryGrid
							{...itemActions}
							items={shownItems}
							onOpenItem={onOpenItem}
						/>
					)}
				</ScreenLayout>
				{overlay}
			</div>
		</LibraryOverlayContainer.Provider>
	)
}

export {
	BarAction,
	type LibraryFilter,
	LibraryOverlayContainer,
	LibraryPanel,
	type LibraryPanelProps,
	type LibraryPanelState,
	useLibraryOverlayContainer,
}
