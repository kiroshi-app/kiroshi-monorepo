"use client"

import { Dialog } from "@base-ui/react/dialog"
import { type ReactNode, useId, useRef } from "react"
import { useTranslation } from "react-i18next"

import { COMPANION_SILHOUETTE } from "@workspace/ui/components/companion-picture"
import { EmptyStateShell } from "@workspace/ui/components/empty-state-shell"
import { Icons } from "@workspace/ui/components/icons"
import {
	ListSkeleton,
	SkeletonBar,
} from "@workspace/ui/components/list-skeleton"
import { ACTIVITY_ROW_CLASS } from "@workspace/ui/components/row-anatomy"
import {
	SearchResultRow,
	type SearchResultRowProps,
} from "@workspace/ui/components/search-result-row"
import {
	BACKDROP_CLASS,
	POPUP_CLASS,
} from "@workspace/ui/components/settings-styles"
import { ToggleSwitch } from "@workspace/ui/components/toggle-switch"
import { Button } from "@workspace/ui/components/ui/button"
import { Skeleton } from "@workspace/ui/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/ui/tabs"
import { useSkeletonTiming } from "@workspace/ui/hooks/use-skeleton-timing"
import { cn } from "@workspace/ui/lib/utils"

type SearchKind = "messages" | "chats" | "missions" | "routines"

type SearchTab = "all" | SearchKind

type SearchRestingKind = Exclude<SearchKind, "messages">

type SearchPaletteResult = Omit<SearchResultRowProps, "id" | "isActive"> & {
	id: string
}

type SearchResultGroup = {
	kind: SearchKind
	total: number
	results: SearchPaletteResult[]
}

type SearchRestingGroup = {
	kind: SearchRestingKind
	results: SearchPaletteResult[]
}

type SearchPaletteProps = {
	open: boolean
	onOpenChange: (open: boolean) => void
	query: string
	onQueryChange: (query: string) => void
	tab: SearchTab
	onTabChange: (tab: SearchTab) => void
	isScopeAllSpaces: boolean
	onScopeChange: (isAllSpaces: boolean) => void
	spaceName: string
	results: SearchResultGroup[]
	resting: SearchRestingGroup[]
	isLoading?: boolean
	activeResultId?: string
}

type SectionHead = {
	label: string
	total?: number
	seeAllKind?: SearchKind
}

type PaletteSection = {
	key: string
	head?: SectionHead
	results: SearchPaletteResult[]
}

const TABS: SearchTab[] = ["all", "messages", "chats", "missions", "routines"]

const RESTING_KINDS: SearchRestingKind[] = ["chats", "missions", "routines"]

const PANEL_MARK_CLASS = "size-8 text-muted-foreground"

const RESTING_MARKS: Record<SearchRestingKind, ReactNode> = {
	chats: <Icons.Message aria-hidden="true" className={PANEL_MARK_CLASS} />,
	missions: <Icons.Bookmark aria-hidden="true" className={PANEL_MARK_CLASS} />,
	routines: <Icons.Routine aria-hidden="true" className={PANEL_MARK_CLASS} />,
}

const SHOWN_PER_KIND = 3

const PALETTE_GEOMETRY_CLASS =
	"-translate-x-1/2 fixed top-27 left-1/2 z-50 flex h-146 max-h-[calc(100vh-9rem)] w-160 max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl"

const POPUP = cn(POPUP_CLASS, PALETTE_GEOMETRY_CLASS)

const QUERY_LINE_CLASS =
	"flex h-13 shrink-0 items-center gap-2.5 border-border border-b px-4"

const INPUT_CLASS =
	"min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"

const TAB_ROW_CLASS =
	"flex h-11 shrink-0 items-center justify-between gap-2 px-3"

const TAB_STRIP_CLASS =
	"scrollbar-hide max-w-full overflow-x-auto bg-transparent p-0"

const TAB_TRIGGER_CLASS = "h-7.5 shrink-0 py-0 transition-none"

const BODY_CLASS =
	"flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:ring-inset"

const PANEL_CLASS = "my-auto"

const LIST_CLASS = "flex flex-col gap-0.5"

const SECTION_HEAD_CLASS = "flex h-7 items-center gap-1.5 px-2"

const CONVERSATION_SKELETON_ROWS = ["first", "second", "third"]

const CONVERSATION_SKELETON_WIDTHS =
	"[--skeleton-title:--spacing(14)] [--skeleton-sub:--spacing(62.5)] [&>:nth-child(3n+2)]:[--skeleton-title:--spacing(24)] [&>:nth-child(3n+2)]:[--skeleton-sub:--spacing(53.5)] [&>:nth-child(3n)]:[--skeleton-title:--spacing(12)] [&>:nth-child(3n)]:[--skeleton-sub:--spacing(45)]"

const MISSION_SKELETON_WIDTHS =
	"[--skeleton-title:--spacing(52.5)] [--skeleton-sub:--spacing(24)] [&>:nth-child(3n+2)]:[--skeleton-title:--spacing(37.5)] [&>:nth-child(3n+2)]:[--skeleton-sub:--spacing(42.5)] [&>:nth-child(3n)]:[--skeleton-title:--spacing(44)] [&>:nth-child(3n)]:[--skeleton-sub:--spacing(37.5)]"

const SEE_ALL_CLASS =
	"ms-auto rounded-md text-muted-foreground text-xs outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30"

const ResultRowSkeleton = () => (
	<div className={ACTIVITY_ROW_CLASS}>
		<Skeleton
			className="size-8 shrink-0 animate-none rounded-none bg-border"
			style={COMPANION_SILHOUETTE}
		/>
		<div className="flex min-h-9 min-w-0 flex-1 flex-col justify-center">
			<div className="flex h-5 items-center justify-between">
				<SkeletonBar className="w-(--skeleton-title)" />
				<SkeletonBar className="w-7 shrink-0" isFaint />
			</div>
			<div className="flex h-4 items-center">
				<SkeletonBar className="w-(--skeleton-sub)" isFaint />
			</div>
		</div>
	</div>
)

type SkeletonSectionHeadProps = {
	label: string
}

const SkeletonSectionHead = ({ label }: SkeletonSectionHeadProps) => (
	<div className={SECTION_HEAD_CLASS} data-slot="search-palette-section-head">
		<span className="font-medium text-foreground text-xs">{label}</span>
	</div>
)

type ResultsSkeletonProps = {
	isSectioned: boolean
}

const ResultsSkeleton = ({ isSectioned }: ResultsSkeletonProps) => {
	const { t } = useTranslation("search")

	if (!isSectioned) {
		return (
			<ListSkeleton
				className={cn("gap-0.5", CONVERSATION_SKELETON_WIDTHS)}
				row={<ResultRowSkeleton />}
			/>
		)
	}

	return (
		<div
			aria-hidden="true"
			className="flex min-h-0 flex-1 flex-col"
			data-slot="search-palette-skeleton"
		>
			<div className={LIST_CLASS}>
				<SkeletonSectionHead label={t("rest.chats")} />
				<div
					className={cn(
						LIST_CLASS,
						CONVERSATION_SKELETON_WIDTHS,
						"animate-pulse motion-reduce:animate-none",
					)}
				>
					{CONVERSATION_SKELETON_ROWS.map((row) => (
						<ResultRowSkeleton key={row} />
					))}
				</div>
			</div>
			<div className="flex min-h-0 flex-1 flex-col gap-0.5 pt-2">
				<SkeletonSectionHead label={t("rest.missions")} />
				<ListSkeleton
					className={cn("gap-0.5", MISSION_SKELETON_WIDTHS)}
					row={<ResultRowSkeleton />}
				/>
			</div>
		</div>
	)
}

const SearchPalette = ({
	open,
	onOpenChange,
	query,
	onQueryChange,
	tab,
	onTabChange,
	isScopeAllSpaces,
	onScopeChange,
	spaceName,
	results,
	resting,
	isLoading = false,
	activeResultId,
}: SearchPaletteProps) => {
	const { t } = useTranslation("search")
	const input = useRef<HTMLInputElement>(null)
	const listId = useId()
	const scopeId = useId()
	const label = t("open")
	const isRest = query === ""
	const isAllTab = tab === "all"

	const restingOf = (kind: SearchRestingKind) =>
		resting.find((group) => group.kind === kind)?.results ?? []

	const restingSections: PaletteSection[] = RESTING_KINDS.map((kind) => ({
		kind,
		rows: restingOf(kind),
	}))
		.filter(({ kind, rows }) => (isAllTab || tab === kind) && rows.length > 0)
		.map(({ kind, rows }) => ({
			key: kind,
			head: {
				label: t(`rest.${kind}`),
				seeAllKind: isAllTab && rows.length > SHOWN_PER_KIND ? kind : undefined,
			},
			results: isAllTab ? rows.slice(0, SHOWN_PER_KIND) : rows,
		}))

	const foundSections: PaletteSection[] = results
		.filter(
			(group) => group.results.length > 0 && (isAllTab || group.kind === tab),
		)
		.map((group) =>
			isAllTab
				? {
						key: group.kind,
						head: {
							label: t(`tab.${group.kind}`),
							total: group.total,
							seeAllKind: group.total > SHOWN_PER_KIND ? group.kind : undefined,
						},
						results: group.results.slice(0, SHOWN_PER_KIND),
					}
				: { key: group.kind, results: group.results },
		)

	const answered = isRest ? restingSections : foundSections
	const isAwaitingRows =
		isLoading && answered.length === 0 && !(isRest && tab === "messages")
	const phase = useSkeletonTiming(isAwaitingRows)
	const isSkeletonShown = phase === "skeleton"
	const sections = isSkeletonShown ? [] : answered

	const shown = sections.flatMap((section) => section.results)
	const rowId = (id: string) => `${listId}-${id}`
	const sectionListId = (key: string) => `${listId}-${key}`
	const activeId =
		activeResultId && shown.some((result) => result.id === activeResultId)
			? rowId(activeResultId)
			: undefined

	const ownedLists =
		shown.length === 0
			? listId
			: sections.map((section) => sectionListId(section.key)).join(" ")

	const scopeAction = (action: string) =>
		isScopeAllSpaces ? undefined : (
			<Button
				className="rounded-lg"
				onClick={() => onScopeChange(true)}
				size="sm"
				variant="secondary"
			>
				{action}
			</Button>
		)

	const searchMark = (
		<Icons.Search aria-hidden="true" className={PANEL_MARK_CLASS} />
	)

	const instructionPanel = (action?: ReactNode) => (
		<EmptyStateShell
			action={action}
			className={PANEL_CLASS}
			data-slot="search-palette-rest"
			description={t("rest.messages.body", { space: spaceName })}
			mark={searchMark}
			title={t("rest.messages.title")}
		/>
	)

	const restingPanel = (kind: SearchRestingKind) => (
		<EmptyStateShell
			action={scopeAction(t("rest.action"))}
			className={PANEL_CLASS}
			data-slot="search-palette-rest"
			description={t(`rest.none.body.${kind}`, { space: spaceName })}
			mark={RESTING_MARKS[kind]}
			title={t(`rest.none.${kind}`)}
		/>
	)

	const foundPanel = (
		<EmptyStateShell
			action={scopeAction(t("empty.action"))}
			className={PANEL_CLASS}
			data-slot="search-palette-empty"
			description={t("empty.description", { space: spaceName, query })}
			mark={searchMark}
			title={t("empty.title")}
		/>
	)

	const panelOf = () => {
		if (shown.length > 0) return null
		if (isSkeletonShown) return null
		if (!isRest) return isLoading ? null : foundPanel
		if (tab === "messages") return instructionPanel()
		if (isLoading) return null
		if (!isAllTab) return restingPanel(tab)
		return instructionPanel(scopeAction(t("rest.action")))
	}

	const rowOf = ({ id, space, ...rest }: SearchPaletteResult) => (
		<SearchResultRow
			{...rest}
			id={rowId(id)}
			isActive={id === activeResultId}
			key={id}
			space={isScopeAllSpaces ? space : undefined}
		/>
	)

	return (
		<Dialog.Root onOpenChange={onOpenChange} open={open}>
			<Dialog.Portal>
				<Dialog.Backdrop
					className={BACKDROP_CLASS}
					data-slot="search-palette-backdrop"
				/>
				<Dialog.Popup
					aria-label={label}
					className={POPUP}
					data-slot="search-palette"
					initialFocus={input}
				>
					<div className={QUERY_LINE_CLASS} data-slot="search-palette-query">
						<Icons.Search
							aria-hidden="true"
							className="size-[18px] shrink-0 text-muted-foreground"
						/>
						<input
							aria-activedescendant={activeId}
							aria-controls={ownedLists}
							aria-expanded
							aria-label={label}
							autoComplete="off"
							className={INPUT_CLASS}
							onChange={(event) => onQueryChange(event.target.value)}
							placeholder={t("placeholder")}
							ref={input}
							role="combobox"
							value={query}
						/>
					</div>

					<div className={TAB_ROW_CLASS} data-slot="search-palette-tabs">
						<Tabs
							className="min-w-0"
							onValueChange={(value) => onTabChange(value as SearchTab)}
							value={tab}
						>
							<TabsList className={TAB_STRIP_CLASS}>
								{TABS.map((candidate) => (
									<TabsTrigger
										className={TAB_TRIGGER_CLASS}
										key={candidate}
										value={candidate}
									>
										{t(`tab.${candidate}`)}
									</TabsTrigger>
								))}
							</TabsList>
						</Tabs>
						<div className="flex shrink-0 items-center gap-2">
							<span className="text-muted-foreground text-xs" id={scopeId}>
								{t("scope")}
							</span>
							<ToggleSwitch
								aria-labelledby={scopeId}
								checked={isScopeAllSpaces}
								onCheckedChange={onScopeChange}
							/>
						</div>
					</div>

					<div
						aria-busy={isLoading || isSkeletonShown}
						className={BODY_CLASS}
						data-slot="search-palette-body"
						// biome-ignore lint/a11y/noNoninteractiveTabindex: the body scrolls on its own and every row inside it is driven by aria-activedescendant, so this is the only handle a keyboard has on it
						tabIndex={0}
					>
						{sections.map(({ key, head, results: rows }) => {
							const seeAllKind = head?.seeAllKind
							const list = (
								<div
									aria-label={head?.label ?? t("results")}
									className={LIST_CLASS}
									id={sectionListId(key)}
									key={key}
									role="listbox"
								>
									{rows.map(rowOf)}
								</div>
							)

							if (!head) return list

							return (
								<div className={LIST_CLASS} key={key}>
									<div
										className={SECTION_HEAD_CLASS}
										data-slot="search-palette-section-head"
									>
										<span className="font-medium text-foreground text-xs">
											{head.label}
										</span>
										{head.total === undefined ? null : (
											<span className="text-muted-foreground text-xs tabular-nums">
												{head.total}
											</span>
										)}
										{seeAllKind ? (
											<button
												className={SEE_ALL_CLASS}
												data-slot="search-palette-see-all"
												onClick={() => onTabChange(seeAllKind)}
												type="button"
											>
												{t("seeAll")}
											</button>
										) : null}
									</div>
									{list}
								</div>
							)
						})}

						{shown.length > 0 ? null : (
							<div
								aria-label={t("results")}
								className={cn(LIST_CLASS, isSkeletonShown && "min-h-0 flex-1")}
								id={listId}
								role="listbox"
							>
								{isSkeletonShown ? (
									<ResultsSkeleton isSectioned={isRest && isAllTab} />
								) : null}
							</div>
						)}

						{panelOf()}
					</div>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	)
}

export {
	type SearchKind,
	SearchPalette,
	type SearchPaletteProps,
	type SearchPaletteResult,
	type SearchRestingGroup,
	type SearchResultGroup,
	type SearchTab,
}
