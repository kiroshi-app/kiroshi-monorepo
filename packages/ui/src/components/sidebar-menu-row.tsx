"use client"

import type {
	AriaAttributes,
	ComponentProps,
	HTMLAttributes,
	ReactNode,
} from "react"

import { TooltipHint } from "@workspace/ui/components/tooltip-hint"
import {
	SidebarMenuButton,
	useSidebar,
} from "@workspace/ui/components/ui/sidebar"
import { cn } from "@workspace/ui/lib/utils"

const ROW =
	"h-auto min-h-9 select-none items-center gap-2.5 rounded-lg px-3 font-medium text-sidebar-foreground/70 group-data-[collapsible=icon]:min-h-11 group-data-[collapsible=icon]:min-w-11 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0"

const ROW_WITH_ICON = "ps-2"

const ROW_STACKED = "flex-col items-stretch gap-1 pe-1.5"

const HEAD = "flex min-h-9 min-w-0 items-center gap-2.5 pe-1.5"

const ICON_SLOT =
	"grid min-h-5 min-w-5 shrink-0 place-items-center [&_svg]:size-full!"

const LABEL_SLOT =
	"min-w-0 flex-1 truncate group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:w-0 group-data-[collapsible=icon]:flex-none"

type SidebarMenuRowElementProps = AriaAttributes &
	Pick<
		HTMLAttributes<HTMLElement>,
		"onPointerCancel" | "onPointerDown" | "onPointerMove" | "onPointerUp"
	>

interface SidebarMenuRowProps extends SidebarMenuRowElementProps {
	label: string
	children: ReactNode
	below?: ReactNode
	icon?: ReactNode
	isIconDecorative?: boolean
	isActive?: boolean
	onSelect?: () => void
	className?: string
	render?: ComponentProps<typeof SidebarMenuButton>["render"]
}

const SidebarMenuRow = ({
	label,
	children,
	below,
	icon,
	isIconDecorative = true,
	isActive = false,
	onSelect,
	className,
	render,
	...elementProps
}: SidebarMenuRowProps) => {
	const { isMobile, setOpenMobile, state } = useSidebar()
	const isCollapsed = !isMobile && state === "collapsed"

	const head = (
		<>
			{icon ? (
				<span aria-hidden={isIconDecorative || undefined} className={ICON_SLOT}>
					{icon}
				</span>
			) : null}
			<span aria-hidden={isCollapsed} className={LABEL_SLOT}>
				{children}
			</span>
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
				className,
			)}
			data-slot="sidebar-menu-button"
			isActive={isActive}
			onClick={() => {
				onSelect?.()
				if (isMobile) setOpenMobile(false)
			}}
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

export { SidebarMenuRow, type SidebarMenuRowProps }
