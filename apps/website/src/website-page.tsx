import type { ReactNode } from "react"

import { FaqList } from "@workspace/ui/components/faq-list"
import { Icons } from "@workspace/ui/components/icons"
import { Badge } from "@workspace/ui/components/ui/badge"

import { REPOSITORY_URL, WEBSITE_COPY } from "./copy"
import { DownloadMark } from "./page-marks"
import { FOCUS_RING, HEXAGON_SRC, PAGE_COLUMN, SiteMain } from "./site-chrome"
import { type DownloadPlatform, useDownloadTarget } from "./use-download-target"

const ACTION_BASE = `${FOCUS_RING} h-[46px] shrink-0 items-center gap-2 rounded-sm text-[15px] leading-5 font-medium whitespace-nowrap transition-[color,background-color,transform] duration-200 ease-out hover:will-change-transform active:will-change-transform active:transform-[scale(0.97)]`

const DOWNLOAD_LABEL: Record<DownloadPlatform, string> = {
	macos: WEBSITE_COPY.downloadActionMacOS,
	windows: WEBSITE_COPY.downloadActionWindows,
	linux: WEBSITE_COPY.downloadActionLinux,
	other: WEBSITE_COPY.downloadAction,
}

type ActionProps = {
	label: string
}

const DownloadAction = () => {
	const { href, onActivate, platform } = useDownloadTarget()

	return (
		<a
			className={`${ACTION_BASE} hidden bg-foreground ps-5 pe-4 text-background hover:bg-foreground/90 lg:inline-flex`}
			href={href}
			onClick={onActivate}
		>
			{DOWNLOAD_LABEL[platform]}
			<DownloadMark />
		</a>
	)
}

const GithubAction = ({ label }: ActionProps) => (
	<a
		className={`${ACTION_BASE} inline-flex bg-background ps-4.5 shadow-edge pe-3.5 text-foreground hover:bg-accent`}
		href={REPOSITORY_URL}
	>
		{label}
		<Icons.GitHub size={15} />
	</a>
)

type AppWindowProps = {
	children?: ReactNode
}

const AppWindow = ({ children }: AppWindowProps) => (
	<div
		className={`${PAGE_COLUMN} scene-frozen relative hidden h-[700px] overflow-clip rounded-[16px] bg-sidebar shadow-frame lg:block dark:shadow-frame-dark`}
	>
		{children}
	</div>
)

type SectionTitleProps = {
	title: string
	subtitle?: string
}

const SectionTitle = ({ title, subtitle }: SectionTitleProps) => (
	<h2 className="font-heading text-[28px] text-balance leading-[34px] font-medium tracking-[-0.028em] text-foreground">
		<span className="block">{title}</span>
		{subtitle && (
			<span className="block text-muted-foreground">{subtitle}</span>
		)}
	</h2>
)

type FeatureColumn = {
	name: string
	body: string
}

type FeatureSectionProps = SectionTitleProps & {
	columns: readonly FeatureColumn[]
	id: string
	className: string
}

const FeatureSection = ({
	title,
	subtitle,
	columns,
	id,
	className,
}: FeatureSectionProps) => (
	<section
		className={`${PAGE_COLUMN} flex flex-col gap-10 wrap-break-word ${className}`}
		id={id}
	>
		<SectionTitle subtitle={subtitle} title={title} />
		<ul className="grid gap-10 lg:grid-cols-3">
			{columns.map(({ name, body }) => (
				<li className="flex flex-col gap-1 text-reading" key={name}>
					<h3 className="font-medium text-foreground">{name}</h3>
					<p className="text-muted-foreground">{body}</p>
				</li>
			))}
		</ul>
	</section>
)

const PLAN_CARD =
	"flex flex-col gap-6 rounded-[16px] bg-card p-6 shadow-edge lg:gap-7 lg:p-7"

const PLAN_NAME = "text-reading font-medium text-foreground"

const PLAN_NOTE = "text-reading text-muted-foreground"

const PRICE_FIGURE = "text-[44px] leading-12 tracking-[-0.03em]"

type PlanFeaturesProps = {
	features: readonly string[]
}

const PlanFeatures = ({ features }: PlanFeaturesProps) => (
	<ul className="flex grow flex-col gap-2.5 border-t border-border pt-6">
		{features.map((feature) => (
			<li
				className="flex items-start gap-2.5 text-reading text-foreground"
				key={feature}
			>
				<span className="flex h-[22px] w-4 shrink-0 items-center">
					<Icons.Check
						aria-hidden="true"
						className="size-4 text-muted-foreground"
					/>
				</span>
				{feature}
			</li>
		))}
	</ul>
)

const LocalPlan = () => {
	const { name, description, price, features } = WEBSITE_COPY.pricing.local

	return (
		<article className={PLAN_CARD}>
			<header className="flex flex-col gap-1">
				<h3 className={PLAN_NAME}>{name}</h3>
				<p className={PLAN_NOTE}>{description}</p>
			</header>
			<p className={`${PRICE_FIGURE} h-12 font-medium text-foreground lg:h-19`}>
				{price}
			</p>
			<PlanFeatures features={features} />
			<div className="hidden lg:flex">
				<DownloadAction />
			</div>
		</article>
	)
}

const ProPlan = () => {
	const {
		name,
		betaTag,
		description,
		monthlyPrice,
		price,
		period,
		billing,
		features,
		fineprint,
	} = WEBSITE_COPY.pricing.pro

	return (
		<article className={PLAN_CARD}>
			<header className="flex flex-col gap-1">
				<div className="flex items-center gap-1">
					<h3 className={PLAN_NAME}>{name}</h3>
					<Badge variant="secondary">{betaTag}</Badge>
				</div>
				<p className={PLAN_NOTE}>{description}</p>
			</header>
			<div className="flex flex-col gap-1.5">
				<p className="flex flex-wrap items-baseline gap-x-2 gap-y-1.5">
					<del
						className={`${PRICE_FIGURE} text-struck-price decoration-1 dark:text-struck-price-dark`}
					>
						{monthlyPrice}
					</del>
					<span className={`${PRICE_FIGURE} font-medium text-foreground`}>
						{price}
					</span>
					<span className={`${PLAN_NOTE} whitespace-nowrap`}>{period}</span>
				</p>
				<p className={PLAN_NOTE}>{billing}</p>
			</div>
			<PlanFeatures features={features} />
			<p className="flex items-center font-mono text-xs leading-4 tracking-[0.08em] text-muted-foreground uppercase lg:h-11.5">
				{fineprint}
			</p>
		</article>
	)
}

const PricingSection = () => (
	<section
		className={`${PAGE_COLUMN} flex flex-col gap-10 pt-32 wrap-break-word`}
		id="pricing"
	>
		<SectionTitle
			subtitle={WEBSITE_COPY.pricing.subtitle}
			title={WEBSITE_COPY.pricing.title}
		/>
		<div className="grid gap-4 lg:grid-cols-2">
			<LocalPlan />
			<ProPlan />
		</div>
	</section>
)

const FAQ_OPEN_ON_LOAD = WEBSITE_COPY.faq.items.map(({ question }) => question)

const FaqSection = () => (
	<section
		className={`${PAGE_COLUMN} flex flex-col gap-8 pt-40 wrap-break-word`}
		id="faq"
	>
		<SectionTitle title={WEBSITE_COPY.faq.title} />
		<div className="w-full max-w-[760px]">
			<FaqList defaultOpen={FAQ_OPEN_ON_LOAD} items={WEBSITE_COPY.faq.items} />
		</div>
	</section>
)

type WebsitePageProps = {
	children?: ReactNode
}

export const WebsitePage = ({ children }: WebsitePageProps) => (
	<SiteMain>
		<div
			className={`${PAGE_COLUMN} flex flex-col items-start gap-[18px] pt-[88px] pb-16 wrap-break-word`}
		>
			<img
				alt=""
				className="h-[67px] w-[74px] shrink-0 dark:invert"
				src={HEXAGON_SRC}
			/>
			<h1 className="font-heading text-[28px] text-balance leading-[34px] font-medium tracking-[-0.028em] text-foreground lg:text-[54px] lg:leading-[60px]">
				{WEBSITE_COPY.headline}
			</h1>
			<p className="max-w-[600px] text-base leading-6 text-pretty text-muted-foreground lg:text-[19px] lg:leading-7">
				{WEBSITE_COPY.lead}
			</p>
			<div className="flex flex-col items-start gap-3.5 pt-1.5">
				<div className="flex flex-col items-start gap-2 lg:flex-row">
					<p className="max-w-[302px] text-[15px] leading-[22px] text-foreground lg:hidden">
						{WEBSITE_COPY.mobileNote}
					</p>
					<DownloadAction />
					<GithubAction label={WEBSITE_COPY.githubAction} />
				</div>
				<p className="font-mono text-xs leading-4 tracking-[0.08em] text-muted-foreground uppercase">
					{WEBSITE_COPY.fineprint}
				</p>
			</div>
		</div>
		<AppWindow>{children}</AppWindow>
		<FeatureSection
			{...WEBSITE_COPY.threeWays}
			className="pt-40"
			id="three-ways"
		/>
		<FeatureSection {...WEBSITE_COPY.yours} className="pt-32" id="yours" />
		<PricingSection />
		<FaqSection />
	</SiteMain>
)
