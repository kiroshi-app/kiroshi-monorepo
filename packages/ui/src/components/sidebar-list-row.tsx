"use client"

import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import type { BotBadge } from "@workspace/ui/components/bot-badge"
import { Icons } from "@workspace/ui/components/icons"
import { RowAnatomy } from "@workspace/ui/components/row-anatomy"
import {
	SidebarMenuRow,
	type SidebarMenuRowProps,
} from "@workspace/ui/components/sidebar-menu-row"
import { Item } from "@workspace/ui/components/ui/item"
import {
	SidebarMenuAction,
	useSidebar,
} from "@workspace/ui/components/ui/sidebar"

const ROW =
	"flex-nowrap border-0 py-1.5 pl-1.5 transition-[width,height,padding,scale] will-change-transform focus-visible:ring-sidebar-ring active:scale-[0.98] aria-expanded:bg-sidebar-accent/70 group-data-[collapsible=icon]:pl-0"

const STRIPS = "flex flex-col gap-1"

const STOP = "top-1 right-3 w-6 peer-data-[size=default]/menu-button:top-1"

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
	strips?: ReactNode
	onStop?: () => void
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
	strips,
	onStop,
	...rowProps
}: SidebarListRowProps) => {
	const { t } = useTranslation("chat")
	const { state } = useSidebar()
	const isExpanded = state !== "collapsed"
	const hasStrips = Boolean(strips) && isExpanded
	const canStop = isWorking && onStop !== undefined && isExpanded

	return (
		<>
			<SidebarMenuRow
				{...rowProps}
				below={
					hasStrips ? (
						<span className={STRIPS} data-slot="roster-row-missions">
							{strips}
						</span>
					) : undefined
				}
				className={ROW}
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
					preview={preview}
					previewSlot="roster-row-preview"
					previewTrailing={previewTrailing}
					timestamp={canStop ? "" : timestamp}
					timestampSlot="roster-row-timestamp"
					trailing={trailing}
				/>
			</SidebarMenuRow>
			{canStop ? (
				<SidebarMenuAction
					aria-label={t("working.stop", { name })}
					className={STOP}
					data-sidebar="roster-row-stop"
					data-slot="roster-row-stop"
					onClick={onStop}
					type="button"
				>
					<Icons.Stop aria-hidden="true" />
				</SidebarMenuAction>
			) : null}
		</>
	)
}

export { SidebarListRow }
