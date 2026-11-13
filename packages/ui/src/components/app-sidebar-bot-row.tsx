import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import {
	type AppSidebarBot,
	type AppSidebarSection,
	botPreviewOf,
	isBusy,
} from "@workspace/ui/components/app-sidebar-model"
import {
	BotRowAvatar,
	missionStripsOf,
	type RosterRowSlot,
	rosterRowSlotOf,
} from "@workspace/ui/components/app-sidebar-roster-parts"
import { BotTitleBadge } from "@workspace/ui/components/bot-badge"
import {
	COMPACT_LEAD_SIDE,
	COMPACT_ROW_STACK,
	useIsCompactRows,
} from "@workspace/ui/components/compact-rows"
import { CompanionMenuContent } from "@workspace/ui/components/companion-menu"
import {
	MissionCapsuleList,
	type MissionOpening,
} from "@workspace/ui/components/mission-capsule"
import type { RosterPinActions } from "@workspace/ui/components/roster-menu-items"
import { SidebarListRow } from "@workspace/ui/components/sidebar-list-row"
import type { SidebarClickModifiers } from "@workspace/ui/components/sidebar-menu-row"
import type { Space } from "@workspace/ui/components/space"
import {
	ContextMenu,
	ContextMenuTrigger,
} from "@workspace/ui/components/ui/context-menu"
import { SidebarMenuItem } from "@workspace/ui/components/ui/sidebar"
import { dropArea, type Lifter } from "@workspace/ui/hooks/use-roster-lift"
import { mergeRefs } from "@workspace/ui/lib/utils"

const TITLE_BADGE =
	"rounded-sm p-1 font-normal text-[11px] text-soft-foreground leading-3"

const rowButtonOf = (row: HTMLElement | null) =>
	row?.querySelector<HTMLElement>('[data-slot="sidebar-menu-button"]') ?? null

const sidebarRegionOf = (row: HTMLElement | null) => {
	const region = row?.closest<HTMLElement>('[data-slot="sidebar-content"]')
	if (!region) return null
	region.tabIndex = -1
	return region
}

interface BotRosterRowProps
	extends RosterRowSlot,
		RosterPinActions,
		MissionOpening {
	bot: AppSidebarBot
	isSelected: boolean
	spaces: Space[]
	memberships: string[]
	sections: AppSidebarSection[]
	openSpaceId?: string
	onSelect?: (id: string, modifiers?: SidebarClickModifiers) => void
	onOpenInNewTab?: (id: string) => void
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
	shift,
	isSliding,
	isLifted,
	onMoveKey,
	keepFocus,
	isPinned,
	onPin,
	onUnpin,
	onSelect,
	onOpenInNewTab,
	onEdit,
	onDuplicate,
	onAddToSpace,
	onRemoveFromSpace,
	onDelete,
	onMoveToSection,
	onCreateSectionFor,
	openMissionId,
	onOpenMission,
}: BotRosterRowProps) => {
	const { t } = useTranslation("bots")
	const working = isBusy(bot)
	const isCompact = useIsCompactRows()
	const [isMenuOpen, setIsMenuOpen] = useState(false)
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
			{...rosterRowSlotOf(bot.id, {
				isLifted,
				isPinned,
				isSliding,
				onMoveKey,
				shift,
			})}
			data-tauri-drag-region="false"
			ref={mergeRefs<HTMLElement>(rowRef, (node) => keepFocus?.(bot.id, node))}
		>
			<ContextMenu onOpenChange={setIsMenuOpen}>
				<ContextMenuTrigger
					className={isCompact ? COMPACT_ROW_STACK : undefined}
				>
					<SidebarListRow
						{...lift.handlersFor(bot.id)}
						isLiftable
						badge={bot.badge}
						geometry={isCompact ? "compact" : "agent"}
						hasRowTooltip
						isActive={isSelected}
						isMiddleClickSelectable
						isTooltipHidden={isLifted || isMenuOpen}
						isWorking={working}
						media={
							<BotRowAvatar
								bot={bot}
								size={isCompact ? COMPACT_LEAD_SIDE : undefined}
							/>
						}
						name={bot.name}
						onSelect={(modifiers) => {
							if (lift.hasJustDropped()) return
							onSelect?.(bot.id, modifiers)
						}}
						pendingQuestion={bot.pendingQuestion}
						preview={botPreviewOf(t, bot)}
						strips={missionStripsOf(bot.missions)}
						timestamp={bot.timestamp ?? ""}
						trailing={
							<BotTitleBadge
								className={TITLE_BADGE}
								data-slot="roster-row-badge"
								title={bot.title}
							/>
						}
					/>
					{isCompact ? (
						<MissionCapsuleList
							isTooltipHidden={isLifted || isMenuOpen}
							missions={bot.missions}
							onOpenMission={onOpenMission}
							openMissionId={openMissionId}
						/>
					) : null}
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
					onOpenInNewTab={onOpenInNewTab}
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
