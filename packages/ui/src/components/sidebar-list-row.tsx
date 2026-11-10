"use client"

import type { ReactNode } from "react"

import type { BotBadge } from "@workspace/ui/components/bot-badge"
import { RowAnatomy } from "@workspace/ui/components/row-anatomy"
import {
	SidebarMenuRow,
	type SidebarMenuRowProps,
} from "@workspace/ui/components/sidebar-menu-row"
import { Item } from "@workspace/ui/components/ui/item"
import { useSidebar } from "@workspace/ui/components/ui/sidebar"
import { cn } from "@workspace/ui/lib/utils"

type SidebarListRowGeometry = "roster" | "surfaced" | "menu"

const ROW: Record<SidebarListRowGeometry, string> = {
	roster:
		"flex-nowrap border-0 py-1.5 pl-1.5 pe-1.5 transition-[width,height,padding,scale] will-change-transform focus-visible:ring-sidebar-ring active:scale-[0.98] aria-expanded:bg-sidebar-accent/70 *:data-[slot=sidebar-menu-head]:pe-0 group-data-[collapsible=icon]:pl-0 group-data-[collapsible=icon]:pe-0",
	surfaced:
		"flex-nowrap rounded-lg border-0 bg-transparent p-0 transition-[width,height,padding] after:absolute after:inset-0 after:rounded-lg hover:bg-transparent focus-visible:ring-0 focus-visible:after:ring-2 focus-visible:after:ring-sidebar-ring active:bg-transparent aria-expanded:bg-transparent data-active:bg-transparent data-open:hover:bg-transparent",
	menu: "flex-nowrap gap-2 rounded-control border-0 py-0 ps-1.5 pe-2 font-normal text-muted-foreground text-sm hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
}

const LIFTABLE_ROW = "touch-none select-none"

const STRIPS = "flex flex-col gap-1"

type SidebarListRowElementProps = Omit<
	SidebarMenuRowProps,
	| "label"
	| "children"
	| "below"
	| "icon"
	| "isIconDecorative"
	| "className"
	| "render"
>

interface SidebarListRowProps extends SidebarListRowElementProps {
	name: string
	media?: ReactNode
	trailing?: ReactNode
	timestamp?: string
	isTimestampDestructive?: boolean
	preview?: ReactNode
	previewTrailing?: ReactNode
	detail?: ReactNode
	isWorking?: boolean
	isNameMuted?: boolean
	isLiftable?: boolean
	badge?: BotBadge
	pendingQuestion?: string
	strips?: ReactNode
	geometry?: SidebarListRowGeometry
	"data-opens"?: string
}

const SidebarListRow = ({
	name,
	media,
	trailing,
	timestamp,
	isTimestampDestructive,
	preview,
	previewTrailing,
	detail,
	isWorking = false,
	isNameMuted = false,
	isLiftable = false,
	badge,
	pendingQuestion,
	strips,
	geometry = "roster",
	...rowProps
}: SidebarListRowProps) => {
	const { state } = useSidebar()
	const hasStrips = Boolean(strips) && state !== "collapsed"

	return (
		<SidebarMenuRow
			{...rowProps}
			below={
				hasStrips ? (
					<span className={STRIPS} data-slot="roster-row-missions">
						{strips}
					</span>
				) : undefined
			}
			className={cn(ROW[geometry], isLiftable && LIFTABLE_ROW)}
			icon={media}
			isIconDecorative={false}
			label={name}
			render={<Item render={<button type="button" />} />}
		>
			<RowAnatomy
				badge={badge}
				detail={detail}
				geometry="roster"
				isNameMuted={isNameMuted}
				isWorking={isWorking}
				name={name}
				nameSlot="roster-row-name"
				pendingQuestion={pendingQuestion}
				preview={preview}
				previewSlot="roster-row-preview"
				previewTrailing={previewTrailing}
				timestamp={timestamp}
				isTimestampDestructive={isTimestampDestructive}
				timestampSlot="roster-row-timestamp"
				trailing={trailing}
			/>
		</SidebarMenuRow>
	)
}

export { SidebarListRow }
