"use client"

import { Tabs } from "@base-ui/react/tabs"
import { type ReactNode, useLayoutEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { ContextMenuPressTrigger } from "@workspace/ui/components/context-menu-press-trigger"
import { Icons } from "@workspace/ui/components/icons"
import { NEEDS_YOU_GLYPH } from "@workspace/ui/components/row-anatomy"
import {
	TITLE_BAR_MENU,
	TITLE_BAR_MENU_ROW,
} from "@workspace/ui/components/title-bar-menu"
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@workspace/ui/components/ui/context-menu"
import { useStableCallback } from "@workspace/ui/hooks/use-stable-callback"
import { STILL_UNDER_REDUCED_MOTION } from "@workspace/ui/lib/reduced-motion"
import { cn } from "@workspace/ui/lib/utils"

type TitleBarTab = {
	id: string
	title: string
	icon: ReactNode
	isPinned?: boolean
	isNeedingYou?: boolean
}

type TitleBarTabsProps = {
	tabs?: TitleBarTab[]
	activeTabId?: string
	canGoBack?: boolean
	canGoForward?: boolean
	onSelectTab?: (id: string) => void
	onCloseTab?: (id: string) => void
	onPinTab?: (id: string) => void
	onUnpinTab?: (id: string) => void
	onCloseOtherTabs?: (id: string) => void
	onNewTab?: () => void
	onGoBack?: () => void
	onGoForward?: () => void
}

const STRIP = "flex min-w-0 flex-1 items-center gap-1 self-stretch"

const HISTORY = "flex shrink-0 items-center gap-0.5 pe-1"

const BAR_BUTTON =
	"grid size-7 shrink-0 place-items-center rounded-sm text-muted-foreground hover:bg-title-bar-highlight hover:text-foreground focus-visible:outline-2 focus-visible:outline-foreground focus-visible:outline-offset-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-3.75"

const TABS = "relative flex min-w-0"

const TAB_ROW = "flex min-w-0 flex-1 items-center gap-1"

const CLOSE_LAYER = "pointer-events-none absolute inset-0"

const TAB_WIDTH = "w-44 min-w-26"

const TAB_WIDTH_AT_FLOOR = "w-26 min-w-26"

const PINNED_WIDTH = "size-7 shrink-0"

const DIVIDER = "h-4 w-px shrink-0"

const TAB_ICON =
	"pointer-events-none grid size-4 shrink-0 place-items-center [&>svg]:size-3.75"

const TAB =
	"flex h-7 items-center gap-1.5 rounded-md bg-title-bar-tab px-2 text-muted-foreground hover:bg-title-bar-highlight hover:text-foreground focus-visible:outline-2 focus-visible:outline-foreground focus-visible:outline-offset-1 aria-selected:bg-title-bar-tab-selected aria-selected:pe-7.25 aria-selected:text-foreground"

const PINNED_TAB =
	"grid place-items-center rounded-md bg-title-bar-pinned text-muted-foreground hover:bg-title-bar-highlight hover:text-foreground focus-visible:outline-2 focus-visible:outline-foreground focus-visible:outline-offset-1 aria-selected:bg-title-bar-tab-selected aria-selected:text-foreground"

const TAB_TITLE = "min-w-0 truncate font-medium text-compact leading-4"

const TAB_NEEDS_YOU = cn(NEEDS_YOU_GLYPH, "size-3.25")

const CLOSE_SLOT = "flex h-7 items-center justify-end pe-1.25"

const CLOSE_BUTTON =
	"pointer-events-auto grid size-4.5 place-items-center rounded-[5px] text-muted-foreground hover:bg-title-bar-highlight hover:text-foreground focus-visible:outline-2 focus-visible:outline-foreground focus-visible:outline-offset-1 [&_svg]:size-3"

const OVERFLOW_CHIP =
	"flex h-7 shrink-0 items-center gap-1 rounded-md bg-title-bar-chip ps-2 pe-1.5 font-medium text-foreground text-xs hover:bg-title-bar-tab-selected focus-visible:outline-2 focus-visible:outline-foreground focus-visible:outline-offset-1 aria-expanded:bg-title-bar-tab-selected [&_svg]:size-3"

const OVERFLOW_ICON =
	"grid size-4 shrink-0 place-items-center [&>svg]:size-3.75!"

const DRAG_REGION = "min-w-6 flex-1 self-stretch"

const UNPINNED_TAB = '[data-slot="title-bar-tab"]'

const widthOf = (element: Element) => element.getBoundingClientRect().width

const pixelsOf = (value: string) => Number.parseFloat(value) || 0

const EVERY_TAB = Number.POSITIVE_INFINITY

const fittingTabCount = (strip: HTMLElement, unpinnedCount: number) => {
	const list = strip.querySelector<HTMLElement>('[role="tablist"]')
	const tab = list?.querySelector(UNPINNED_TAB)
	const dragRegion = strip.querySelector('[data-slot="title-bar-drag-region"]')
	if (!list || !tab || !dragRegion || strip.clientWidth === 0) return EVERY_TAB

	const chip = strip.querySelector('[data-slot="title-bar-overflow"]')
	const stripGap = pixelsOf(getComputedStyle(strip).columnGap)
	const listGap = pixelsOf(getComputedStyle(list).columnGap)
	const floor = pixelsOf(getComputedStyle(tab).minWidth)
	const besideTabs = [...strip.children].filter(
		(child) =>
			child !== list.parentElement && child !== chip && child !== dragRegion,
	)
	const pinned = [...list.children].filter(
		(child) => !child.matches(UNPINNED_TAB),
	)
	const room =
		strip.clientWidth -
		pixelsOf(getComputedStyle(dragRegion).minWidth) -
		stripGap -
		besideTabs.reduce((sum, child) => sum + widthOf(child) + stripGap, 0) -
		pinned.reduce((sum, child) => sum + widthOf(child) + listGap, 0)
	const fitting = (width: number) =>
		Math.floor((width + listGap) / (floor + listGap))

	if (fitting(room) >= unpinnedCount) return EVERY_TAB
	const chipWidth = chip ? widthOf(chip) + stripGap : 0
	return Math.max(1, fitting(room - chipWidth))
}

const useFittingTabCount = (unpinnedCount: number) => {
	const stripRef = useRef<HTMLDivElement>(null)
	const [fittingCount, setFittingCount] = useState(EVERY_TAB)
	const measure = useStableCallback(() => {
		const strip = stripRef.current
		if (!strip) return
		const next = fittingTabCount(strip, unpinnedCount)
		if (next !== fittingCount) setFittingCount(next)
	})

	useLayoutEffect(measure)
	useLayoutEffect(() => {
		const strip = stripRef.current
		if (!strip) return
		const observer = new ResizeObserver(measure)
		observer.observe(strip)
		return () => observer.disconnect()
	}, [measure])

	return { stripRef, fittingCount }
}

const splitAtFit = (
	unpinned: TitleBarTab[],
	fittingCount: number,
	activeTabId?: string,
) => {
	const active = unpinned.find((tab) => tab.id === activeTabId)
	const leading = unpinned.slice(0, fittingCount)
	const kept =
		active && !leading.includes(active)
			? [...leading.slice(0, -1), active]
			: leading
	return {
		kept,
		overflowing: unpinned.filter((tab) => !kept.includes(tab)),
	}
}

type TabGestures = Pick<
	TitleBarTabsProps,
	"onPinTab" | "onUnpinTab" | "onCloseOtherTabs"
>

type TitleBarTabItemProps = TabGestures & {
	tab: TitleBarTab
	isActive: boolean
	width: string
}

const TitleBarTabItem = ({
	tab,
	isActive,
	width,
	onPinTab,
	onUnpinTab,
	onCloseOtherTabs,
}: TitleBarTabItemProps) => {
	const { t } = useTranslation("common")
	const needsYou = Boolean(tab.isNeedingYou) && !isActive

	return (
		<ContextMenu>
			<ContextMenuTrigger
				render={
					<Tabs.Tab
						aria-label={
							needsYou
								? t("titleBar.tabNeedsYou", { title: tab.title })
								: tab.isPinned
									? tab.title
									: undefined
						}
						className={cn(tab.isPinned ? PINNED_TAB : TAB, width)}
						data-slot={tab.isPinned ? "title-bar-pinned-tab" : "title-bar-tab"}
						value={tab.id}
					/>
				}
			>
				<span aria-hidden="true" className={TAB_ICON}>
					{tab.icon}
				</span>
				{tab.isPinned ? null : (
					<>
						{needsYou ? (
							<span
								aria-hidden="true"
								className={TAB_NEEDS_YOU}
								data-slot="title-bar-tab-needs-you"
							/>
						) : null}
						<span className={cn(TAB_TITLE, needsYou && "text-warning")}>
							{tab.title}
						</span>
					</>
				)}
			</ContextMenuTrigger>
			<ContextMenuContent
				className={cn(TITLE_BAR_MENU, "w-55", STILL_UNDER_REDUCED_MOTION)}
			>
				<ContextMenuItem
					className={TITLE_BAR_MENU_ROW}
					onClick={() => (tab.isPinned ? onUnpinTab : onPinTab)?.(tab.id)}
				>
					{t(tab.isPinned ? "titleBar.unpinTab" : "titleBar.pinTab")}
				</ContextMenuItem>
				<ContextMenuItem
					className={TITLE_BAR_MENU_ROW}
					onClick={() => onCloseOtherTabs?.(tab.id)}
				>
					{t("titleBar.closeOtherTabs")}
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	)
}

type OverflowChipProps = {
	tabs: TitleBarTab[]
	onSelectTab?: (id: string) => void
}

const OverflowChip = ({ tabs, onSelectTab }: OverflowChipProps) => {
	const { t } = useTranslation("common")

	return (
		<ContextMenu>
			<ContextMenuPressTrigger
				edge="end"
				render={
					<button
						className={OVERFLOW_CHIP}
						data-slot="title-bar-overflow"
						type="button"
					>
						{t("titleBar.more", { count: tabs.length })}
						<Icons.Expand aria-hidden="true" />
					</button>
				}
			/>
			<ContextMenuContent
				className={cn(TITLE_BAR_MENU, "w-72.5", STILL_UNDER_REDUCED_MOTION)}
				side="inline-start"
			>
				{tabs.map((tab) => (
					<ContextMenuItem
						className={TITLE_BAR_MENU_ROW}
						key={tab.id}
						onClick={() => onSelectTab?.(tab.id)}
					>
						<span aria-hidden="true" className={OVERFLOW_ICON}>
							{tab.icon}
						</span>
						<span className="min-w-0 truncate">{tab.title}</span>
					</ContextMenuItem>
				))}
			</ContextMenuContent>
		</ContextMenu>
	)
}

const TitleBarTabs = ({
	tabs = [],
	activeTabId,
	canGoBack = false,
	canGoForward = false,
	onSelectTab,
	onCloseTab,
	onPinTab,
	onUnpinTab,
	onCloseOtherTabs,
	onNewTab,
	onGoBack,
	onGoForward,
}: TitleBarTabsProps) => {
	const { t } = useTranslation("common")
	const pinned = tabs.filter((tab) => tab.isPinned)
	const unpinned = tabs.filter((tab) => !tab.isPinned)
	const { stripRef, fittingCount } = useFittingTabCount(unpinned.length)
	const { kept, overflowing } = splitAtFit(unpinned, fittingCount, activeTabId)
	const tabWidth = overflowing.length > 0 ? TAB_WIDTH_AT_FLOOR : TAB_WIDTH
	const hasDivider = pinned.length > 0 && unpinned.length > 0
	const tabItem = (tab: TitleBarTab, width: string) => (
		<TitleBarTabItem
			isActive={tab.id === activeTabId}
			key={tab.id}
			onCloseOtherTabs={onCloseOtherTabs}
			onPinTab={onPinTab}
			onUnpinTab={onUnpinTab}
			tab={tab}
			width={width}
		/>
	)

	return (
		<div className={STRIP} data-slot="title-bar-tabs" ref={stripRef}>
			<div className={HISTORY} data-slot="title-bar-history">
				<button
					aria-label={t("titleBar.back")}
					className={BAR_BUTTON}
					disabled={!canGoBack}
					onClick={onGoBack}
					type="button"
				>
					<Icons.Previous aria-hidden="true" />
				</button>
				<button
					aria-label={t("titleBar.forward")}
					className={BAR_BUTTON}
					disabled={!canGoForward}
					onClick={onGoForward}
					type="button"
				>
					<Icons.Next aria-hidden="true" />
				</button>
			</div>
			<Tabs.Root
				className={TABS}
				onValueChange={(id: string) => onSelectTab?.(id)}
				value={activeTabId ?? null}
			>
				<Tabs.List aria-label={t("titleBar.tabs")} className={TAB_ROW}>
					{pinned.map((tab) => tabItem(tab, PINNED_WIDTH))}
					{hasDivider ? (
						<span
							aria-hidden="true"
							className={cn(DIVIDER, "bg-title-bar-divider")}
							data-slot="title-bar-pinned-divider"
						/>
					) : null}
					{kept.map((tab) => tabItem(tab, tabWidth))}
				</Tabs.List>
				<div className={cn(TAB_ROW, CLOSE_LAYER)}>
					{pinned.map((tab) => (
						<span className={PINNED_WIDTH} key={tab.id} />
					))}
					{hasDivider ? <span className={DIVIDER} /> : null}
					{kept.map((tab) => (
						<span className={cn(CLOSE_SLOT, tabWidth)} key={tab.id}>
							{tab.id === activeTabId ? (
								<button
									aria-label={t("titleBar.closeTab")}
									className={CLOSE_BUTTON}
									data-slot="title-bar-tab-close"
									onClick={() => onCloseTab?.(tab.id)}
									type="button"
								>
									<Icons.Close aria-hidden="true" />
								</button>
							) : null}
						</span>
					))}
				</div>
			</Tabs.Root>
			{overflowing.length > 0 ? (
				<OverflowChip onSelectTab={onSelectTab} tabs={overflowing} />
			) : null}
			<button
				aria-label={t("titleBar.newTab")}
				className={BAR_BUTTON}
				onClick={onNewTab}
				type="button"
			>
				<Icons.Add aria-hidden="true" />
			</button>
			<div className={DRAG_REGION} data-slot="title-bar-drag-region" />
		</div>
	)
}

export { type TitleBarTab, TitleBarTabs, type TitleBarTabsProps }
