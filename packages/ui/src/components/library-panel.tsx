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

import { HeaderIsland } from "@workspace/ui/components/header-island"
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
import { Button } from "@workspace/ui/components/ui/button"
import { Input } from "@workspace/ui/components/ui/input"
import { Skeleton } from "@workspace/ui/components/ui/skeleton"
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@workspace/ui/components/ui/toggle-group"
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
		className="flex animate-pulse gap-0.5 p-0.5 motion-reduce:animate-none"
		data-slot="library-filters-skeleton"
	>
		{SKELETON_FILTER_WIDTHS.map((width) => (
			<Skeleton
				className={cn("h-7 animate-none rounded-sm bg-border", width)}
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
	<ToggleGroupItem
		className="gap-1.5 rounded-sm border border-transparent px-1.25 font-normal text-foreground text-xs leading-4 transition-none hover:bg-header-island-control-pressed focus-visible:ring-4 aria-pressed:bg-primary aria-pressed:font-medium aria-pressed:text-primary-foreground"
		data-slot="library-filter"
		size="sm"
		value={value}
	>
		{label}
		<span
			className="font-normal text-muted-foreground tabular-nums group-aria-pressed/toggle:text-primary-foreground"
			data-slot="library-filter-count"
		>
			{count}
		</span>
	</ToggleGroupItem>
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
		<ToggleGroup
			aria-label={t("library.filters.label")}
			className="rounded-md bg-muted p-0.5"
			data-slot="library-filters"
			onValueChange={([pressed]) =>
				onFilterChange((pressed as LibraryFilter | undefined) ?? filter)
			}
			spacing={0.5}
			value={[filter]}
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
		</ToggleGroup>
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
			className="group/search relative w-50 min-w-40 shrink @max-4xl:min-w-0"
			data-slot="library-search"
		>
			<Icons.Search
				aria-hidden="true"
				className="pointer-events-none absolute inset-y-0 start-2 my-auto size-3.5 text-muted-foreground group-focus-within/search:text-foreground"
			/>
			<Input
				aria-label={t("library.search")}
				className="text-ellipsis rounded-md bg-muted ps-7.25 pe-1.75 text-compact text-foreground leading-4 transition-none focus-visible:bg-transparent focus-visible:ring-4 md:text-compact"
				onChange={(event) => onQueryChange(event.target.value)}
				placeholder={t("library.search")}
				type="search"
				value={query}
			/>
		</div>
	)
}

type LibraryHeaderProps = {
	actions?: ReactNode
	filters?: ReactNode
}

const LibraryHeader = ({ actions, filters }: LibraryHeaderProps) => {
	const { t } = useTranslation("common")

	return (
		<header
			className="flex w-full min-w-0 flex-col items-start gap-2"
			data-slot="library-header"
		>
			<div className="flex w-full justify-between gap-2">
				<HeaderIsland className="gap-1">
					<h1 className="flex h-8 items-center px-2 font-medium text-sm leading-4">
						{t("library.title")}
					</h1>
					{filters ? (
						<div className="contents @max-4xl:hidden">{filters}</div>
					) : null}
				</HeaderIsland>
				{actions}
			</div>
			{filters ? (
				<HeaderIsland className="scrollbar-hide @4xl:hidden max-w-full overflow-x-auto">
					{filters}
				</HeaderIsland>
			) : null}
		</header>
	)
}

const ISLAND_ACTION =
	"rounded-md px-1.75 text-compact leading-4 transition-none focus-visible:ring-4 active:translate-y-px! active:scale-none!"

const GHOST_ISLAND_ACTION = cn(ISLAND_ACTION, "dark:hover:bg-muted")

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

	const hasActions = Boolean(
		onSearchQueryChange || onImport || onNewBoard || onNewDocument,
	)

	const actions = hasActions ? (
		<HeaderIsland className="min-w-0 shrink gap-1">
			{onSearchQueryChange ? (
				<LibrarySearch
					onQueryChange={onSearchQueryChange}
					query={searchQuery}
				/>
			) : null}
			{onImport ? (
				<Button
					className={GHOST_ISLAND_ACTION}
					onClick={onImport}
					variant="ghost"
				>
					<Icons.Import aria-hidden="true" className="size-3.5" />
					<span className="@max-lg:sr-only">{t("library.import")}</span>
				</Button>
			) : null}
			{onNewBoard ? (
				<Button
					className={GHOST_ISLAND_ACTION}
					onClick={onNewBoard}
					variant="ghost"
				>
					<Icons.Board aria-hidden="true" className="size-3.5" />
					<span className="@max-lg:sr-only">{t("library.newBoard")}</span>
				</Button>
			) : null}
			{onNewDocument ? (
				<Button className={ISLAND_ACTION} onClick={onNewDocument}>
					<Icons.Add aria-hidden="true" className="size-3.5" />
					<span className="@max-lg:sr-only">{t("library.newDocument")}</span>
				</Button>
			) : null}
		</HeaderIsland>
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
					contentClassName={cn(
						"pt-14 pb-6",
						filters && "@max-4xl:pt-26",
						isSkeletonShown && "h-full pb-0",
					)}
					header={<LibraryHeader actions={actions} filters={filters} />}
					isHeaderFloating
				>
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
	type LibraryFilter,
	LibraryOverlayContainer,
	LibraryPanel,
	type LibraryPanelProps,
	type LibraryPanelState,
	useLibraryOverlayContainer,
}
