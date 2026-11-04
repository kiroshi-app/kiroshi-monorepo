import type { ComponentPropsWithoutRef } from "react"
import type { ExtraProps } from "react-markdown"

import { hostInitial } from "@workspace/ui/lib/host"

export type MarkdownLinkProps = ComponentPropsWithoutRef<"a"> & ExtraProps

const EXTERNAL_SCHEMES = new Set(["http:", "https:"])
const IN_PLACE_SCHEMES = new Set(["mailto:", "tel:"])

const linkUrl = (href: string) => {
	try {
		return new URL(href.startsWith("//") ? `https:${href}` : href)
	} catch {
		return null
	}
}

const TEXT_CLASS = "inline-block max-w-full truncate align-bottom"
const HOST_CLASS = "whitespace-nowrap font-normal"

const MARK_CLASS =
	"mr-1 inline-grid size-3.5 select-none place-items-center rounded-xs bg-current/10 align-middle text-[0.65em] uppercase leading-none"

export const MarkdownLink = ({
	node,
	children,
	className,
	href,
	title,
	...props
}: MarkdownLinkProps) => {
	const url = href ? linkUrl(href) : null
	const destination = url && EXTERNAL_SCHEMES.has(url.protocol) ? url : null
	const isAnchored =
		href?.startsWith("#") ||
		destination !== null ||
		(url !== null && IN_PLACE_SCHEMES.has(url.protocol))

	if (!isAnchored) return <>{children}</>

	if (destination === null) {
		return (
			<a {...props} href={href} title={title} className={className}>
				{children}
			</a>
		)
	}

	return (
		<a
			{...props}
			href={href}
			title={title ?? href}
			className={className}
			target="_blank"
			rel="noreferrer noopener"
		>
			<span className={TEXT_CLASS}>{children}</span>{" "}
			<span
				aria-hidden="true"
				data-slot="markdown-link-mark"
				className={MARK_CLASS}
			>
				{hostInitial(destination.href)}
			</span>
			<span data-slot="markdown-link-host" className={HOST_CLASS}>
				({destination.host})
			</span>
		</a>
	)
}

export const MarkdownStaticLink = ({ children }: MarkdownLinkProps) => (
	<>{children}</>
)
