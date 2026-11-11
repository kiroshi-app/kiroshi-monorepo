"use client"

import type {
	AriaAttributes,
	ComponentProps,
	HTMLAttributes,
	MouseEvent,
	ReactNode,
} from "react"

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

const NAVIGATION_ROW = cn(
	SIDEBAR_ROW_INSET,
	"gap-2.5 rounded-lg font-normal text-soft-foreground hover:bg-rail-item-selected/50 hover:text-foreground active:bg-rail-item-selected active:text-foreground data-active:bg-rail-item-selected data-active:font-normal data-active:text-foreground data-active:hover:bg-rail-item-selected-hover",
)

const NAVIGATION_ICON_SLOT =
	"grid h-5 w-7 shrink-0 place-items-center [&_svg]:size-3.5! [&_svg]:stroke-[1.75]!"

const LABEL_SLOT =
	"min-w-0 flex-1 truncate group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:w-0 group-data-[collapsible=icon]:flex-none"

type SidebarClickModifiers = ClickModifiers

type SidebarMenuRowElementProps = AriaAttributes &
	Pick<
		HTMLAttributes<HTMLElement>,
		"onPointerCancel" | "onPointerDown" | "onPointerMove" | "onPointerUp"
	>

type SidebarMenuRowVariant = "row" | "navigation"

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
	onSelect,
	className,
	render,
	...elementProps
}: SidebarMenuRowProps) => {
	const { isMobile, setOpenMobile, state } = useSidebar()
	const isCollapsed = !isMobile && state === "collapsed"
	const isNavigation = variant === "navigation"

	const select = (event: MouseEvent) => {
		onSelect?.(modifiersOf(event))
		if (isMobile) setOpenMobile(false)
	}

	const head = (
		<>
			{icon ? (
				<span
					aria-hidden={isIconDecorative || undefined}
					className={isNavigation ? NAVIGATION_ICON_SLOT : ICON_SLOT}
				>
					{icon}
				</span>
			) : null}
			<span aria-hidden={isCollapsed} className={LABEL_SLOT}>
				{children}
			</span>
			{trailing}
		</>
	)

	const row = (
		<SidebarMenuButton
			{...elementProps}
			aria-current={isActive ? "page" : elementProps["aria-current"]}
			aria-label={isCollapsed ? label : undefined}
			className={cn(
				ROW,
				icon && ROW_WITH_ICON,
				below && ROW_STACKED,
				isNavigation && NAVIGATION_ROW,
				className,
			)}
			data-slot="sidebar-menu-button"
			{...(isMiddleClickSelectable ? middleClickHandlers(select) : {})}
			isActive={isActive}
			onClick={select}
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

	return (
		<TooltipHint content={isCollapsed ? label : null} side="right">
			{row}
		</TooltipHint>
	)
}

export {
	NO_CLICK_MODIFIERS,
	SIDEBAR_ROW_INSET,
	type SidebarClickModifiers,
	SidebarMenuRow,
	type SidebarMenuRowProps,
}
