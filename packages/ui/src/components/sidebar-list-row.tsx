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

type SidebarListRowGeometry = "roster" | "menu"

const ROW: Record<SidebarListRowGeometry, string> = {
	roster:
		"flex-nowrap border-0 py-1.5 pl-1.5 transition-[width,height,padding,scale] will-change-transform focus-visible:ring-sidebar-ring active:scale-[0.98] aria-expanded:bg-sidebar-accent/70 group-data-[collapsible=icon]:pl-0",
	menu: "flex-nowrap gap-2 rounded-control border-0 py-0 ps-1.5 pe-2 font-normal text-muted-foreground text-sm hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
}

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
	preview?: ReactNode
	previewTrailing?: ReactNode
	detail?: ReactNode
	isWorking?: boolean
	isNameMuted?: boolean
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
	preview,
	previewTrailing,
	detail,
	isWorking = false,
	isNameMuted = false,
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
			className={ROW[geometry]}
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
				timestampSlot="roster-row-timestamp"
				trailing={trailing}
			/>
		</SidebarMenuRow>
	)
}

export { SidebarListRow }
