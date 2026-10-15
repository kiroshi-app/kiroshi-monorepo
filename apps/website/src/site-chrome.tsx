import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"

import { SkipLink } from "@workspace/ui/components/skip-link"

import { AUTHOR_URL, AUTHOR_X_URL, WEBSITE_COPY } from "./copy"
import { SITE_PAGES_COPY } from "./site-pages-copy"

export const HEXAGON_SRC = "/hexagon.svg"

export const PAGE_COLUMN = "w-full max-w-[1200px] shrink-0"

export const FOCUS_RING =
	"outline-none focus-visible:shadow-focus-edge focus-visible:ring-3 focus-visible:ring-ring/30"

const MAIN_CONTENT_ID = "main-content"

const FOOTER_LINK = `${FOCUS_RING} -my-3 inline-flex rounded-sm py-3 transition-colors hover:text-foreground`

const FOOTER_TEXT =
	"font-mono text-xs leading-4 tracking-[0.08em] text-muted-foreground"

const PAGE_LINKS = [
	{ to: "/privacy", label: SITE_PAGES_COPY.privacy.navLabel },
	{ to: "/terms", label: SITE_PAGES_COPY.terms.navLabel },
	{ to: "/support", label: SITE_PAGES_COPY.support.navLabel },
] as const

const Credit = () => (
	<div className="flex items-center gap-2.5">
		<img
			alt=""
			className="size-6 shrink-0 object-contain dark:invert"
			src={HEXAGON_SRC}
		/>
		<p className={`${FOOTER_TEXT} flex flex-wrap items-center gap-1.5`}>
			<a
				aria-label={WEBSITE_COPY.creditDestination}
				className={FOOTER_LINK}
				href={AUTHOR_URL}
				rel="noreferrer noopener"
				target="_blank"
			>
				{WEBSITE_COPY.credit}
			</a>
			<span aria-hidden="true">{WEBSITE_COPY.creditSeparator}</span>
			<a
				className={FOOTER_LINK}
				href={AUTHOR_X_URL}
				rel="noreferrer noopener"
				target="_blank"
			>
				{WEBSITE_COPY.creditHandle}
			</a>
		</p>
	</div>
)

const PageLinks = () => (
	<nav aria-label={SITE_PAGES_COPY.footerNavigation}>
		<ul
			className={`${FOOTER_TEXT} flex flex-wrap items-center gap-x-5 gap-y-2`}
		>
			{PAGE_LINKS.map(({ to, label }) => (
				<li key={to}>
					<Link className={FOOTER_LINK} to={to}>
						{label}
					</Link>
				</li>
			))}
		</ul>
	</nav>
)

const SiteFooter = () => (
	<footer
		className={`${PAGE_COLUMN} flex flex-wrap items-center justify-between gap-x-8 gap-y-4 pt-40 pb-12`}
	>
		<Credit />
		<PageLinks />
	</footer>
)

type SiteMainProps = {
	children: ReactNode
}

export const SiteMain = ({ children }: SiteMainProps) => (
	<>
		<SkipLink label={WEBSITE_COPY.skipLink} targetId={MAIN_CONTENT_ID} />
		<main
			className="flex min-h-dvh w-full flex-col items-center overflow-x-clip bg-background px-7 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring"
			id={MAIN_CONTENT_ID}
			tabIndex={-1}
		>
			{children}
			<SiteFooter />
		</main>
	</>
)
