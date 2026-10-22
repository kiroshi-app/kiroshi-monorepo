import { useRef } from "react"
import { useTranslation } from "react-i18next"

import {
	type AppSidebarBot,
	type AppSidebarSection,
	botPreviewOf,
	isBusy,
} from "@workspace/ui/components/app-sidebar-model"
import {
	BotRowAvatar,
	InsertionLine,
	missionStripsOf,
	ROW_ITEM,
	type RosterRowSlot,
} from "@workspace/ui/components/app-sidebar-roster-parts"
import { BotTitleBadge } from "@workspace/ui/components/bot-badge"
import { CompanionMenuContent } from "@workspace/ui/components/companion-menu"
import type { RosterPinActions } from "@workspace/ui/components/roster-menu-items"
import { SidebarListRow } from "@workspace/ui/components/sidebar-list-row"
import type { Space } from "@workspace/ui/components/space"
import {
	ContextMenu,
	ContextMenuTrigger,
} from "@workspace/ui/components/ui/context-menu"
import { SidebarMenuItem } from "@workspace/ui/components/ui/sidebar"
import { dropArea, type Lifter } from "@workspace/ui/hooks/use-roster-lift"
import { mergeRefs } from "@workspace/ui/lib/utils"

const rowButtonOf = (row: HTMLElement | null) =>
	row?.querySelector<HTMLElement>('[data-slot="sidebar-menu-button"]') ?? null

const sidebarRegionOf = (row: HTMLElement | null) => {
	const region = row?.closest<HTMLElement>('[data-slot="sidebar-content"]')
	if (!region) return null
	region.tabIndex = -1
	return region
}

interface BotRosterRowProps extends RosterRowSlot, RosterPinActions {
	bot: AppSidebarBot
	isSelected: boolean
	spaces: Space[]
	memberships: string[]
	sections: AppSidebarSection[]
	openSpaceId?: string
	onSelect?: (id: string) => void
	onEdit?: (id: string) => void
	onDuplicate?: (id: string) => void
	onAddToSpace?: (botId: string, spaceId: string) => void
	onRemoveFromSpace?: (botId: string, spaceId: string) => void
	onDelete?: (id: string) => void
	onMoveToSection?: (id: string, sectionId: string | null) => void
	onCreateSectionFor?: (id: string) => void
	lift: Lifter
}

const BotRosterRow = ({
	bot,
	isSelected,
	spaces,
	memberships,
	sections,
	openSpaceId,
	lift,
	insertion,
	slotRef,
	isPinned,
	onPin,
	onUnpin,
	onSelect,
	onEdit,
	onDuplicate,
	onAddToSpace,
	onRemoveFromSpace,
	onDelete,
	onMoveToSection,
	onCreateSectionFor,
}: BotRosterRowProps) => {
	const { t } = useTranslation("bots")
	const working = isBusy(bot)
	const rowRef = useRef<HTMLElement | null>(null)

	const focusAfterClose = useRef<HTMLElement | null>(null)

	const leaveSpace = (botId: string, spaceId: string) => {
		focusAfterClose.current =
			spaceId === openSpaceId ? sidebarRegionOf(rowRef.current) : null
		onRemoveFromSpace?.(botId, spaceId)
	}

	const keepFocusAfterClose = () =>
		focusAfterClose.current ?? rowButtonOf(rowRef.current) ?? true

	return (
		<SidebarMenuItem
			{...(isPinned ? dropArea(bot.id) : undefined)}
			className={ROW_ITEM}
			data-tauri-drag-region="false"
			ref={mergeRefs<HTMLElement>(rowRef, slotRef)}
		>
			<InsertionLine edge={insertion} />
			<ContextMenu>
				<ContextMenuTrigger>
					<SidebarListRow
						{...lift.handlersFor(bot.id)}
						badge={bot.badge}
						isActive={isSelected}
						isWorking={working}
						media={<BotRowAvatar bot={bot} />}
						name={bot.name}
						onSelect={() => {
							if (lift.hasJustDropped()) return
							onSelect?.(bot.id)
						}}
						preview={botPreviewOf(t, bot)}
						strips={missionStripsOf(bot.missions)}
						timestamp={bot.timestamp ?? ""}
						trailing={
							<BotTitleBadge data-slot="roster-row-badge" title={bot.title} />
						}
					/>
				</ContextMenuTrigger>
				<CompanionMenuContent
					companion={bot}
					finalFocus={keepFocusAfterClose}
					isPinned={isPinned}
					memberships={memberships}
					onAddToSpace={onAddToSpace}
					onCreateSectionFor={onCreateSectionFor}
					onDelete={onDelete}
					onDuplicate={onDuplicate}
					onEdit={onEdit}
					onMoveToSection={onMoveToSection}
					onPin={onPin}
					onRemoveFromSpace={leaveSpace}
					onUnpin={onUnpin}
					openSpaceId={openSpaceId}
					sections={sections}
					spaces={spaces}
				/>
			</ContextMenu>
		</SidebarMenuItem>
	)
}

export { BotRosterRow }
