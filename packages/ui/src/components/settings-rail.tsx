"use client"

import { Tabs } from "@base-ui/react/tabs"
import {
	type ComponentProps,
	Fragment,
	type ReactElement,
	type ReactNode,
	useRef,
} from "react"

import {
	type FillIconName,
	FillIcons,
	type Icon,
	Icons,
} from "@workspace/ui/components/icons"
import { TooltipHint } from "@workspace/ui/components/tooltip-hint"
import { useOverlayScrollbars } from "@workspace/ui/hooks/use-overlay-scrollbars"
import { cn, mergeRefs } from "@workspace/ui/lib/utils"

const RAIL_LABELS_MIN_WIDTH = 672

const RAIL_ITEM_CLASS =
	"flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-muted-foreground text-sm outline-none select-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-active:bg-muted data-active:font-medium data-active:text-foreground"

const DANGER_RAIL_ITEM_CLASS = cn(
	RAIL_ITEM_CLASS,
	"text-destructive hover:bg-destructive/10 hover:text-destructive data-active:bg-destructive/10 data-active:text-destructive",
)

const SETTINGS_PANEL_CLASS =
	"flex min-h-0 min-w-0 flex-1 flex-col gap-4 p-5 outline-none data-ending-style:hidden"

const SETTINGS_SCROLLING_PANEL_CLASS = cn(
	SETTINGS_PANEL_CLASS,
	"overflow-y-auto",
)

const SETTINGS_FLUSH_PANEL_CLASS = "gap-0 p-0"

type SettingsScrollingPanelProps = Omit<
	ComponentProps<typeof Tabs.Panel>,
	"className"
> & { isFlush?: boolean }

const SettingsScrollingPanel = ({
	isFlush = false,
	ref,
	...props
}: SettingsScrollingPanelProps) => {
	const panel = useRef<HTMLDivElement>(null)
	useOverlayScrollbars(panel)

	return (
		<Tabs.Panel
			{...props}
			className={cn(
				SETTINGS_SCROLLING_PANEL_CLASS,
				isFlush && SETTINGS_FLUSH_PANEL_CLASS,
			)}
			ref={mergeRefs<HTMLDivElement>(panel, ref)}
		/>
	)
}

const named = (item: ReactElement, label: string, iconsOnly: boolean) =>
	iconsOnly ? (
		<TooltipHint content={label} side="right">
			{item}
		</TooltipHint>
	) : (
		item
	)

type SettingsRailItemProps = {
	icon: FillIconName
	label: string
	value: string
	iconsOnly: boolean
	hasIndicator?: boolean
	className?: string
}

const SettingsRailItem = ({
	icon,
	label,
	value,
	iconsOnly,
	hasIndicator = false,
	className,
}: SettingsRailItemProps) =>
	named(
		<Tabs.Tab
			className={cn(
				RAIL_ITEM_CLASS,
				iconsOnly && "relative justify-center",
				className,
			)}
			render={(props, { active }) => {
				const ItemIcon = (active ? FillIcons : Icons)[icon]
				return (
					<button {...props}>
						<ItemIcon aria-hidden="true" className="size-4 shrink-0" />
						<span
							className={cn(
								iconsOnly
									? "sr-only"
									: hasIndicator && "min-w-0 flex-1 text-start",
							)}
						>
							{label}
						</span>
						{hasIndicator ? (
							<span
								aria-hidden="true"
								className={cn(
									"pointer-events-none size-2 shrink-0 rounded-full bg-primary",
									iconsOnly && "absolute end-2 top-2",
								)}
								data-slot="settings-rail-indicator"
							/>
						) : null}
					</button>
				)
			}}
			value={value}
		/>,
		label,
		iconsOnly,
	)

type SettingsRailActionProps = {
	icon: Icon
	label: string
	onClick: () => void
	iconsOnly: boolean
	className?: string
}

const SettingsRailAction = ({
	icon: ActionIcon,
	label,
	onClick,
	iconsOnly,
	className,
}: SettingsRailActionProps) =>
	named(
		<button
			className={cn(RAIL_ITEM_CLASS, iconsOnly && "justify-center", className)}
			onClick={onClick}
			type="button"
		>
			<ActionIcon aria-hidden="true" className="size-4 shrink-0" />
			<span className={iconsOnly ? "sr-only" : undefined}>{label}</span>
		</button>,
		label,
		iconsOnly,
	)

type SettingsRailBackProps = Omit<SettingsRailActionProps, "icon">

const SettingsRailBack = (props: SettingsRailBackProps) => (
	<SettingsRailAction {...props} icon={Icons.Previous} />
)

const SettingsRailSeparator = () => (
	<span aria-hidden="true" className="mx-1 my-1 h-px shrink-0 bg-border" />
)

type SettingsEntryLayout = "scrolling" | "fixed" | "flush"

type SettingsEntry = {
	value: string
	icon: FillIconName
	label: string
	panel: ReactNode
	layout: SettingsEntryLayout
	isDanger?: boolean
	hasIndicator?: boolean
	count?: number
}

type SettingsEntriesProps = {
	entries: SettingsEntry[]
}

type SettingsRailEntriesProps = SettingsEntriesProps & {
	iconsOnly: boolean
}

const SettingsRailEntries = ({
	entries,
	iconsOnly,
}: SettingsRailEntriesProps) =>
	entries.map((entry) => (
		<Fragment key={entry.value}>
			{entry.isDanger ? <SettingsRailSeparator /> : null}
			<SettingsRailItem
				className={entry.isDanger ? DANGER_RAIL_ITEM_CLASS : undefined}
				hasIndicator={entry.hasIndicator}
				icon={entry.icon}
				iconsOnly={iconsOnly}
				label={entry.label}
				value={entry.value}
			/>
		</Fragment>
	))

const SettingsEntryPanels = ({ entries }: SettingsEntriesProps) =>
	entries.map(({ value, layout, panel }) =>
		layout === "fixed" ? (
			<Tabs.Panel className={SETTINGS_PANEL_CLASS} key={value} value={value}>
				{panel}
			</Tabs.Panel>
		) : (
			<SettingsScrollingPanel
				isFlush={layout === "flush"}
				key={value}
				value={value}
			>
				{panel}
			</SettingsScrollingPanel>
		),
	)

type SettingsRailProps = {
	iconsOnly: boolean
	leading?: ReactNode
	trailing?: ReactNode
	children: ReactNode
	className?: string
}

const SettingsRail = ({
	iconsOnly,
	leading,
	trailing,
	children,
	className,
}: SettingsRailProps) => {
	const list = useRef<HTMLDivElement>(null)
	useOverlayScrollbars(list)

	return (
		<div
			className={cn(
				"flex shrink-0 flex-col gap-1 overflow-hidden border-border border-r p-2",
				iconsOnly ? "w-14" : "w-52",
				className,
			)}
			data-slot="settings-rail"
		>
			{leading}
			<Tabs.List
				className="flex min-h-0 flex-col gap-1 overflow-y-auto"
				ref={list}
			>
				{children}
			</Tabs.List>
			{trailing}
		</div>
	)
}

export {
	DANGER_RAIL_ITEM_CLASS,
	RAIL_ITEM_CLASS,
	RAIL_LABELS_MIN_WIDTH,
	SETTINGS_PANEL_CLASS,
	type SettingsEntry,
	SettingsEntryPanels,
	SettingsRail,
	SettingsRailBack,
	SettingsRailEntries,
	SettingsRailItem,
	type SettingsRailProps,
	SettingsRailSeparator,
	SettingsScrollingPanel,
}
