"use client"

import { Tabs } from "@base-ui/react/tabs"
import {
	type FocusEvent,
	type KeyboardEvent,
	type PointerEvent,
	type ReactNode,
	type RefObject,
	useLayoutEffect,
	useRef,
	useState,
} from "react"
import { createPortal, flushSync } from "react-dom"
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
	useLiftLanding,
} from "@workspace/ui/hooks/use-roster-lift"
import {
	SHIFTABLE,
	SLIDING,
	type SlideGeometry,
	type SlideShift,
	useSlidingLift,
} from "@workspace/ui/hooks/use-sliding-lift"
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

type TitleBarTabTearOff = {
	tabId: string
	screenX: number
	screenY: number
}

type TitleBarIncomingTab = {
	tab: TitleBarTab
	clientX: number
}

type TitleBarTabsProps = {
	tabs?: TitleBarTab[]
	activeTabId?: string
	incomingTab?: TitleBarIncomingTab
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
	onTearOffTab?: (tearOff: TitleBarTabTearOff) => unknown
	onTearOffStart?: (tearOff: TitleBarTabTearOff) => void
	onTearOffMove?: (tearOff: TitleBarTabTearOff) => void
	onTearOffCancel?: (tabId: string) => void
	onIncomingTabIndexChange?: (index: number) => void
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
	"relative flex h-7 touch-none select-none items-center gap-1.5 rounded-md bg-title-bar-tab ps-2 pe-7.25 text-foreground hover:bg-title-bar-tab-hover focus-visible:outline-2 focus-visible:outline-foreground focus-visible:outline-offset-1 data-pointer-within:bg-title-bar-tab-hover aria-selected:bg-title-bar-tab-selected"

const PINNED_TAB =
	"relative grid touch-none select-none place-items-center rounded-md bg-title-bar-pinned text-foreground hover:bg-title-bar-tab-hover focus-visible:outline-2 focus-visible:outline-foreground focus-visible:outline-offset-1 aria-selected:bg-title-bar-tab-selected"

const LIFTED_SURFACE =
	"pointer-events-none z-10 bg-title-bar-menu text-foreground drop-shadow-md"

const LIFTED_TAB = cn(
	LIFTED_SURFACE,
	"translate-x-[clamp(var(--lift-min),var(--lift-dx,0px),var(--lift-max))] aria-selected:bg-title-bar-menu",
)

const TORN_OFF_TAB = "data-torn-off:opacity-0"

const INCOMING_TAB = cn(TAB, LIFTED_SURFACE, "absolute top-0")

const INCOMING_CLOSE =
	"absolute inset-y-0 end-1.25 my-auto grid size-4.5 place-items-center text-muted-foreground [&_svg]:size-3"

const TAB_TITLE =
	"min-w-0 select-none truncate font-medium text-compact leading-4"

const TAB_NEEDS_YOU = cn(NEEDS_YOU_GLYPH, "size-3.25")

const CLOSE_SLOT = cn("flex h-7 items-center justify-end pe-1.25", SHIFTABLE.x)

const CLOSE_BUTTON =
	"pointer-events-auto grid size-4.5 place-items-center rounded-[5px] text-muted-foreground hover:bg-title-bar-highlight hover:text-foreground focus-visible:outline-2 focus-visible:outline-foreground focus-visible:outline-offset-1 [&_svg]:size-3"

const OVERFLOW_CHIP =
	"flex h-7 shrink-0 items-center gap-1 rounded-md bg-title-bar-chip ps-2 pe-1.5 font-medium text-foreground text-xs hover:bg-rail-item-selected focus-visible:outline-2 focus-visible:outline-foreground focus-visible:outline-offset-1 aria-expanded:bg-rail-item-selected [&_svg]:size-3"

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

const TAB_SLOT = `[data-slot="title-bar-pinned-tab"], ${UNPINNED_TAB}`

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

const TORN_OFF = "torn-off"

type TabLanding = number | typeof TORN_OFF

const tearOffOf = (_x: number, y: number, { rest }: SlideGeometry) =>
	y < rest.top - rest.height || y > rest.bottom + rest.height ? TORN_OFF : null

type IncomingSlots = {
	rowLeft: number
	tabWidth: number | null
	boundaries: number[]
}

const measureIncomingSlots = (row: HTMLElement): IncomingSlots => {
	const list = row.querySelector('[role="tablist"]')
	const gap = list ? pixelsOf(getComputedStyle(list).columnGap) : 0
	const tabs = [...row.querySelectorAll<HTMLElement>(UNPINNED_TAB)]
	const last = tabs.at(-1) ?? (list?.lastElementChild as HTMLElement | null)
	const end = last ? last.offsetLeft + last.offsetWidth + gap : 0
	const tabWidth = tabs[0] ? widthOf(tabs[0]) : null
	row.style.setProperty("--tab-shift", `${(tabWidth ?? 0) + gap}px`)
	return {
		rowLeft: row.getBoundingClientRect().left,
		tabWidth,
		boundaries: [...tabs.map((tab) => tab.offsetLeft), end],
	}
}

const isSameSlots = (one: IncomingSlots | null, other: IncomingSlots) =>
	one !== null &&
	one.rowLeft === other.rowLeft &&
	one.tabWidth === other.tabWidth &&
	one.boundaries.join() === other.boundaries.join()

const nearestIndexOf = (boundaries: number[], x: number) => {
	const distances = boundaries.map((boundary) => Math.abs(boundary - x))
	return distances.indexOf(Math.min(...distances))
}

type TabShiftOf = (
	id: string,
	landing: TabLanding | null,
) => SlideShift | undefined

type TabLiftSource = Pick<
	TitleBarTabsProps,
	| "onReorderTabs"
	| "onTearOffTab"
	| "onTearOffStart"
	| "onTearOffMove"
	| "onTearOffCancel"
> & {
	tabs: TitleBarTab[]
	pinned: TitleBarTab[]
	kept: TitleBarTab[]
	incomingIndex: number | null
	rowRef: RefObject<HTMLDivElement | null>
}

const tearOffAt = (
	tabId: string,
	at: globalThis.PointerEvent,
): TitleBarTabTearOff => ({
	tabId,
	screenX: at.screenX,
	screenY: at.screenY,
})

const stepOf = (event: KeyboardEvent<HTMLElement>) => {
	if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
		return 0
	if (event.key === "ArrowLeft") return -1
	if (event.key === "ArrowRight") return 1
	return 0
}

const CLOSE_PAIR = "data-close-pair"

type CloseRevealHandlers = {
	[CLOSE_PAIR]: string
	onPointerEnter: () => void
	onPointerLeave: (event: PointerEvent<HTMLElement>) => void
	onFocus: (event: FocusEvent<HTMLElement>) => void
	onBlur: (event: FocusEvent<HTMLElement>) => void
}

const closePairOf = (target: EventTarget | null) =>
	target instanceof Element
		? target.closest(`[${CLOSE_PAIR}]`)?.getAttribute(CLOSE_PAIR)
		: undefined

const pairedIn = (
	root: HTMLElement | null,
	id: string,
	kind: "tab" | "close",
) =>
	root?.querySelector<HTMLElement>(
		`${kind === "tab" ? '[role="tab"]' : '[data-slot="title-bar-tab-close"]'}[${CLOSE_PAIR}="${CSS.escape(id)}"]`,
	)

const isTabKey = (event: KeyboardEvent<HTMLElement>, isBackward: boolean) =>
	event.key === "Tab" && event.shiftKey === isBackward

const useCloseReveal = () => {
	const [hoveredId, setHoveredId] = useState<string | null>(null)
	const [focusedId, setFocusedId] = useState<string | null>(null)
	const forget =
		(id: string, setId: typeof setHoveredId) =>
		(event: { relatedTarget: EventTarget | null }) => {
			if (closePairOf(event.relatedTarget) === id) return
			setId((current) => (current === id ? null : current))
		}
	const sharedRevealFor = (id: string) => ({
		[CLOSE_PAIR]: id,
		onPointerEnter: () => setHoveredId(id),
		onPointerLeave: forget(id, setHoveredId),
		onBlur: forget(id, setFocusedId),
	})
	const tabRevealFor = (id: string): CloseRevealHandlers => ({
		...sharedRevealFor(id),
		onFocus: (event) => {
			if (event.currentTarget.matches(":focus-visible")) setFocusedId(id)
		},
	})
	const closeRevealFor = (id: string): CloseRevealHandlers => ({
		...sharedRevealFor(id),
		onFocus: () => setFocusedId(id),
	})
	const revealNow = (id: string) => flushSync(() => setFocusedId(id))
	const isHovered = (id: string) => id === hoveredId
	const isRevealed = (id: string) => id === hoveredId || id === focusedId
	return { isHovered, isRevealed, revealNow, tabRevealFor, closeRevealFor }
}

type TabCloseButtonProps = {
	title: string
	isShown: boolean
	revealHandlers: CloseRevealHandlers
	onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
	onClose: () => void
}

const TabCloseButton = ({
	title,
	isShown,
	revealHandlers,
	onKeyDown,
	onClose,
}: TabCloseButtonProps) => {
	const { t } = useTranslation("common")
	return (
		<button
			{...revealHandlers}
			aria-label={t("titleBar.closeTabNamed", { title })}
			className={CLOSE_BUTTON}
			data-slot="title-bar-tab-close"
			data-tauri-drag-region="false"
			hidden={!isShown}
			onClick={onClose}
			onKeyDown={onKeyDown}
			type="button"
		>
			<Icons.Close aria-hidden="true" />
		</button>
	)
}

type TabCloseSlotProps = {
	id: string
	width: string
	lift: RosterLift<TabLanding>
	shiftOf: TabShiftOf
	isSliding: boolean
	children: ReactNode
}

const TabCloseSlot = ({
	id,
	width,
	lift,
	shiftOf,
	isSliding,
	children,
}: TabCloseSlotProps) => {
	const shift = useLiftLanding(lift, (landing) => shiftOf(id, landing))
	return (
		<span
			className={cn(CLOSE_SLOT, width, isSliding && SLIDING)}
			data-shift={shift}
		>
			{children}
		</span>
	)
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
	incomingIndex,
	rowRef,
	onReorderTabs,
	onTearOffTab,
	onTearOffStart,
	onTearOffMove,
	onTearOffCancel,
}: TabLiftSource) => {
	const isPinned = (id: string) => pinned.some((tab) => tab.id === id)
	const zoneOf = (id: string) => (isPinned(id) ? pinned : kept)
	const rankOf = (id: string) => zoneOf(id).findIndex((tab) => tab.id === id)
	const [move, setMove] = useState<TabMove | null>(null)
	const [isSnapping, setIsSnapping] = useState(false)
	if (isSnapping && incomingIndex !== null) setIsSnapping(false)
	const isTornOff = useRef(false)

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

	const slide = useSlidingLift<typeof TORN_OFF>({
		axis: "x",
		slot: TAB_SLOT,
		idAttribute: CLOSE_PAIR,
		zones: [pinned.map((tab) => tab.id), kept.map((tab) => tab.id)],
		containerRef: rowRef,
		landingOutside: tearOffOf,
		isEnabled: Boolean(onReorderTabs),
		onLift: () => {
			setIsSnapping(false)
			isTornOff.current = false
		},
		onMove: (id, landing, moved) => {
			const wasTornOff = isTornOff.current
			isTornOff.current = landing === TORN_OFF
			if (isTornOff.current)
				(wasTornOff ? onTearOffMove : onTearOffStart)?.(tearOffAt(id, moved))
			else if (wasTornOff) onTearOffCancel?.(id)
		},
		onCancel: (id) => onTearOffCancel?.(id),
		onLand: (id, landing, released) => {
			if (landing === TORN_OFF) {
				if (onTearOffTab?.(tearOffAt(id, released)) !== true)
					setIsSnapping(true)
				return
			}
			if (landing === rankOf(id)) return
			onReorderTabs?.(reorderedIds(tabs, zoneOf(id), id, landing))
		},
	})

	const { lift } = slide
	const liftedId = lift.lift?.id

	const rowRankOf = (id: string) =>
		isPinned(id) ? rankOf(id) : pinned.length + rankOf(id)

	const shiftOf = (
		id: string,
		landing: TabLanding | null,
	): SlideShift | undefined => {
		if (!liftedId) {
			const rank = kept.findIndex((tab) => tab.id === id)
			return incomingIndex !== null && rank >= incomingIndex ? "end" : undefined
		}
		if (landing === TORN_OFF)
			return rowRankOf(id) > rowRankOf(liftedId) ? "start" : undefined
		return slide.shiftOf(id, landing)
	}

	const dividerShiftOf = (
		landing: TabLanding | null,
	): SlideShift | undefined =>
		liftedId && isPinned(liftedId) && landing === TORN_OFF ? "start" : undefined

	const isRowSliding = Boolean(liftedId) || isSnapping || incomingIndex !== null

	const isSliding = (id: string) => isRowSliding && id !== liftedId

	return {
		lift,
		shiftOf,
		dividerShiftOf,
		isRowSliding,
		isSliding,
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
	lift: RosterLift<TabLanding>
	shiftOf: TabShiftOf
	isSliding: boolean
	onMoveKey: (event: KeyboardEvent<HTMLElement>) => void
	revealHandlers: CloseRevealHandlers
	isPointerWithin: boolean
}

const TitleBarTabItem = ({
	tab,
	isActive,
	width,
	hasClosedTab = false,
	lift,
	shiftOf,
	isSliding,
	onMoveKey,
	revealHandlers,
	isPointerWithin,
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
	const shift = useLiftLanding(lift, (landing) => shiftOf(tab.id, landing))
	const isTornOff = useLiftLanding(
		lift,
		(landing) => isLifted && landing === TORN_OFF,
	)
	const PinIcon = tab.isPinned ? Icons.Unpin : Icons.Pin

	return (
		<ContextMenu>
			<ContextMenuTrigger
				render={
					<Tabs.Tab
						{...lift.handlersFor(tab.id)}
						{...revealHandlers}
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
							SHIFTABLE.x,
							width,
							isSliding && SLIDING,
							isLifted && LIFTED_TAB,
							TORN_OFF_TAB,
						)}
						data-pointer-within={isPointerWithin || undefined}
						data-shift={shift}
						data-torn-off={isTornOff || undefined}
						data-slot={tab.isPinned ? "title-bar-pinned-tab" : "title-bar-tab"}
						data-tauri-drag-region="false"
						onClick={(event) => {
							if (lift.hasJustDropped()) event.preventBaseUIHandler()
						}}
						onKeyDown={onMoveKey}
						ref={isLifted ? lift.followRef : undefined}
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

type PinnedDividerProps = {
	lift: RosterLift<TabLanding>
	shiftOf: (landing: TabLanding | null) => SlideShift | undefined
	isSliding: boolean
}

const PinnedDivider = ({ lift, shiftOf, isSliding }: PinnedDividerProps) => {
	const shift = useLiftLanding(lift, shiftOf)
	return (
		<span
			aria-hidden="true"
			className={cn(
				DIVIDER,
				"bg-title-bar-divider",
				SHIFTABLE.x,
				isSliding && SLIDING,
			)}
			data-shift={shift}
			data-slot="title-bar-pinned-divider"
		/>
	)
}

type IncomingBox = {
	left: number
	width: number | null
}

type IncomingTabProps = {
	tab: TitleBarTab
	widthClass: string
	box: IncomingBox
}

const IncomingTab = ({ tab, widthClass, box }: IncomingTabProps) => (
	<span
		aria-hidden="true"
		className={cn(INCOMING_TAB, widthClass)}
		data-slot="title-bar-incoming-tab"
		style={{ left: box.left, width: box.width ?? undefined }}
	>
		<span className={TAB_ICON}>{tab.icon}</span>
		<span className={TAB_TITLE}>{tab.title}</span>
		<span className={INCOMING_CLOSE}>
			<Icons.Close />
		</span>
	</span>
)

type IncomingIndexSource = {
	tabs: TitleBarTab[]
	pinned: TitleBarTab[]
	kept: TitleBarTab[]
	incomingTab?: TitleBarIncomingTab
	onIncomingTabIndexChange?: (index: number) => void
}

const indexInTabs = (
	tabs: TitleBarTab[],
	pinned: TitleBarTab[],
	kept: TitleBarTab[],
	keptIndex: number,
) => {
	const before = kept[keptIndex - 1]
	return before ? tabs.indexOf(before) + 1 : pinned.length
}

const useIncomingIndex = ({
	tabs,
	pinned,
	kept,
	incomingTab,
	onIncomingTabIndexChange,
}: IncomingIndexSource) => {
	const rowRef = useRef<HTMLDivElement>(null)
	const [slots, setSlots] = useState<IncomingSlots | null>(null)
	const isHovering = Boolean(incomingTab)
	const measure = useStableCallback(() => {
		const row = rowRef.current
		if (!isHovering || !row) {
			if (slots) setSlots(null)
			return
		}
		const next = measureIncomingSlots(row)
		if (!isSameSlots(slots, next)) setSlots(next)
	})
	useLayoutEffect(measure)
	const incomingIndex =
		incomingTab && slots
			? nearestIndexOf(slots.boundaries, incomingTab.clientX - slots.rowLeft)
			: null
	const tabsIndex =
		incomingIndex === null
			? null
			: indexInTabs(tabs, pinned, kept, incomingIndex)
	const reportIndex = useStableCallback((index: number) =>
		onIncomingTabIndexChange?.(index),
	)
	useLayoutEffect(() => {
		if (tabsIndex !== null) reportIndex(tabsIndex)
	}, [tabsIndex, reportIndex])
	const incomingBox: IncomingBox | null =
		slots && incomingIndex !== null
			? { left: slots.boundaries[incomingIndex], width: slots.tabWidth }
			: null
	return { rowRef, incomingIndex, incomingBox }
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
	incomingTab,
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
	onTearOffTab,
	onTearOffStart,
	onTearOffMove,
	onTearOffCancel,
	onIncomingTabIndexChange,
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
	const { rowRef, incomingIndex, incomingBox } = useIncomingIndex({
		tabs,
		pinned,
		kept,
		incomingTab,
		onIncomingTabIndexChange,
	})
	const {
		lift,
		shiftOf,
		dividerShiftOf,
		isRowSliding,
		isSliding,
		move,
		moveByKey,
	} = useTabLift({
		tabs,
		pinned,
		kept,
		incomingIndex,
		rowRef,
		onReorderTabs,
		onTearOffTab,
		onTearOffStart,
		onTearOffMove,
		onTearOffCancel,
	})
	const { isHovered, isRevealed, revealNow, tabRevealFor, closeRevealFor } =
		useCloseReveal()
	const showsClose = (id: string) =>
		id !== lift.lift?.id &&
		(id === activeTabId || (!lift.lift && isRevealed(id)))
	const tabKeyOf =
		(tab: TitleBarTab) => (event: KeyboardEvent<HTMLElement>) => {
			if (isTabKey(event, false) && !tab.isPinned && !lift.lift) {
				event.preventDefault()
				revealNow(tab.id)
				pairedIn(stripRef.current, tab.id, "close")?.focus()
				return
			}
			moveByKey(tab.id, event)
		}
	const closeKeyOf = (id: string) => (event: KeyboardEvent<HTMLElement>) => {
		if (!isTabKey(event, true)) return
		event.preventDefault()
		pairedIn(stripRef.current, id, "tab")?.focus()
	}
	const tabItem = (tab: TitleBarTab, width: string) => (
		<TitleBarTabItem
			isActive={tab.id === activeTabId}
			hasClosedTab={hasClosedTab}
			key={tab.id}
			lift={lift}
			onCloseOtherTabs={onCloseOtherTabs}
			onCloseTab={onCloseTab}
			onDuplicateTab={onDuplicateTab}
			isSliding={isSliding(tab.id)}
			isPointerWithin={
				tab.id !== activeTabId && !lift.lift && isHovered(tab.id)
			}
			onMoveKey={tabKeyOf(tab)}
			onMoveTabToNewWindow={onMoveTabToNewWindow}
			onNewTab={onNewTab}
			onPinTab={onPinTab}
			onReopenClosedTab={onReopenClosedTab}
			onUnpinTab={onUnpinTab}
			revealHandlers={tabRevealFor(tab.id)}
			shiftOf={shiftOf}
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
				ref={rowRef}
				value={activeTabId ?? null}
			>
				<Tabs.List aria-label={t("titleBar.tabs")} className={TAB_ROW}>
					{pinned.map((tab) => tabItem(tab, PINNED_WIDTH))}
					{hasDivider ? (
						<PinnedDivider
							isSliding={isRowSliding}
							lift={lift}
							shiftOf={dividerShiftOf}
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
						<TabCloseSlot
							id={tab.id}
							isSliding={isSliding(tab.id)}
							key={tab.id}
							lift={lift}
							shiftOf={shiftOf}
							width={tabWidth}
						>
							<TabCloseButton
								isShown={showsClose(tab.id)}
								onClose={() => onCloseTab?.(tab.id)}
								onKeyDown={closeKeyOf(tab.id)}
								revealHandlers={closeRevealFor(tab.id)}
								title={tab.title}
							/>
						</TabCloseSlot>
					))}
				</div>
				{incomingTab && incomingBox ? (
					<IncomingTab
						box={incomingBox}
						tab={incomingTab.tab}
						widthClass={tabWidth}
					/>
				) : null}
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

export {
	type TitleBarIncomingTab,
	type TitleBarTab,
	TitleBarTabs,
	type TitleBarTabsProps,
	type TitleBarTabTearOff,
}
