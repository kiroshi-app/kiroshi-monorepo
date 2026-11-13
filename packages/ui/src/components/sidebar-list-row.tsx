"use client"

import type { ReactNode } from "react"

import { isNeedingYou } from "@workspace/ui/components/app-sidebar-model"
import type { BotBadge } from "@workspace/ui/components/bot-badge"
import {
	CompactRowMeta,
	CompactRowTitle,
	RowAnatomy,
} from "@workspace/ui/components/row-anatomy"
import {
	SIDEBAR_ROW_INSET,
	SidebarMenuRow,
	type SidebarMenuRowProps,
} from "@workspace/ui/components/sidebar-menu-row"
import { Item } from "@workspace/ui/components/ui/item"
import { useSidebar } from "@workspace/ui/components/ui/sidebar"
import { cn } from "@workspace/ui/lib/utils"

type StackedRowGeometry = "roster" | "agent" | "conversation" | "menu"

type SidebarListRowGeometry = StackedRowGeometry | "compact"

const ROSTER_ROW =
	"flex-nowrap border-0 text-foreground transition-[scale] duration-160 ease-out hover:will-change-transform focus-visible:ring-sidebar-ring active:scale-[0.98] aria-expanded:bg-sidebar-accent/70 *:data-[slot=sidebar-menu-head]:pe-0 group-data-[collapsible=icon]:pl-0 group-data-[collapsible=icon]:pe-0"

const ROW: Record<StackedRowGeometry, string> = {
	roster: cn(ROSTER_ROW, "py-1.5 pl-1.5 pe-1.5"),
	agent: cn(ROSTER_ROW, SIDEBAR_ROW_INSET),
	conversation: cn(
		SIDEBAR_ROW_INSET,
		"flex-nowrap border-0 text-foreground hover:bg-transparent active:bg-transparent data-active:bg-transparent after:absolute after:inset-0 focus-visible:ring-sidebar-ring *:data-[slot=sidebar-menu-head]:pe-0 group-data-[collapsible=icon]:p-0",
	),
	menu: "flex-nowrap gap-2 rounded-control border-0 py-0 ps-1.5 pe-2 font-normal text-muted-foreground text-sm hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
}

const COMPACT_ROW =
	"hover:**:data-[slot=conversation-subject-icon]:text-sidebar-foreground data-active:**:data-[slot=conversation-subject-icon]:text-sidebar-foreground"

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

	if (geometry === "compact") {
		const needsYou = isNeedingYou({ badge, pendingQuestion })

		return (
			<SidebarMenuRow
				{...rowProps}
				className={cn(COMPACT_ROW, isLiftable && LIFTABLE_ROW)}
				icon={media}
				label={name}
				render={<button type="button" />}
				trailing={
					<CompactRowMeta
						isNeedingYou={needsYou}
						isTimestampDestructive={isTimestampDestructive}
						pile={previewTrailing}
						timestamp={timestamp}
					/>
				}
				variant="compact"
			>
				<CompactRowTitle
					isNeedingYou={needsYou}
					isWorking={isWorking}
					name={name}
				/>
			</SidebarMenuRow>
		)
	}

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
