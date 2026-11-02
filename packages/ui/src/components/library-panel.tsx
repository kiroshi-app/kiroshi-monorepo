"use client"

import { Radio as RadioPrimitive } from "@base-ui/react/radio"
import {
	createContext,
	type ReactNode,
	type RefObject,
	useContext,
	useRef,
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
	type LibraryItem,
} from "@workspace/ui/components/library-grid"
import { Button } from "@workspace/ui/components/ui/button"
import { RadioGroup } from "@workspace/ui/components/ui/radio-group"
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
			<div className={cn("h-7 rounded-full bg-border", width)} key={width} />
		))}
	</div>
)

type FilterPillProps = {
	value: LibraryFilter
	label: string
	count?: number
}

const FilterPill = ({ value, label, count }: FilterPillProps) => (
	<RadioPrimitive.Root
		className="group/filter inline-flex h-7 items-center gap-1.5 rounded-full border border-input px-3 font-medium text-compact text-foreground leading-4 hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground"
		data-slot="library-filter"
		value={value}
	>
		{label}
		{count === undefined ? null : (
			<span className="font-normal text-muted-foreground tabular-nums group-data-checked/filter:text-primary-foreground">
				{count}
			</span>
		)}
	</RadioPrimitive.Root>
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
		<RadioGroup
			aria-label={t("library.filters.label")}
			className="flex w-auto flex-wrap gap-1.5"
			data-slot="library-filters"
			onValueChange={(value) => onFilterChange(value as LibraryFilter)}
			value={filter}
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
		</RadioGroup>
	)
}

type LibrarySearchProps = {
	query: string
	onQueryChange: (query: string) => void
}

const LibrarySearch = ({ query, onQueryChange }: LibrarySearchProps) => {
	const { t } = useTranslation("common")

	return (
		<label
			className="flex h-8 w-55 items-center gap-2 rounded-full border border-input bg-foreground/3 px-3 focus-within:outline-2 focus-within:outline-solid focus-within:outline-ring focus-within:outline-offset-2"
			data-slot="library-search"
		>
			<Icons.Search
				aria-hidden="true"
				className="size-3.75 shrink-0 text-muted-foreground"
			/>
			<input
				aria-label={t("library.search")}
				className="min-w-0 flex-1 bg-transparent text-compact text-foreground leading-4 outline-none placeholder:text-muted-foreground"
				onChange={(event) => onQueryChange(event.target.value)}
				placeholder={t("library.search")}
				type="search"
				value={query}
			/>
		</label>
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

type LibraryPanelProps = {
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
}: LibraryPanelProps) => {
	const { t } = useTranslation("common")
	const overlayContainer = useRef<HTMLDivElement>(null)
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
				ref={overlayContainer}
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
					) : (
						<LibraryGrid items={shownItems} onOpenItem={onOpenItem} />
					)}
				</div>
				{overlay}
			</div>
		</LibraryOverlayContainer.Provider>
	)
}

export {
	type LibraryFilter,
	LibraryPanel,
	type LibraryPanelProps,
	type LibraryPanelState,
	useLibraryOverlayContainer,
}
