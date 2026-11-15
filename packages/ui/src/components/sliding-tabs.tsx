"use client"

import { cva } from "class-variance-authority"
import { createContext, type ReactNode, useContext } from "react"

import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/ui/tabs"
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@workspace/ui/components/ui/toggle-group"

type SlidingTabsKind = "tabs" | "segments" | "filters"

type SlidingTabsValue = string | number

const trackVariants = cva("relative", {
	variants: {
		kind: {
			tabs: "scrollbar-hide max-w-full overflow-x-auto bg-transparent p-0",
			segments:
				"scrollbar-hide max-w-full justify-start gap-0.5 self-start overflow-x-auto rounded-[11px] bg-border p-0.75 group-data-horizontal/tabs:h-fit",
			filters: "gap-0.5 rounded-header-island-control bg-muted p-0.5",
		},
	},
})

const tabVariants = cva("relative transition-none", {
	variants: {
		kind: {
			tabs: "h-7.5 shrink-0 py-0 data-active:bg-transparent dark:data-active:bg-transparent",
			segments:
				"h-6.5 max-w-full flex-none shrink-0 gap-1 rounded-md px-3 py-0 font-medium text-compact text-question-segment-foreground leading-4 hover:text-foreground data-active:bg-transparent data-active:text-foreground dark:data-active:bg-transparent",
			filters:
				"gap-1.5 rounded-header-island-segment border border-transparent px-1.25 font-normal text-xs leading-4 hover:bg-header-island-control-pressed focus-visible:ring-4 dark:not-aria-pressed:hover:bg-header-island-control-hover aria-pressed:bg-transparent aria-pressed:font-medium aria-pressed:text-primary-foreground",
		},
	},
})

const PILL_CLASS = {
	tabs: "rounded-lg bg-background dark:bg-input/30",
	segments: "rounded-md bg-card shadow-[0_1px_2px_rgb(0_0_0/10%)]",
	filters: "rounded-header-island-segment bg-primary",
} as const satisfies Record<SlidingTabsKind, string>

const ACTIVE_TAB =
	':scope > [aria-selected="true"], :scope > [aria-pressed="true"]'

type PillPlacement = {
	tab: HTMLElement
	box: string
}

const PLACEMENTS = new WeakMap<HTMLElement, PillPlacement>()

const flushStyleOf = (element: HTMLElement) => {
	element.getBoundingClientRect()
}

const placePill = (pill: HTMLElement) => {
	const tab = pill.parentElement?.querySelector<HTMLElement>(ACTIVE_TAB)
	if (!tab) return

	const { offsetLeft, offsetTop, offsetWidth, offsetHeight } = tab
	const box = [offsetLeft, offsetTop, offsetWidth, offsetHeight].join()
	const placed = PLACEMENTS.get(pill)
	if (placed?.tab === tab && placed.box === box) return
	PLACEMENTS.set(pill, { tab, box })

	const isGliding = placed !== undefined && placed.tab !== tab
	if (!isGliding) pill.style.transition = "none"
	pill.style.transform = `translate(${offsetLeft}px, ${offsetTop}px)`
	pill.style.width = `${offsetWidth}px`
	pill.style.height = `${offsetHeight}px`
	if (isGliding) return

	flushStyleOf(pill)
	pill.style.transition = ""
}

const ACTIVATION = {
	attributeFilter: ["aria-selected", "aria-pressed"],
	subtree: true,
}

const followActiveTab = (pill: HTMLSpanElement) => {
	const track = pill.parentElement
	if (!track) return

	const place = () => placePill(pill)
	const resizes = new ResizeObserver(place)
	const activations = new MutationObserver(place)
	resizes.observe(track)
	for (const child of track.children) resizes.observe(child)
	activations.observe(track, ACTIVATION)
	place()

	return () => {
		resizes.disconnect()
		activations.disconnect()
	}
}

const SlidingTabsKindContext = createContext<SlidingTabsKind>("tabs")

type SlidingTabsProps<Value extends SlidingTabsValue> = {
	kind: Value extends string
		? SlidingTabsKind
		: Exclude<SlidingTabsKind, "filters">
	value: Value
	onValueChange: (value: Value) => void
	activateOnFocus?: boolean
	"aria-label"?: string
	"data-slot"?: string
	children: ReactNode
}

export const SlidingTabs = <Value extends SlidingTabsValue>({
	kind,
	value,
	onValueChange,
	activateOnFocus,
	children,
	...track
}: SlidingTabsProps<Value>) => {
	const tabs = (
		<SlidingTabsKindContext.Provider value={kind}>
			<span
				aria-hidden="true"
				className={PILL_CLASS[kind]}
				data-slot="sliding-tabs-pill"
				ref={followActiveTab}
			/>
			{children}
		</SlidingTabsKindContext.Provider>
	)

	return kind === "filters" ? (
		<ToggleGroup
			className={trackVariants({ kind })}
			onValueChange={([pressed]) =>
				onValueChange((pressed as Value | undefined) ?? value)
			}
			value={[String(value)]}
			{...track}
		>
			{tabs}
		</ToggleGroup>
	) : (
		<Tabs
			className="min-w-0"
			onValueChange={(next) => onValueChange(next)}
			value={value}
		>
			<TabsList
				activateOnFocus={activateOnFocus}
				className={trackVariants({ kind })}
				{...track}
			>
				{tabs}
			</TabsList>
		</Tabs>
	)
}

type SlidingTabProps = {
	value: SlidingTabsValue
	children: ReactNode
}

export const SlidingTab = ({ value, children }: SlidingTabProps) => {
	const kind = useContext(SlidingTabsKindContext)

	return kind === "filters" ? (
		<ToggleGroupItem
			className={tabVariants({ kind })}
			size="sm"
			value={String(value)}
		>
			{children}
		</ToggleGroupItem>
	) : (
		<TabsTrigger className={tabVariants({ kind })} value={value}>
			{children}
		</TabsTrigger>
	)
}

type SlidingTabCountProps = {
	children: ReactNode
}

export const SlidingTabCount = ({ children }: SlidingTabCountProps) => (
	<span
		className="font-normal text-muted-foreground tabular-nums group-aria-pressed/toggle:text-primary-foreground dark:group-aria-pressed/toggle:text-[color-mix(in_oklab,var(--primary-foreground)_70%,var(--primary))]"
		data-slot="sliding-tab-count"
	>
		{children}
	</span>
)
