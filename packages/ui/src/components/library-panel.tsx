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

import { Icons } from "@workspace/ui/components/icons"
import {
	LibraryEmptyState,
	type LibraryTemplate,
	OUTLINED_PILL,
} from "@workspace/ui/components/library-empty-state"
import {
	LibraryGrid,
	LibraryGridSkeleton,
	type LibraryImageActions,
	type LibraryItem,
} from "@workspace/ui/components/library-grid"
import type { LibraryItemActions } from "@workspace/ui/components/library-item-menu"
import { Button } from "@workspace/ui/components/ui/button"
import { Input } from "@workspace/ui/components/ui/input"
import { Skeleton } from "@workspace/ui/components/ui/skeleton"
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@workspace/ui/components/ui/toggle-group"
import { cn } from "@workspace/ui/lib/utils"

type LibraryFilter = "all" | "images" | "documents"

type LibraryPanelState = "loading" | "ready"

const KIND_OF_FILTER = {
	images: "image",
	documents: "document",
} as const satisfies Record<Exclude<LibraryFilter, "all">, LibraryItem["kind"]>

const LibraryOverlayContainer =
	createContext<RefObject<HTMLDivElement | null> | null>(null)

const useLibraryOverlayContainer = () => useContext(LibraryOverlayContainer)

const SKELETON_FILTER_WIDTHS = ["w-11", "w-21", "w-27", "w-19"]

const FiltersSkeleton = () => (
	<div
		aria-hidden="true"
		className="flex animate-pulse gap-1.5 motion-reduce:animate-none"
		data-slot="library-filters-skeleton"
	>
		{SKELETON_FILTER_WIDTHS.map((width) => (
			<Skeleton
				className={cn("h-7 animate-none rounded-full bg-border", width)}
				key={width}
			/>
		))}
	</div>
)

type FilterPillProps = {
	value: LibraryFilter
	label: string
	count?: number
}

const FilterPill = ({ value, label, count }: FilterPillProps) => (
	<ToggleGroupItem
		className="gap-1.5 rounded-full px-3 text-compact text-foreground leading-4 transition-none hover:bg-foreground/5 aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
		data-slot="library-filter"
		size="sm"
		value={value}
		variant="outline"
	>
		{label}
		{count === undefined ? null : (
			<span className="font-normal text-muted-foreground tabular-nums group-aria-pressed/toggle:text-primary-foreground">
				{count}
			</span>
		)}
	</ToggleGroupItem>
)

type LibraryFiltersProps = {
	filter: LibraryFilter
	counts: Record<Exclude<LibraryFilter, "all">, number>
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
			className="flex-wrap"
			data-slot="library-filters"
			onValueChange={([pressed]) =>
				onFilterChange((pressed as LibraryFilter | undefined) ?? filter)
			}
			spacing={1.5}
			value={[filter]}
		>
			<FilterPill label={t("library.filters.all")} value="all" />
			<FilterPill
				count={counts.images}
				label={t("library.filters.images")}
				value="images"
			/>
			<FilterPill
				count={counts.documents}
				label={t("library.filters.documents")}
				value="documents"
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
		<div className="relative w-55" data-slot="library-search">
			<Icons.Search
				aria-hidden="true"
				className="pointer-events-none absolute inset-y-0 start-3 my-auto size-3.75 text-muted-foreground"
			/>
			<Input
				aria-label={t("library.search")}
				className="rounded-full border-input bg-foreground/3 ps-8.75 pe-3 text-compact text-foreground leading-4.5 transition-none md:text-compact"
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
			className="flex flex-col gap-5 px-10 pt-8 pb-5"
			data-slot="library-header"
		>
			<div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
				<div className="flex min-w-0 flex-col gap-1">
					<h1 className="font-heading font-semibold text-2xl text-foreground leading-7.5 tracking-[-0.015em]">
						{t("library.title")}
					</h1>
					<p className="text-compact text-muted-foreground leading-4.5">
						{t("library.subtitle")}
					</p>
				</div>
				{actions}
			</div>
			{filters}
		</header>
	)
}

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
	const isLoading = state === "loading"
	const isEmpty = !isLoading && items.length === 0 && searchQuery === ""
	const shownItems =
		filter === "all"
			? items
			: items.filter((item) => item.kind === KIND_OF_FILTER[filter])
	const counts = {
		images: items.filter((item) => item.kind === "image").length,
		documents: items.filter((item) => item.kind === "document").length,
	}

	const actions = isEmpty ? null : (
		<div className="flex items-center gap-2" data-slot="library-actions">
			{onSearchQueryChange ? (
				<LibrarySearch
					onQueryChange={onSearchQueryChange}
					query={searchQuery}
				/>
			) : null}
			{onImport ? (
				<Button
					className={cn(OUTLINED_PILL, "gap-1.5 px-3")}
					onClick={onImport}
					variant="outline"
				>
					<Icons.Import aria-hidden="true" />
					{t("library.import")}
				</Button>
			) : null}
			{onNewDocument ? (
				<Button
					className="h-8 gap-1.5 rounded-full px-3 font-medium text-compact leading-4 transition-none"
					onClick={onNewDocument}
				>
					<Icons.Add aria-hidden="true" />
					{t("library.newDocument")}
				</Button>
			) : null}
		</div>
	)

	const filters = isLoading ? (
		<FiltersSkeleton />
	) : isEmpty ? null : (
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
				<div
					aria-busy={isLoading}
					className="flex min-h-0 flex-1 flex-col overflow-y-auto"
				>
					<LibraryHeader actions={actions} filters={filters} />
					{isLoading ? (
						<LibraryGridSkeleton />
					) : isEmpty ? (
						<LibraryEmptyState
							onImport={onImport}
							onNewDocument={onNewDocument}
							onStartTemplate={onStartTemplate}
						/>
					) : shownItems.length === 0 ? (
						<p
							className="break-words px-10 pt-2 pb-10 text-compact text-muted-foreground leading-4.5"
							data-slot="library-no-result"
							role="status"
						>
							{searchQuery !== ""
								? t("library.noResult.search", { query: searchQuery })
								: filter === "images"
									? t("library.noResult.images")
									: t("library.noResult.documents")}
						</p>
					) : (
						<LibraryGrid
							{...itemActions}
							items={shownItems}
							onOpenItem={onOpenItem}
						/>
					)}
				</div>
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
