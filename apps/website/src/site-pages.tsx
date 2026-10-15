import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"

import { ISSUES_URL } from "./copy"
import { FOCUS_RING, HEXAGON_SRC, PAGE_COLUMN, SiteMain } from "./site-chrome"
import { SITE_PAGES_COPY, SUPPORT_EMAIL } from "./site-pages-copy"

const TEXT_LINK = `${FOCUS_RING} rounded-sm text-foreground underline underline-offset-4 transition-colors hover:text-muted-foreground`

type SectionBlock = string | readonly string[]

type PageSection = {
	heading: string
	body: string | readonly SectionBlock[]
}

type SitePageProps = {
	title: string
	children: ReactNode
}

const SitePage = ({ title, children }: SitePageProps) => (
	<SiteMain>
		<article
			className={`${PAGE_COLUMN} flex flex-col items-start gap-12 pt-[88px] wrap-break-word`}
		>
			<header className="flex flex-col items-start gap-[18px]">
				<Link
					aria-label={SITE_PAGES_COPY.homeLink}
					className={`${FOCUS_RING} rounded-sm`}
					to="/"
				>
					<img
						alt=""
						className="h-[67px] w-[74px] shrink-0 dark:invert"
						src={HEXAGON_SRC}
					/>
				</Link>
				<h1 className="font-heading text-[28px] text-balance leading-[34px] font-medium tracking-[-0.028em] text-foreground lg:text-[54px] lg:leading-[60px]">
					{title}
				</h1>
			</header>
			<div className="flex w-full max-w-[760px] flex-col gap-10">
				{children}
			</div>
		</article>
	</SiteMain>
)

type SectionProps = PageSection & {
	children?: ReactNode
}

type SectionBlockViewProps = {
	block: SectionBlock
}

const SectionBlockView = ({ block }: SectionBlockViewProps) => {
	if (typeof block === "string")
		return <p className="text-muted-foreground">{block}</p>
	return (
		<ul className="flex list-disc flex-col gap-1 ps-5 text-muted-foreground">
			{block.map((item) => (
				<li key={item}>{item}</li>
			))}
		</ul>
	)
}

const toBlocks = (body: PageSection["body"]) =>
	typeof body === "string" ? [body] : body

const Section = ({ heading, body, children }: SectionProps) => (
	<section className="flex flex-col gap-2 text-reading">
		<h2 className="font-medium text-foreground">{heading}</h2>
		{toBlocks(body).map((block) => (
			<SectionBlockView block={block} key={String(block)} />
		))}
		{children}
	</section>
)

const renderSections = (sections: readonly PageSection[]) =>
	sections.map((section) => <Section key={section.heading} {...section} />)

export const PrivacyPage = () => (
	<SitePage title={SITE_PAGES_COPY.privacy.title}>
		{renderSections(SITE_PAGES_COPY.privacy.sections)}
	</SitePage>
)

export const TermsPage = () => {
	const { title, sections, contact } = SITE_PAGES_COPY.terms

	return (
		<SitePage title={title}>
			{renderSections(sections)}
			<Section {...contact}>
				<p>
					<a className={TEXT_LINK} href={`mailto:${SUPPORT_EMAIL}`}>
						{SUPPORT_EMAIL}
					</a>
				</p>
			</Section>
		</SitePage>
	)
}

export const SupportPage = () => {
	const { title, topics, contact, details, privacy, response, operator } =
		SITE_PAGES_COPY.support

	return (
		<SitePage title={title}>
			<Section {...topics} />
			<Section body={contact.body} heading={contact.heading}>
				<p>
					<a className={TEXT_LINK} href={`mailto:${SUPPORT_EMAIL}`}>
						{SUPPORT_EMAIL}
					</a>
				</p>
				<p>
					<a className={TEXT_LINK} href={ISSUES_URL}>
						{contact.issuesLink}
					</a>
				</p>
			</Section>
			{renderSections([details, privacy, response, operator])}
		</SitePage>
	)
}
