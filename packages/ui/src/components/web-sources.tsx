import { createContext, type ReactNode, useContext, useState } from "react"
import { useTranslation } from "react-i18next"

import { companionSeed } from "@workspace/ui/components/companion-field"
import { hueStyle } from "@workspace/ui/components/hue-palette"
import { HUE_PRESETS } from "@workspace/ui/components/hue-tones"
import { Icons } from "@workspace/ui/components/icons"
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@workspace/ui/components/ui/collapsible"
import { cn } from "@workspace/ui/lib/utils"

type WebSource = {
	url: string
	domain: string
	title?: string
	favicon?: string
}

type WebSourcesProps = {
	pages: readonly WebSource[]
	onOpenSource: (url: string) => void
	open?: boolean
	defaultOpen?: boolean
	onOpenChange?: (open: boolean) => void
	children: ReactNode
}

type WebSourcesContextValue = Pick<WebSourcesProps, "pages" | "onOpenSource">

type FaviconProps = {
	page: WebSource
	isRinged?: boolean
	className?: string
}

type SourceRowProps = {
	page: WebSource
}

const STACKED_FAVICONS = 3

const LETTER_HUES = Object.values(HUE_PRESETS)

const PILL =
	"flex h-7 w-fit min-w-0 max-w-full items-center gap-1.5 rounded-full border border-foreground/8 bg-foreground/6 p-0.75 font-medium text-compact text-soft-foreground leading-4 outline-offset-2 hover:bg-foreground/8 active:bg-foreground/12"

const PILL_TOGGLE =
	"group/sources data-panel-open:border-foreground/16 data-panel-open:bg-foreground/12"

const BUBBLE_RING =
	"shadow-[0_0_0_2px_var(--bubble-surface,var(--bubble)),0_0_0_2px_var(--card)]"

const TRAILING_ICON = "size-4 shrink-0 text-muted-foreground"

const WebSourcesContext = createContext<WebSourcesContextValue | null>(null)

const useWebSources = () => {
	const value = useContext(WebSourcesContext)
	if (!value) throw new Error("A WebSources part renders inside WebSources.")
	return value
}

const letterHueOf = (domain: string) =>
	LETTER_HUES[companionSeed(domain) % LETTER_HUES.length] ?? HUE_PRESETS.blue

const titleOf = (page: WebSource) => page.title?.trim() ?? ""

const useOpenLabel = () => {
	const { t } = useTranslation("chat")
	return (page: WebSource) => {
		const title = titleOf(page)
		return title
			? t("webSources.openTitled", { title, domain: page.domain })
			: t("webSources.open", { name: page.domain })
	}
}

const Favicon = ({ page, isRinged = false, className }: FaviconProps) => {
	const [brokenSrc, setBrokenSrc] = useState<string | null>(null)
	const { favicon, domain } = page

	return (
		<span
			aria-hidden="true"
			data-slot="web-source-favicon"
			className={cn(
				"pointer-events-none grid size-5 shrink-0 place-items-center overflow-hidden rounded-full",
				isRinged && BUBBLE_RING,
				className,
			)}
		>
			{favicon && brokenSrc !== favicon ? (
				<img
					src={favicon}
					alt=""
					onError={() => setBrokenSrc(favicon)}
					className="size-full object-cover"
				/>
			) : (
				<span
					data-slot="web-source-letter"
					style={hueStyle(letterHueOf(domain))}
					className="grid size-full place-items-center bg-(--hue-light-accent) font-bold text-[9px] text-white leading-none dark:bg-(--hue-dark-bubble)"
				>
					{domain.charAt(0).toUpperCase()}
				</span>
			)}
		</span>
	)
}

const WebSources = ({
	pages,
	onOpenSource,
	open,
	defaultOpen,
	onOpenChange,
	children,
}: WebSourcesProps) => (
	<WebSourcesContext.Provider value={{ pages, onOpenSource }}>
		<Collapsible
			open={open}
			defaultOpen={defaultOpen}
			onOpenChange={onOpenChange}
			className="contents"
		>
			{children}
		</Collapsible>
	</WebSourcesContext.Provider>
)

const WebSourcesButton = () => {
	const { t } = useTranslation("chat")
	const { pages, onOpenSource } = useWebSources()
	const openLabel = useOpenLabel()
	const [single] = pages

	if (!single) return null

	if (pages.length === 1)
		return (
			<button
				type="button"
				data-slot="web-sources-button"
				aria-label={openLabel(single)}
				onClick={() => onOpenSource(single.url)}
				className={PILL}
			>
				<Favicon page={single} isRinged />
				<span className="min-w-0 truncate">{single.domain}</span>
				<Icons.ArrowUpRight aria-hidden="true" className={TRAILING_ICON} />
			</button>
		)

	return (
		<CollapsibleTrigger
			data-slot="web-sources-button"
			className={cn(PILL, PILL_TOGGLE)}
		>
			<span className="flex shrink-0">
				{pages.slice(0, STACKED_FAVICONS).map((page, position) => (
					<Favicon
						// biome-ignore lint/suspicious/noArrayIndexKey: two pages may share a url, the stack is a fixed slot list
						key={position}
						page={page}
						isRinged
						className={position > 0 ? "-ms-1.5" : undefined}
					/>
				))}
			</span>
			<span className="min-w-0 truncate">
				{t("webSources.counted", { count: pages.length })}
			</span>
			<Icons.Expand
				aria-hidden="true"
				className={cn(TRAILING_ICON, "group-data-panel-open/sources:hidden")}
			/>
			<Icons.Collapse
				aria-hidden="true"
				className={cn(
					TRAILING_ICON,
					"hidden text-soft-foreground group-data-panel-open/sources:block",
				)}
			/>
		</CollapsibleTrigger>
	)
}

const SourceRow = ({ page }: SourceRowProps) => {
	const { onOpenSource } = useWebSources()
	const openLabel = useOpenLabel()
	const title = titleOf(page)

	return (
		<li>
			<button
				type="button"
				data-slot="web-source-row"
				aria-label={openLabel(page)}
				onClick={() => onOpenSource(page.url)}
				className="group/source flex w-full min-w-0 items-center gap-3 rounded-md p-2 text-start outline-offset-2 hover:bg-foreground/6 active:bg-foreground/12"
			>
				<Favicon page={page} />
				<span className="flex min-w-0 flex-1 flex-col gap-0.5">
					<span className="truncate font-medium text-compact leading-4.5">
						{title || page.domain}
					</span>
					{title ? (
						<span className="truncate text-muted-foreground text-xs leading-4">
							{page.domain}
						</span>
					) : null}
				</span>
				<Icons.ArrowUpRight
					aria-hidden="true"
					className={cn(TRAILING_ICON, "group-hover/source:text-foreground")}
				/>
			</button>
		</li>
	)
}

const WebSourcesList = () => {
	const { t } = useTranslation("chat")
	const { pages } = useWebSources()

	if (pages.length < 2) return null

	return (
		<CollapsibleContent
			data-slot="web-sources-list"
			className="w-full min-w-0 self-stretch border-foreground/8 border-t pt-2"
		>
			<ul aria-label={t("webSources.list")} className="flex flex-col gap-0.5">
				{pages.map((page, position) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: two pages may share a url, a row is a fixed slot of the list
					<SourceRow key={position} page={page} />
				))}
			</ul>
		</CollapsibleContent>
	)
}

export {
	type WebSource,
	WebSources,
	WebSourcesButton,
	WebSourcesList,
	type WebSourcesProps,
}
