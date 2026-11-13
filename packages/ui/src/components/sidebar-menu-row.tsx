"use client"

import {
	type AriaAttributes,
	type ComponentProps,
	type HTMLAttributes,
	type MouseEvent,
	type ReactNode,
	useId,
	useRef,
} from "react"

import {
	describeSidebarRowTooltip,
	SidebarRowTooltip,
	type SidebarRowTooltipFields,
} from "@workspace/ui/components/sidebar-row-tooltip"
import { TooltipHint } from "@workspace/ui/components/tooltip-hint"
import {
	SidebarMenuButton,
	useSidebar,
} from "@workspace/ui/components/ui/sidebar"
import {
	type ClickModifiers,
	middleClickHandlers,
	modifiersOf,
	NO_CLICK_MODIFIERS,
} from "@workspace/ui/lib/click-modifiers"
import { cn } from "@workspace/ui/lib/utils"

const ROW =
	"h-auto min-h-9 select-none items-center gap-2.5 rounded-lg px-3 font-medium text-sidebar-foreground/70 group-data-[collapsible=icon]:min-h-11 group-data-[collapsible=icon]:min-w-11 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0"

const ROW_WITH_ICON = "ps-2"

const ROW_STACKED = "flex-col items-stretch gap-1 pe-1.5"

const HEAD = "flex min-h-9 min-w-0 items-center gap-2.5 pe-1.5"

const ICON_SLOT =
	"grid min-h-5 min-w-5 shrink-0 place-items-center [&_svg]:size-full!"

const SIDEBAR_ROW_INSET = "p-2"

const SIDEBAR_COLUMN = "flex min-h-0 shrink-0 flex-col gap-2 p-2"

const SIDEBAR_GLYPH_BOX = "h-5 w-7"

const SIDEBAR_AVATAR_SIDE = 28

const NAVIGATION_ROW =
	"h-7.5 min-h-7.5 gap-2 rounded-sm p-1.5 font-normal text-sm leading-4.5 hover:bg-sidebar-hover focus-visible:ring-2 focus-visible:ring-inset active:bg-sidebar-hover data-active:bg-sidebar-selected data-active:font-normal data-active:active:bg-sidebar-selected data-active:hover:bg-sidebar-selected"

const NAVIGATION_ICON_SLOT =
	"grid size-4.5 shrink-0 place-items-center text-muted-foreground [&>svg]:stroke-[1.75]! [&_svg]:size-full!"

const NAVIGATION_LABEL =
	"text-soft-foreground group-data-active/menu-button:text-foreground"

const COMPACT_ROW = cn(
	NAVIGATION_ROW,
	"text-muted-foreground hover:text-sidebar-foreground data-active:text-sidebar-foreground",
)

const LABEL_SLOT =
	"min-w-0 flex-1 truncate group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:w-0 group-data-[collapsible=icon]:flex-none"

const SIDEBAR_BOX = '[data-slot="sidebar-container"], [data-slot="sidebar"]'

const GAP_PAST_SIDEBAR_EDGE = 4

const offsetPastSidebarEdge = (row: HTMLElement | null) => {
	const sidebar = row?.closest(SIDEBAR_BOX)
	if (!row || !sidebar) return GAP_PAST_SIDEBAR_EDGE

	return (
		sidebar.getBoundingClientRect().right -
		row.getBoundingClientRect().right +
		GAP_PAST_SIDEBAR_EDGE
	)
}

type SidebarClickModifiers = ClickModifiers

type SidebarMenuRowElementProps = AriaAttributes &
	Pick<
		HTMLAttributes<HTMLElement>,
		"onPointerCancel" | "onPointerDown" | "onPointerMove" | "onPointerUp"
	>

type SidebarMenuRowVariant = "row" | "navigation" | "compact"

type VariantClasses = {
	row?: string
	iconSlot: string
	label?: string
}

const VARIANT: Record<SidebarMenuRowVariant, VariantClasses> = {
	row: { iconSlot: ICON_SLOT },
	navigation: {
		row: NAVIGATION_ROW,
		iconSlot: NAVIGATION_ICON_SLOT,
		label: NAVIGATION_LABEL,
	},
	compact: { row: COMPACT_ROW, iconSlot: NAVIGATION_ICON_SLOT },
}

interface SidebarMenuRowProps extends SidebarMenuRowElementProps {
	label: string
	children: ReactNode
	below?: ReactNode
	icon?: ReactNode
	trailing?: ReactNode
	variant?: SidebarMenuRowVariant
	isIconDecorative?: boolean
	isActive?: boolean
	isMiddleClickSelectable?: boolean
	tooltip?: SidebarRowTooltipFields
	isTooltipHidden?: boolean
	onSelect?: (modifiers: SidebarClickModifiers) => void
	className?: string
	render?: ComponentProps<typeof SidebarMenuButton>["render"]
}

const SidebarMenuRow = ({
	label,
	children,
	below,
	icon,
	trailing,
	variant = "row",
	isIconDecorative = true,
	isActive = false,
	isMiddleClickSelectable = false,
	tooltip,
	isTooltipHidden = false,
	onSelect,
	className,
	render,
	...elementProps
}: SidebarMenuRowProps) => {
	const { isMobile, setOpenMobile, state } = useSidebar()
	const rowRef = useRef<HTMLButtonElement>(null)
	const descriptionId = useId()
	const isCollapsed = !isMobile && state === "collapsed"
	const classes = VARIANT[variant]

	const select = (event: MouseEvent) => {
		onSelect?.(modifiersOf(event))
		if (isMobile) setOpenMobile(false)
	}

	const head = (
		<>
			{icon ? (
				<span
					aria-hidden={isIconDecorative || undefined}
					className={classes.iconSlot}
				>
					{icon}
				</span>
			) : null}
			<span aria-hidden={isCollapsed} className={cn(LABEL_SLOT, classes.label)}>
				{children}
			</span>
			{trailing}
		</>
	)

	const row = (
		<SidebarMenuButton
			{...elementProps}
			aria-current={isActive ? "page" : elementProps["aria-current"]}
			aria-describedby={
				tooltip ? descriptionId : elementProps["aria-describedby"]
			}
			aria-label={isCollapsed ? label : undefined}
			className={cn(
				ROW,
				icon && ROW_WITH_ICON,
				below && ROW_STACKED,
				classes.row,
				className,
			)}
			data-slot="sidebar-menu-button"
			{...(isMiddleClickSelectable ? middleClickHandlers(select) : {})}
			isActive={isActive}
			onClick={select}
			ref={rowRef}
			render={render}
		>
			{below ? (
				<>
					<span className={HEAD} data-slot="sidebar-menu-head">
						{head}
					</span>
					{below}
				</>
			) : (
				head
			)}
		</SidebarMenuButton>
	)

	if (!tooltip)
		return (
			<TooltipHint content={isCollapsed ? label : null} side="right">
				{row}
			</TooltipHint>
		)

	return (
		<>
			<TooltipHint
				content={isTooltipHidden ? null : <SidebarRowTooltip {...tooltip} />}
				side="right"
				sideOffset={() => offsetPastSidebarEdge(rowRef.current)}
				variant="card"
			>
				{row}
			</TooltipHint>
			<span hidden id={descriptionId}>
				{describeSidebarRowTooltip(tooltip)}
			</span>
		</>
	)
}

export {
	NO_CLICK_MODIFIERS,
	SIDEBAR_AVATAR_SIDE,
	SIDEBAR_COLUMN,
	SIDEBAR_GLYPH_BOX,
	SIDEBAR_ROW_INSET,
	type SidebarClickModifiers,
	SidebarMenuRow,
	type SidebarMenuRowProps,
}
