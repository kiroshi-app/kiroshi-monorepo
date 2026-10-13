"use client"

import { Tabs } from "@base-ui/react/tabs"
import { type ReactNode, useRef } from "react"
import { useTranslation } from "react-i18next"

import { type Icon, Icons } from "@workspace/ui/components/icons"
import {
	ListSkeleton,
	SkeletonBar,
} from "@workspace/ui/components/list-skeleton"
import { ApplicationMark } from "@workspace/ui/components/plugin-settings/application-mark"
import { ApplicationsSearchField } from "@workspace/ui/components/plugin-settings/applications-search-field"
import { SettingsPushedPage } from "@workspace/ui/components/settings-pushed-page"
import {
	RAIL_ITEM_CLASS,
	SETTINGS_PANEL_CLASS,
} from "@workspace/ui/components/settings-rail"
import { Button } from "@workspace/ui/components/ui/button"
import { Skeleton } from "@workspace/ui/components/ui/skeleton"
import { useOverlayScrollbars } from "@workspace/ui/hooks/use-overlay-scrollbars"
import { useSkeletonTiming } from "@workspace/ui/hooks/use-skeleton-timing"
import { cn } from "@workspace/ui/lib/utils"

type ApplicationSetup = "signIn" | "apiKey" | "none" | "unavailable"

type CatalogueApplication = {
	id: string
	name: string
	description?: string
	setup: ApplicationSetup
	mark?: string
	packageIdentity?: string
	source?: string
	useCount?: number
	isVerified?: boolean
	host?: string
}

const CATALOGUE_CATEGORIES = [
	"everything",
	"on-this-machine",
	"commerce-shopping",
	"communication",
	"consumer-health",
	"creative",
	"data-analytics",
	"developer-tools",
	"education",
	"financial-services",
	"health-life-sciences",
	"legal",
	"media-entertainment",
	"nonprofit",
	"productivity",
	"sales-marketing",
	"travel",
	"other",
] as const

type CatalogueCategory = (typeof CATALOGUE_CATEGORIES)[number]

const EVERYTHING_CATEGORY: CatalogueCategory = "everything"

const HEADLESS_CATEGORIES: CatalogueCategory[] = [
	"everything",
	"on-this-machine",
]

const CATALOGUE_RAIL_ITEM_CLASS = cn(
	RAIL_ITEM_CLASS,
	"rounded-control text-sm/4.5",
)

const CATALOGUE_RAIL_BACK_CLASS =
	"rounded-control font-medium text-foreground text-sm/4.5"

const CARD_GRID_CLASS = "grid list-none grid-cols-3 gap-3 p-0"

const CARD_SHELL_CLASS =
	"flex h-full w-full min-w-0 flex-col gap-2 rounded-control border border-border p-3"

const SETUP_ICON = {
	signIn: Icons.ExternalLink,
	apiKey: Icons.Key,
	none: Icons.Check,
	unavailable: Icons.Blocked,
} as const satisfies Record<ApplicationSetup, Icon>

const SETUP_TONE = {
	signIn: undefined,
	apiKey: undefined,
	none: "text-state-connected",
	unavailable: "text-destructive",
} as const satisfies Record<ApplicationSetup, string | undefined>

type CatalogueCardProps = {
	application: CatalogueApplication
	onPick: () => void
}

const CatalogueCard = ({ application, onPick }: CatalogueCardProps) => {
	const { t } = useTranslation("bots")
	const SetupIcon = SETUP_ICON[application.setup]

	return (
		<li className="flex min-w-0">
			<button
				className={cn(
					CARD_SHELL_CLASS,
					"cursor-pointer text-start outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
				)}
				onClick={onPick}
				type="button"
			>
				<span className="flex min-w-0 items-center gap-2">
					<ApplicationMark mark={application.mark} size="sm" />
					<span className="truncate font-medium text-foreground text-sm/4.5">
						{application.name}
					</span>
				</span>
				{application.description ? (
					<span
						className="line-clamp-2 h-8 wrap-break-word text-muted-foreground text-xs/4"
						data-slot="catalogue-card-description"
					>
						{application.description}
					</span>
				) : null}
				<span
					className="flex min-w-0 items-center gap-1.25 text-muted-foreground text-xs/4"
					data-slot="catalogue-card-setup"
				>
					<SetupIcon
						aria-hidden="true"
						className={cn("size-3.25 shrink-0", SETUP_TONE[application.setup])}
					/>
					<span className="truncate">
						{t(`applications.catalogue.setup.${application.setup}`)}
					</span>
				</span>
			</button>
		</li>
	)
}

type CatalogueCardsProps = {
	applications: CatalogueApplication[]
	onPick: (application: CatalogueApplication) => void
}

const CatalogueCards = ({ applications, onPick }: CatalogueCardsProps) => (
	<ul className={CARD_GRID_CLASS}>
		{applications.map((application) => (
			<CatalogueCard
				application={application}
				key={application.id}
				onPick={() => onPick(application)}
			/>
		))}
	</ul>
)

const APPLICATION_SKELETON_LIST =
	"gap-2 [--skeleton-title:--spacing(16.5)] [--skeleton-sub:--spacing(19.5)] [&>:nth-child(3n+2)]:[--skeleton-title:--spacing(12)] [&>:nth-child(3n+2)]:[--skeleton-sub:--spacing(27.5)] [&>:nth-child(3n)]:[--skeleton-title:--spacing(18.5)] [&>:nth-child(3n)]:[--skeleton-sub:--spacing(21.5)]"

const ApplicationRowSkeleton = () => (
	<div className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
		<Skeleton className="size-9 shrink-0 animate-none rounded-md bg-border" />
		<div className="flex min-w-0 flex-1 flex-col gap-0.5">
			<div className="flex h-5 items-center">
				<SkeletonBar className="w-(--skeleton-title)" />
			</div>
			<div className="flex h-4 items-center gap-1.5">
				<SkeletonBar className="size-2 shrink-0" isFaint />
				<SkeletonBar className="w-(--skeleton-sub)" isFaint />
			</div>
		</div>
	</div>
)

type CatalogueLineProps = {
	icon: Icon
	text: string
	action?: ReactNode
}

const CatalogueLine = ({
	icon: LineIcon,
	text,
	action,
}: CatalogueLineProps) => (
	<div className="flex items-center gap-2.5 rounded-xl border border-border px-3 py-2">
		<LineIcon
			aria-hidden="true"
			className="size-4 shrink-0 text-muted-foreground"
		/>
		<p
			aria-live="polite"
			className="min-w-0 flex-1 wrap-break-word text-muted-foreground text-sm"
		>
			{text}
		</p>
		{action}
	</div>
)

type CataloguePageProps = {
	category: CatalogueCategory
	onCategoryChange: (category: CatalogueCategory) => void
	onBack: () => void
	className?: string
	children: ReactNode
}

const CataloguePage = ({
	category,
	onCategoryChange,
	onBack,
	className,
	children,
}: CataloguePageProps) => {
	const { t } = useTranslation("bots")

	return (
		<SettingsPushedPage
			backClassName={CATALOGUE_RAIL_BACK_CLASS}
			backLabel={t("applications.back")}
			className={cn("min-w-0", className)}
			onBack={onBack}
			onValueChange={(value) => onCategoryChange(value as CatalogueCategory)}
			value={category}
			rail={() =>
				CATALOGUE_CATEGORIES.map((id) => (
					<Tabs.Tab className={CATALOGUE_RAIL_ITEM_CLASS} key={id} value={id}>
						<span className="min-w-0 flex-1 wrap-break-word text-start">
							{t(`applications.catalogue.category.${id}`)}
						</span>
					</Tabs.Tab>
				))
			}
		>
			{children}
		</SettingsPushedPage>
	)
}

type CatalogueSectionHeadProps = {
	category: CatalogueCategory
}

const CatalogueSectionHead = ({ category }: CatalogueSectionHeadProps) => {
	const { t } = useTranslation("bots")

	return (
		<div className="flex flex-wrap items-baseline gap-x-2">
			<h3 className="font-medium text-foreground text-sm/4.5">
				{t(`applications.catalogue.category.${category}`)}
			</h3>
			<p className="text-muted-foreground text-xs/4">
				{t("applications.catalogue.directory")}
			</p>
		</div>
	)
}

type ApplicationsCatalogueProps = Omit<CataloguePageProps, "children"> & {
	query: string
	onQueryChange: (query: string) => void
	applications: CatalogueApplication[]
	isLoading?: boolean
	hasFailed?: boolean
	hasPartlyFailed?: boolean
	isStale?: boolean
	onRetry: () => void
	onPick: (application: CatalogueApplication) => void
}

const ApplicationsCatalogue = ({
	category,
	onCategoryChange,
	query,
	onQueryChange,
	applications,
	isLoading = false,
	hasFailed = false,
	hasPartlyFailed = false,
	isStale = false,
	onRetry,
	onPick,
	onBack,
	className,
}: ApplicationsCatalogueProps) => {
	const { t } = useTranslation("bots")
	const panel = useRef<HTMLDivElement>(null)
	useOverlayScrollbars(panel)
	const typed = query.trim()
	const phase = useSkeletonTiming(isLoading)
	const isAwaiting = phase === "delay" || phase === "skeleton"

	const retry = (
		<Button onClick={onRetry} size="xs" variant="outline">
			{t("applications.catalogue.retry")}
		</Button>
	)

	const results = () => {
		if (applications.length > 0) {
			return <CatalogueCards applications={applications} onPick={onPick} />
		}

		return (
			<CatalogueLine
				icon={Icons.Search}
				text={
					typed === ""
						? t("applications.catalogue.empty")
						: t("applications.catalogue.nothing", { query: typed })
				}
			/>
		)
	}

	const body = () => {
		if (isAwaiting) {
			return phase === "skeleton" ? (
				<ListSkeleton
					className={APPLICATION_SKELETON_LIST}
					row={<ApplicationRowSkeleton />}
				/>
			) : null
		}

		if (hasFailed) {
			return (
				<CatalogueLine
					action={retry}
					icon={Icons.Alert}
					text={t("applications.catalogue.failed")}
				/>
			)
		}

		return (
			<>
				{hasPartlyFailed ? (
					<CatalogueLine
						action={retry}
						icon={Icons.Alert}
						text={t("applications.catalogue.partlyFailed")}
					/>
				) : null}
				{isStale ? (
					<CatalogueLine
						icon={Icons.Info}
						text={t("applications.catalogue.stale")}
					/>
				) : null}
				{results()}
			</>
		)
	}

	return (
		<CataloguePage
			category={category}
			className={className}
			onBack={onBack}
			onCategoryChange={onCategoryChange}
		>
			<Tabs.Panel
				aria-busy={isAwaiting}
				className={cn(SETTINGS_PANEL_CLASS, "gap-3.5 overflow-y-auto")}
				ref={panel}
				value={category}
			>
				<div className="flex shrink-0 items-center">
					<ApplicationsSearchField
						onValueChange={onQueryChange}
						value={query}
					/>
				</div>
				<section
					className={cn(
						"flex flex-col gap-2",
						isAwaiting ? "min-h-0 flex-1" : "shrink-0",
					)}
				>
					{HEADLESS_CATEGORIES.includes(category) ? null : (
						<CatalogueSectionHead category={category} />
					)}
					{body()}
				</section>
			</Tabs.Panel>
			{isLoading ? (
				<span className="sr-only" role="status">
					{t("applications.catalogue.loading")}
				</span>
			) : null}
		</CataloguePage>
	)
}

export {
	type ApplicationSetup,
	ApplicationsCatalogue,
	type ApplicationsCatalogueProps,
	CATALOGUE_CATEGORIES,
	type CatalogueApplication,
	type CatalogueCategory,
	CataloguePage,
	type CataloguePageProps,
	EVERYTHING_CATEGORY,
}
