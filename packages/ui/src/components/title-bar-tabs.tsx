"use client"

import { Tabs } from "@base-ui/react/tabs"
import {
	type KeyboardEvent,
	type ReactNode,
	type RefObject,
	useLayoutEffect,
	useRef,
	useState,
} from "react"
import { createPortal } from "react-dom"
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
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuTrigger,
} from "@workspace/ui/components/ui/context-menu"
import {
	type RosterLift,
	useRosterLift,
} from "@workspace/ui/hooks/use-roster-lift"
import { useStableCallback } from "@workspace/ui/hooks/use-stable-callback"
import { middleClickHandlers } from "@workspace/ui/lib/click-modifiers"
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
	hasClosedTab?: boolean
	onSelectTab?: (id: string) => void
	onCloseTab?: (id: string) => void
	onPinTab?: (id: string) => void
	onUnpinTab?: (id: string) => void
	onCloseOtherTabs?: (id: string) => void
	onDuplicateTab?: (id: string) => void
	onReopenClosedTab?: () => void
	onMoveTabToNewWindow?: (id: string) => void
	onReorderTabs?: (ids: string[]) => void
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

const LIFTED_TAB =
	"pointer-events-none z-10 bg-title-bar-menu text-foreground drop-shadow-md translate-x-[var(--lift-dx,0px)] aria-selected:bg-title-bar-menu"

const INSERTION_LINE =
	"pointer-events-none absolute inset-y-1 z-20 w-0.5 rounded-full bg-foreground"

const INSERTION_EDGE = {
	start: "-start-0.75",
	end: "-end-0.75",
} as const

type InsertionEdge = keyof typeof INSERTION_EDGE

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

const TAB_MENU_SHORTCUTS = {
	pinTab: { hint: "titleBar.pinTabShortcut", keys: "Control+Shift+P" },
	newTab: { hint: "titleBar.newTabShortcut", keys: "Meta+T" },
	reopenClosedTab: {
		hint: "titleBar.reopenClosedTabShortcut",
		keys: "Meta+Shift+T",
	},
	closeTab: { hint: "titleBar.closeTabShortcut", keys: "Meta+W" },
	closeOtherTabs: {
		hint: "titleBar.closeOtherTabsShortcut",
		keys: "Meta+Alt+W",
	},
} as const

const UNPINNED_TAB = '[data-slot="title-bar-tab"]'

const PINNED_TAB_SLOT = '[data-slot="title-bar-pinned-tab"]'

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

const reorderedIds = (
	tabs: TitleBarTab[],
	zone: TitleBarTab[],
	id: string,
	at: number,
) => {
	const others = zone.filter((tab) => tab.id !== id)
	const ids = tabs.map((tab) => tab.id).filter((held) => held !== id)
	const anchor =
		at > 0 ? ids.indexOf(others[at - 1].id) + 1 : ids.indexOf(others[0].id)
	ids.splice(anchor, 0, id)
	return ids
}

const middlesOf = (strip: HTMLElement | null, slot: string) =>
	[...(strip?.querySelectorAll(slot) ?? [])].map((node) => {
		const box = node.getBoundingClientRect()
		return box.left + box.width / 2
	})

type TabLiftSource = {
	tabs: TitleBarTab[]
	pinned: TitleBarTab[]
	kept: TitleBarTab[]
	stripRef: RefObject<HTMLDivElement | null>
	onReorderTabs?: (ids: string[]) => void
}

const stepOf = (event: KeyboardEvent<HTMLElement>) => {
	if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
		return 0
	if (event.key === "ArrowLeft") return -1
	if (event.key === "ArrowRight") return 1
	return 0
}

type TabMove = {
	title: string
	position: number
	count: number
}

const useTabLift = ({
	tabs,
	pinned,
	kept,
	stripRef,
	onReorderTabs,
}: TabLiftSource) => {
	const isPinned = (id: string) => pinned.some((tab) => tab.id === id)
	const zoneOf = (id: string) => (isPinned(id) ? pinned : kept)
	const [move, setMove] = useState<TabMove | null>(null)

	const moveByKey = (id: string, event: KeyboardEvent<HTMLElement>) => {
		const step = stepOf(event)
		if (!onReorderTabs || step === 0) return
		event.preventDefault()
		const zone = zoneOf(id)
		const from = zone.findIndex((tab) => tab.id === id)
		const to = from + step
		if (to < 0 || to >= zone.length) return
		setMove({
			title: zone[from].title,
			position: (isPinned(id) ? 0 : pinned.length) + to + 1,
			count: pinned.length + kept.length,
		})
		onReorderTabs(reorderedIds(tabs, zone, id, to))
	}

	const lift = useRosterLift({
		isEnabled: Boolean(onReorderTabs),
		landingAt: (x, _y, id) => {
			const middles = middlesOf(
				stripRef.current,
				isPinned(id) ? PINNED_TAB_SLOT : UNPINNED_TAB,
			)
			return zoneOf(id).filter(
				(tab, rank) => tab.id !== id && middles[rank] < x,
			).length
		},
		onLand: (id, at: number) => {
			const zone = zoneOf(id)
			if (at === zone.findIndex((tab) => tab.id === id)) return
			onReorderTabs?.(reorderedIds(tabs, zone, id, at))
		},
	})

	const liftedId = lift.lift?.id
	const at = lift.lift?.landing ?? null
	const others = liftedId
		? zoneOf(liftedId).filter((tab) => tab.id !== liftedId)
		: []
	const mark =
		at === null
			? null
			: at < others.length
				? { id: others[at].id, edge: "start" as const }
				: at > 0
					? { id: others[at - 1].id, edge: "end" as const }
					: null

	return {
		lift,
		insertionOn: (id: string) => (mark?.id === id ? mark.edge : undefined),
		move,
		moveByKey,
	}
}

type TabGestures = Pick<
	TitleBarTabsProps,
	| "hasClosedTab"
	| "onPinTab"
	| "onUnpinTab"
	| "onNewTab"
	| "onDuplicateTab"
	| "onReopenClosedTab"
	| "onCloseTab"
	| "onCloseOtherTabs"
	| "onMoveTabToNewWindow"
>

type TitleBarTabItemProps = TabGestures & {
	tab: TitleBarTab
	isActive: boolean
	width: string
	lift: RosterLift<number>
	insertion?: InsertionEdge
	onMoveKey: (event: KeyboardEvent<HTMLElement>) => void
}

const TitleBarTabItem = ({
	tab,
	isActive,
	width,
	hasClosedTab = false,
	lift,
	insertion,
	onMoveKey,
	onPinTab,
	onUnpinTab,
	onNewTab,
	onDuplicateTab,
	onReopenClosedTab,
	onCloseTab,
	onCloseOtherTabs,
	onMoveTabToNewWindow,
}: TitleBarTabItemProps) => {
	const { t } = useTranslation("common")
	const needsYou = Boolean(tab.isNeedingYou) && !isActive
	const isLifted = lift.lift?.id === tab.id
	const PinIcon = tab.isPinned ? Icons.Unpin : Icons.Pin

	return (
		<ContextMenu>
			<ContextMenuTrigger
				render={
					<Tabs.Tab
						{...lift.handlersFor(tab.id)}
						{...middleClickHandlers(() => {
							if (!tab.isPinned) onCloseTab?.(tab.id)
						})}
						aria-label={
							needsYou
								? t("titleBar.tabNeedsYou", { title: tab.title })
								: tab.isPinned
									? tab.title
									: undefined
						}
						className={cn(
							tab.isPinned ? PINNED_TAB : TAB,
							width,
							isLifted && LIFTED_TAB,
							insertion && "relative",
						)}
						data-slot={tab.isPinned ? "title-bar-pinned-tab" : "title-bar-tab"}
						onClick={(event) => {
							if (lift.hasJustDropped()) event.preventBaseUIHandler()
						}}
						onKeyDown={onMoveKey}
						ref={isLifted ? lift.followRef : undefined}
						value={tab.id}
					/>
				}
			>
				{insertion ? (
					<span
						aria-hidden="true"
						className={cn(INSERTION_LINE, INSERTION_EDGE[insertion])}
						data-slot="title-bar-tab-insertion"
					/>
				) : null}
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
				className={cn(TITLE_BAR_MENU, "min-w-55", STILL_UNDER_REDUCED_MOTION)}
			>
				<ContextMenuItem
					aria-keyshortcuts={TAB_MENU_SHORTCUTS.pinTab.keys}
					className={TITLE_BAR_MENU_ROW}
					onClick={() => (tab.isPinned ? onUnpinTab : onPinTab)?.(tab.id)}
				>
					<PinIcon aria-hidden="true" className="size-3.5" />
					{t(tab.isPinned ? "titleBar.unpinTab" : "titleBar.pinTab")}
					<ContextMenuShortcut aria-hidden="true">
						{t(TAB_MENU_SHORTCUTS.pinTab.hint)}
					</ContextMenuShortcut>
				</ContextMenuItem>
				<ContextMenuItem
					aria-keyshortcuts={TAB_MENU_SHORTCUTS.newTab.keys}
					className={TITLE_BAR_MENU_ROW}
					onClick={() => onNewTab?.()}
				>
					<Icons.NewTab aria-hidden="true" className="size-3.5" />
					{t("titleBar.newTab")}
					<ContextMenuShortcut aria-hidden="true">
						{t(TAB_MENU_SHORTCUTS.newTab.hint)}
					</ContextMenuShortcut>
				</ContextMenuItem>
				<ContextMenuItem
					className={TITLE_BAR_MENU_ROW}
					onClick={() => onDuplicateTab?.(tab.id)}
				>
					<Icons.Copy aria-hidden="true" className="size-3.5" />
					{t("titleBar.duplicateTab")}
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem
					aria-keyshortcuts={TAB_MENU_SHORTCUTS.reopenClosedTab.keys}
					className={TITLE_BAR_MENU_ROW}
					disabled={!hasClosedTab}
					onClick={() => onReopenClosedTab?.()}
				>
					<Icons.ReopenTab aria-hidden="true" className="size-3.5" />
					{t("titleBar.reopenClosedTab")}
					<ContextMenuShortcut aria-hidden="true">
						{t(TAB_MENU_SHORTCUTS.reopenClosedTab.hint)}
					</ContextMenuShortcut>
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem
					aria-keyshortcuts={TAB_MENU_SHORTCUTS.closeTab.keys}
					className={TITLE_BAR_MENU_ROW}
					disabled={tab.isPinned}
					onClick={() => onCloseTab?.(tab.id)}
				>
					<Icons.Close aria-hidden="true" className="size-3.5" />
					{t("titleBar.closeTab")}
					<ContextMenuShortcut aria-hidden="true">
						{t(TAB_MENU_SHORTCUTS.closeTab.hint)}
					</ContextMenuShortcut>
				</ContextMenuItem>
				<ContextMenuItem
					aria-keyshortcuts={TAB_MENU_SHORTCUTS.closeOtherTabs.keys}
					className={TITLE_BAR_MENU_ROW}
					onClick={() => onCloseOtherTabs?.(tab.id)}
				>
					<Icons.CloseOtherTabs aria-hidden="true" className="size-3.5" />
					{t("titleBar.closeOtherTabs")}
					<ContextMenuShortcut aria-hidden="true">
						{t(TAB_MENU_SHORTCUTS.closeOtherTabs.hint)}
					</ContextMenuShortcut>
				</ContextMenuItem>
				<ContextMenuItem
					className={TITLE_BAR_MENU_ROW}
					onClick={() => onMoveTabToNewWindow?.(tab.id)}
				>
					<Icons.NewWindow aria-hidden="true" className="size-3.5" />
					{t("titleBar.moveTabToNewWindow")}
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
	hasClosedTab,
	onSelectTab,
	onCloseTab,
	onPinTab,
	onUnpinTab,
	onCloseOtherTabs,
	onDuplicateTab,
	onReopenClosedTab,
	onMoveTabToNewWindow,
	onReorderTabs,
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
	const { lift, insertionOn, move, moveByKey } = useTabLift({
		tabs,
		pinned,
		kept,
		stripRef,
		onReorderTabs,
	})
	const tabItem = (tab: TitleBarTab, width: string) => (
		<TitleBarTabItem
			insertion={insertionOn(tab.id)}
			isActive={tab.id === activeTabId}
			hasClosedTab={hasClosedTab}
			key={tab.id}
			lift={lift}
			onCloseOtherTabs={onCloseOtherTabs}
			onCloseTab={onCloseTab}
			onDuplicateTab={onDuplicateTab}
			onMoveKey={(event) => moveByKey(tab.id, event)}
			onMoveTabToNewWindow={onMoveTabToNewWindow}
			onNewTab={onNewTab}
			onPinTab={onPinTab}
			onReopenClosedTab={onReopenClosedTab}
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
							{tab.id === activeTabId && tab.id !== lift.lift?.id ? (
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
			{createPortal(
				<span
					aria-live="polite"
					className="sr-only"
					data-slot="title-bar-tab-move-announcement"
				>
					{move ? t("titleBar.tabMoved", move) : ""}
				</span>,
				document.body,
			)}
		</div>
	)
}

export { type TitleBarTab, TitleBarTabs, type TitleBarTabsProps }
